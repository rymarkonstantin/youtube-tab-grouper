import { categoryResolver as defaultCategoryResolver } from "../../shared/categoryResolver";
import { adaptBackgroundResolveCategoryInput } from "../../shared/categoryResolver/adapters";
import { computeEnabledColors } from "../../shared/settings";
import type { Metadata, Settings } from "../../shared/types";
import { toErrorMessage } from "../../shared/utils/errorUtils";
import { AVAILABLE_COLORS } from "../constants";
import { chromeApiClient as defaultApiClient } from "../infra/chromeApiClient";
import { logError, logWarn, toErrorEnvelope } from "../logger";
import { getVideoMetadata as defaultGetVideoMetadata } from "../metadataFetcher";
import { colorAssigner as defaultColorAssigner } from "./colorAssigner";
import { groupStateRepository as defaultGroupStateRepository } from "../repositories/groupStateRepository";
import { statsRepository as defaultStatsRepository } from "../repositories/statsRepository";
import { CleanupCoordinator } from "./cleanupCoordinator";
import { GroupStateCoordinator } from "./groupStateCoordinator";
import { InMemoryLockManager } from "./inMemoryLockManager";
import { StatsTracker } from "./statsTracker";
import type {
  CategoryResolverPort,
  ChromeTabGroupingPort,
  CleanupCoordinatorPort,
  ColorAssignerPort,
  GroupStateCoordinatorPort,
  LockManagerPort,
  MetadataFetcherPort,
  StatsTrackerPort,
  TabGroupingPorts
} from "../ports/tabGrouping";

/**
 * Coordinates tab grouping using injected ports. Callers are expected to pass tabs that include both
 * `id` and `windowId` values and to supply port implementations that reject on failure so the service
 * can handle errors consistently. The lock manager should serialize work per category to prevent
 * duplicate grouping while storage ports persist the latest grouping and stats snapshots.
 */
export class TabGroupingService {
  private apiClient: ChromeTabGroupingPort;
  private colorAssigner: ColorAssignerPort;
  private groupStateCoordinator: GroupStateCoordinatorPort;
  private statsTracker: StatsTrackerPort;
  private metadataFetcher: MetadataFetcherPort;
  private categoryResolver: CategoryResolverPort;
  private lockManager: LockManagerPort;
  private cleanupCoordinator: CleanupCoordinatorPort;
  private defaultColors: readonly string[];

  constructor({
    chrome,
    colorAssigner,
    groupState,
    stats,
    metadata,
    categoryResolver,
    lockManager,
    cleanupCoordinator,
    defaultColors = AVAILABLE_COLORS
  }: TabGroupingPorts) {
    this.apiClient = chrome;
    this.colorAssigner = colorAssigner;
    this.groupStateCoordinator = groupState;
    this.statsTracker = stats;
    this.metadataFetcher = metadata;
    this.categoryResolver = categoryResolver;
    this.lockManager = lockManager;
    this.cleanupCoordinator = cleanupCoordinator;
    this.defaultColors = defaultColors;
  }

  async initialize() {
    await this.groupStateCoordinator.initialize();
  }

  async groupTab(tab: chrome.tabs.Tab, category: string, enabledColors: string[]) {
    if (tab.id === undefined || tab.windowId === undefined) {
      const missing = tab.id === undefined ? "id" : "windowId";
      throw new Error(`Cannot group tab without ${missing}`);
    }
    const { id: tabId, windowId } = tab;

    return this.lockManager.runExclusive(category, async () => {
      try {
        const color = await this.colorAssigner.assignColor(category, tabId, windowId, enabledColors);
        const { groupId } = await this.ensureGroupForCategory(tab, category, color);

        await this.groupStateCoordinator.persist(category, groupId, color);
        await this.statsTracker.recordGrouping(category);

        return { groupId, color };
      } catch (error) {
        const wrapped = toErrorEnvelope(error, (error as Error)?.message || "Failed to group tab");
        logError("grouping:groupTab failed", wrapped.message);
        throw wrapped;
      }
    });
  }

  async autoCleanupEmptyGroups(graceMs = 300000) {
    try {
      const groups = await this.apiClient.queryGroups({});

      for (const group of groups) {
        const tabs = await this.apiClient.queryTabs({ groupId: group.id });

        if (tabs.length === 0) {
          await this.tryCleanupGroup(group, graceMs);
        } else {
          this.cleanupCoordinator.clearPending(group.id);
        }
      }
    } catch (error) {
      logWarn("grouping:autoCleanupEmptyGroups skipped due to error", toErrorMessage(error));
    }
  }

  async handleGroupRemoved(groupId: number) {
    try {
      this.cleanupCoordinator.clearPending(groupId);
      await this.groupStateCoordinator.pruneGroup(groupId);
    } catch (error) {
      logWarn("grouping:handleGroupRemoved failed to persist cleanup", toErrorMessage(error));
    }
  }

  async handleGroupUpdated(group: chrome.tabGroups.TabGroup) {
    if (!group || typeof group !== "object") {
      return;
    }

    try {
      this.cleanupCoordinator.clearPending(group.id);
      await this.groupStateCoordinator.applyGroupUpdate(group);
    } catch (error) {
      logWarn("grouping:handleGroupUpdated failed to persist update", toErrorMessage(error));
    }
  }

  async resolveCategory(
    tab: chrome.tabs.Tab,
    settings: Settings,
    metadataOverride: Partial<Metadata> = {},
    requestedCategory = ""
  ) {
    if (tab.id === undefined) {
      throw new Error("Cannot resolve category for tab without id");
    }

    const fallbackMetadata = metadataOverride || {};
    const initialAdapter = adaptBackgroundResolveCategoryInput({
      tab,
      settings,
      metadata: metadataOverride,
      requestedCategory
    });

    if (initialAdapter.input.requestedCategory) {
      return initialAdapter.input.requestedCategory;
    }

    const metadata = await this.metadataFetcher(tab.id, {
      fallbackMetadata,
      fallbackTitle: initialAdapter.normalizeOptions.fallbackTitle
    });

    const adapted = adaptBackgroundResolveCategoryInput({
      tab,
      settings,
      metadata,
      fallbackMetadata,
      requestedCategory
    });

    return this.categoryResolver.resolve(adapted.input, adapted.normalizeOptions);
  }

  async groupTabs(tabs: chrome.tabs.Tab[], settings: Settings) {
    const errors: string[] = [];

    if (!settings.extensionEnabled) {
      return { count: 0, errors: ["Extension is disabled"] };
    }

    const enabledColors = computeEnabledColors(settings, this.defaultColors);
    let successCount = 0;

    for (const tab of tabs) {
      try {
        const category = await this.resolveCategory(tab, settings);
        await this.groupTab(tab, category, enabledColors);
        successCount += 1;
      } catch (error) {
        errors.push(toErrorMessage(error));
      }
    }

    return { count: successCount, errors };
  }

  private async ensureGroupForCategory(tab: chrome.tabs.Tab, category: string, color: string) {
    if (tab.windowId === undefined) {
      throw new Error("Tab missing windowId");
    }
    if (tab.id === undefined) {
      throw new Error("Tab missing id");
    }

    const groups = await this.apiClient.queryGroups({ title: category });
    const groupInWindow = groups.find((g) => g.windowId === tab.windowId);

    let groupId: number;
    if (groupInWindow) {
      groupId = groupInWindow.id;
      await this.apiClient.groupTabs(tab.id, groupId);
    } else {
      groupId = await this.apiClient.groupTabs(tab.id);
    }

    const groupColor: chrome.tabGroups.ColorEnum = color as chrome.tabGroups.ColorEnum;
    await this.apiClient.updateTabGroup(groupId, { title: category, color: groupColor });
    return { groupId, color };
  }

  private async isGroupActive(group: chrome.tabGroups.TabGroup) {
    try {
      const [activeTab] = await this.apiClient.queryTabs({ active: true, windowId: group.windowId });
      return activeTab?.groupId === group.id;
    } catch (error) {
      logWarn("grouping:isGroupActive check failed; assuming inactive", toErrorMessage(error));
      return false;
    }
  }

  private async isGroupEmpty(groupId: number) {
    const tabs = await this.apiClient.queryTabs({ groupId });
    return tabs.length === 0;
  }

  private async tryCleanupGroup(group: chrome.tabGroups.TabGroup, graceMs = 300000) {
    try {
      this.cleanupCoordinator.markPending(group.id);

      const pendingAt = this.cleanupCoordinator.getTimestamp(group.id) || 0;
      const elapsed = Date.now() - pendingAt;
      if (elapsed < Math.max(0, graceMs)) {
        return;
      }

      const [empty, active] = await Promise.all([this.isGroupEmpty(group.id), this.isGroupActive(group)]);

      if (active || !empty) {
        this.cleanupCoordinator.clearPending(group.id);
        return;
      }

      await this.apiClient.removeTabGroup(group.id);
      await this.groupStateCoordinator.pruneGroup(group.id);
      this.cleanupCoordinator.clearPending(group.id);
    } catch (error) {
      logWarn("grouping:tryCleanupGroup failed", toErrorMessage(error));
    }
  }
}

export const tabGroupingService = new TabGroupingService({
  chrome: defaultApiClient,
  colorAssigner: defaultColorAssigner,
  groupState: new GroupStateCoordinator(defaultGroupStateRepository, defaultColorAssigner),
  stats: new StatsTracker(defaultStatsRepository),
  metadata: defaultGetVideoMetadata,
  categoryResolver: defaultCategoryResolver,
  lockManager: new InMemoryLockManager(),
  cleanupCoordinator: new CleanupCoordinator(),
  defaultColors: AVAILABLE_COLORS
});

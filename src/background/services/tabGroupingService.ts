import { AVAILABLE_COLORS } from "../constants";
import { chromeApiClient as defaultApiClient } from "../infra/chromeApiClient";
import { colorAssigner as defaultColorAssigner } from "./colorAssigner";
import { groupStateRepository as defaultGroupStateRepository } from "../repositories/groupStateRepository";
import { statsRepository as defaultStatsRepository } from "../repositories/statsRepository";
import { logError, logWarn, toErrorEnvelope } from "../logger";
import { toErrorMessage } from "../../shared/utils/errorUtils";
import type { Settings } from "../../shared/types";

interface TabGroupingDependencies {
  apiClient?: typeof defaultApiClient;
  colorAssigner?: typeof defaultColorAssigner;
  groupStateRepository?: typeof defaultGroupStateRepository;
  statsRepository?: typeof defaultStatsRepository;
  defaultColors?: readonly string[];
}

export class TabGroupingService {
  private apiClient: typeof defaultApiClient;
  private colorAssigner: typeof defaultColorAssigner;
  private groupStateRepository: typeof defaultGroupStateRepository;
  private statsRepository: typeof defaultStatsRepository;
  private defaultColors: readonly string[];

  private groupColorMap: Record<string, string> = {};
  private groupIdMap: Record<string, number> = {};
  private pendingCleanup = new Map<number, number>();
  private locks = new Map<string, Promise<void>>();

  constructor({
    apiClient = defaultApiClient,
    colorAssigner = defaultColorAssigner,
    groupStateRepository = defaultGroupStateRepository,
    statsRepository = defaultStatsRepository,
    defaultColors = AVAILABLE_COLORS
  }: TabGroupingDependencies = {}) {
    this.apiClient = apiClient;
    this.colorAssigner = colorAssigner;
    this.groupStateRepository = groupStateRepository;
    this.statsRepository = statsRepository;
    this.defaultColors = defaultColors;
  }

  async initialize() {
    const { groupColorMap, groupIdMap } = await this.groupStateRepository.get();
    this.groupColorMap = { ...(groupColorMap || {}) };
    this.groupIdMap = { ...(groupIdMap || {}) };
    this.colorAssigner.setCache(this.groupColorMap);
  }

  async groupTab(tab: chrome.tabs.Tab, category: string, enabledColors: string[]) {
    if (tab.id === undefined || tab.windowId === undefined) {
      const missing = tab.id === undefined ? "id" : "windowId";
      throw new Error(`Cannot group tab without ${missing}`);
    }
    const { id: tabId, windowId } = tab;

    return this.runExclusive(category, async () => {
      try {
        const color = await this.colorAssigner.assignColor(category, tabId, windowId, enabledColors);
        const { groupId } = await this.ensureGroupForCategory(tab, category, color);

        await this.persistGroupingState(category, groupId, color);
        await this.recordGroupingStats(category);

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
          this.clearPendingCleanup(group.id);
        }
      }
    } catch (error) {
      logWarn("grouping:autoCleanupEmptyGroups skipped due to error", toErrorMessage(error));
    }
  }

  async handleGroupRemoved(groupId: number) {
    try {
      this.clearPendingCleanup(groupId);
      await this.pruneGroupState(groupId);
    } catch (error) {
      logWarn("grouping:handleGroupRemoved failed to persist cleanup", toErrorMessage(error));
    }
  }

  async handleGroupUpdated(group: chrome.tabGroups.TabGroup) {
    if (!group || typeof group !== "object") {
      return;
    }

    try {
      this.clearPendingCleanup(group.id);
      for (const [name, id] of Object.entries(this.groupIdMap)) {
        if (id === group.id && group.title && group.title !== name) {
          delete this.groupIdMap[name];
          delete this.groupColorMap[name];
          this.groupIdMap[group.title] = group.id;
          if (group.color) this.groupColorMap[group.title] = group.color;
        }
      }
      await this.groupStateRepository.save(this.groupColorMap, this.groupIdMap);
      this.colorAssigner.setCache(this.groupColorMap);
    } catch (error) {
      logWarn("grouping:handleGroupUpdated failed to persist update", toErrorMessage(error));
    }
  }

  static getEnabledColors(settings: Settings, fallbackColors: readonly string[] = AVAILABLE_COLORS) {
    const enabledColors: string[] = [];

    if (settings.enabledColors && typeof settings.enabledColors === "object") {
      enabledColors.push(
        ...Object.entries(settings.enabledColors)
          .filter(([, enabled]) => Boolean(enabled))
          .map(([color]) => color)
      );
    }

    if (enabledColors.length === 0) {
      enabledColors.push(...fallbackColors);
    }

    return enabledColors;
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

  private async persistGroupingState(category: string, groupId: number, color: string) {
    this.groupIdMap[category] = groupId;
    this.groupColorMap[category] = color;
    try {
      await this.groupStateRepository.save(this.groupColorMap, this.groupIdMap);
      this.colorAssigner.setCache(this.groupColorMap);
    } catch (error) {
      const err = new Error(`Failed to persist grouping state: ${toErrorMessage(error)}`);
      (err as { cause?: unknown }).cause = error;
      throw err;
    }
  }

  private async recordGroupingStats(category: string) {
    const stats = await this.statsRepository.get();
    stats.totalTabs = (stats.totalTabs || 0) + 1;
    stats.categoryCount[category] = (stats.categoryCount[category] || 0) + 1;
    try {
      await this.statsRepository.save(stats);
    } catch (error) {
      logWarn("grouping:recordGroupingStats failed to persist stats", toErrorMessage(error));
    }
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

  private async pruneGroupState(groupId: number) {
    let mutated = false;
    for (const [name, id] of Object.entries(this.groupIdMap)) {
      if (id === groupId) {
        delete this.groupIdMap[name];
        delete this.groupColorMap[name];
        mutated = true;
      }
    }

    if (!mutated) return;

    try {
      await this.groupStateRepository.save(this.groupColorMap, this.groupIdMap);
      this.colorAssigner.setCache(this.groupColorMap);
    } catch (error) {
      logWarn("grouping:pruneGroupState failed to persist", toErrorMessage(error));
    }
  }

  private markPendingCleanup(groupId: number) {
    if (!this.pendingCleanup.has(groupId)) {
      this.pendingCleanup.set(groupId, Date.now());
    }
    return this.pendingCleanup.get(groupId);
  }

  private clearPendingCleanup(groupId: number) {
    this.pendingCleanup.delete(groupId);
  }

  private async tryCleanupGroup(group: chrome.tabGroups.TabGroup, graceMs = 300000) {
    try {
      this.markPendingCleanup(group.id);

      const elapsed = Date.now() - (this.pendingCleanup.get(group.id) || 0);
      if (elapsed < Math.max(0, graceMs)) {
        return;
      }

      const [empty, active] = await Promise.all([this.isGroupEmpty(group.id), this.isGroupActive(group)]);

      if (active || !empty) {
        this.clearPendingCleanup(group.id);
        return;
      }

      await this.apiClient.removeTabGroup(group.id);
      await this.pruneGroupState(group.id);
      this.clearPendingCleanup(group.id);
    } catch (error) {
      logWarn("grouping:tryCleanupGroup failed", toErrorMessage(error));
    }
  }

  private async runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(key, previous.then(() => current));

    await previous;
    try {
      return await task();
    } finally {
      release();
      if (this.locks.get(key) === current) {
        this.locks.delete(key);
      }
    }
  }
}

export const tabGroupingService = new TabGroupingService();

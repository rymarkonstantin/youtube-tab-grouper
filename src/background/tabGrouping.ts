import { categoryResolver as defaultCategoryResolver } from "../shared/categoryResolver";
import { computeEnabledColors } from "../shared/settings";
import type { Settings } from "../shared/types";
import { AVAILABLE_COLORS } from "./constants";
import { chromeTabGroupingAdapter } from "./infra/chromeTabGroupingAdapter";
import { colorAssignerAdapter } from "./infra/colorAssignerAdapter";
import { groupStateRepositoryAdapter } from "./repositories/groupStateRepositoryAdapter";
import { statsRepositoryAdapter } from "./repositories/statsRepositoryAdapter";
import { CleanupCoordinator } from "./services/cleanupCoordinator";
import { GroupStateCoordinator } from "./services/groupStateCoordinator";
import { InMemoryLockManager } from "./services/inMemoryLockManager";
import { StatsTracker } from "./services/statsTracker";
import { TabGroupingService } from "./services/tabGroupingService";
import { getVideoMetadata } from "./metadataFetcher";

// TODO: remove this facade once all imports use TabGroupingService directly.

export const createTabGroupingService = () => {
  const colorAssigner = colorAssignerAdapter;
  return new TabGroupingService({
    chrome: chromeTabGroupingAdapter,
    colorAssigner,
    groupState: new GroupStateCoordinator(groupStateRepositoryAdapter, colorAssigner),
    stats: new StatsTracker(statsRepositoryAdapter),
    metadata: getVideoMetadata,
    categoryResolver: defaultCategoryResolver,
    lockManager: new InMemoryLockManager(),
    cleanupCoordinator: new CleanupCoordinator(),
    defaultColors: AVAILABLE_COLORS
  });
};

export const tabGroupingService = createTabGroupingService();

export const initializeGroupingState = () => tabGroupingService.initialize();
export const groupTab = (tab: chrome.tabs.Tab, category: string, enabledColors: string[]) =>
  tabGroupingService.groupTab(tab, category, enabledColors);
export const autoCleanupEmptyGroups = (graceMs?: number) => tabGroupingService.autoCleanupEmptyGroups(graceMs);
export const handleGroupRemoved = (groupId: number) => tabGroupingService.handleGroupRemoved(groupId);
export const handleGroupUpdated = (group: chrome.tabGroups.TabGroup) => tabGroupingService.handleGroupUpdated(group);

export const getEnabledColors = (settings: Settings, fallbackColors: readonly string[] = AVAILABLE_COLORS) =>
  computeEnabledColors(settings, fallbackColors);

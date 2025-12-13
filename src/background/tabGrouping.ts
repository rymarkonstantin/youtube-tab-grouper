import { computeEnabledColors } from "../shared/settings";
import type { Settings } from "../shared/types";
import { AVAILABLE_COLORS } from "./constants";
import { tabGroupingService } from "./services/tabGroupingService";

// TODO: remove this facade once all imports use TabGroupingService directly.

export const initializeGroupingState = () => tabGroupingService.initialize();
export const groupTab = (tab: chrome.tabs.Tab, category: string, enabledColors: string[]) =>
  tabGroupingService.groupTab(tab, category, enabledColors);
export const autoCleanupEmptyGroups = (graceMs?: number) => tabGroupingService.autoCleanupEmptyGroups(graceMs);
export const handleGroupRemoved = (groupId: number) => tabGroupingService.handleGroupRemoved(groupId);
export const handleGroupUpdated = (group: chrome.tabGroups.TabGroup) =>
  tabGroupingService.handleGroupUpdated(group);

export const getEnabledColors = (settings: Settings, fallbackColors: readonly string[] = AVAILABLE_COLORS) =>
  computeEnabledColors(settings, fallbackColors);

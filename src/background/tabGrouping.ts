import { AVAILABLE_COLORS, DEFAULT_STATS } from "./constants";
import { loadState, saveState, loadStats, saveStats } from "./storage";
import { queryTabs, queryGroups, getTabGroup, groupTabs, updateTabGroup, removeTabGroup } from "./chromeApi";
import { logError, logWarn, toErrorEnvelope } from "./logger";
import type { Settings } from "../shared/types";

const toErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
};

const groupColorMap: Record<string, string> = {};
const groupIdMap: Record<string, number> = {};
const pendingCleanup = new Map<number, number>();

const now = () => Date.now();

function markPendingCleanup(groupId: number) {
  if (!pendingCleanup.has(groupId)) {
    pendingCleanup.set(groupId, now());
  }
  return pendingCleanup.get(groupId);
}

function clearPendingCleanup(groupId: number) {
  pendingCleanup.delete(groupId);
}

function createMutex() {
  const locks = new Map<string, Promise<void>>();

  return async function runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = locks.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    locks.set(key, previous.then(() => current));

    await previous;
    try {
      return await task();
    } finally {
      release();
      if (locks.get(key) === current) {
        locks.delete(key);
      }
    }
  };
}

const runCategoryExclusive = createMutex();

/**
 * Load persisted group color/id maps into memory.
 */
export async function initializeGroupingState() {
  const { groupColorMap: savedColors, groupIdMap: savedIds } = await loadState();
  Object.assign(groupColorMap, savedColors || {});
  Object.assign(groupIdMap, savedIds || {});
}

async function getNeighborColors(tabId: number, windowId: number): Promise<Set<string>> {
  const tabs = await queryTabs({ windowId });
  const groupIds = [
    ...new Set(
      tabs
        .filter((t) => t.id !== tabId && (t.groupId ?? -1) >= 0)
        .map((t) => t.groupId)
        .filter((gid): gid is number => typeof gid === "number")
    )
  ];

  if (groupIds.length === 0) return new Set();

  const groups = await Promise.all(groupIds.map((gid) => getTabGroup(gid)));
  return new Set(groups.map((g) => g?.color).filter((color): color is string => Boolean(color)));
}

function pickRandomColor(colors: string[] = []) {
  if (!colors.length) return "";
  const idx = Math.floor(Math.random() * colors.length);
  return colors[idx] || "";
}

async function selectColorForCategory(
  category: string,
  tabId: number,
  windowId: number,
  enabledColors: string[] = []
) {
  if (groupColorMap[category]) {
    return groupColorMap[category];
  }

  if (!Array.isArray(enabledColors) || enabledColors.length === 0) {
    throw new Error("No enabled colors available for assignment");
  }

  const neighborColors = await getNeighborColors(tabId, windowId);
  const available = enabledColors.filter((color) => !neighborColors.has(color));
  const color = available.length > 0 ? pickRandomColor(available) : pickRandomColor(enabledColors);

  if (!color) {
    throw new Error("Unable to assign a color for the category");
  }

  groupColorMap[category] = color;
  return color;
}

async function ensureGroupForCategory(tab: chrome.tabs.Tab, category: string, color: string) {
  if (tab.windowId === undefined) {
    throw new Error("Tab missing windowId");
  }
  if (tab.id === undefined) {
    throw new Error("Tab missing id");
  }

  const groups = await queryGroups({ title: category });
  const groupInWindow = groups.find((g) => g.windowId === tab.windowId);

  let groupId: number;
  if (groupInWindow) {
    groupId = groupInWindow.id;
    await groupTabs(tab.id, groupId);
  } else {
    groupId = await groupTabs(tab.id);
  }

  await updateTabGroup(groupId, { title: category, color });
  return { groupId, color };
}

async function persistGroupingState(category: string, groupId: number, color: string) {
  groupIdMap[category] = groupId;
  groupColorMap[category] = color;
  try {
    await saveState(groupColorMap, groupIdMap);
  } catch (error) {
    const err = new Error(`Failed to persist grouping state: ${toErrorMessage(error)}`);
    (err as { cause?: unknown }).cause = error;
    throw err;
  }
}

async function recordGroupingStats(category: string) {
  const stats = await loadStats(DEFAULT_STATS);
  stats.totalTabs = (stats.totalTabs || 0) + 1;
  stats.categoryCount[category] = (stats.categoryCount[category] || 0) + 1;
  try {
    await saveStats(stats);
  } catch (error) {
    logWarn("grouping:recordGroupingStats failed to persist stats", toErrorMessage(error));
  }
}

/**
 * Group a tab under a category, handling color assignment and stats.
 */
export async function groupTab(tab: chrome.tabs.Tab, category: string, enabledColors: string[]) {
  if (tab.id === undefined || tab.windowId === undefined) {
    const missing = tab.id === undefined ? "id" : "windowId";
    throw new Error(`Cannot group tab without ${missing}`);
  }
  const { id: tabId, windowId } = tab;

  return runCategoryExclusive(category, async () => {
    try {
      const color = await selectColorForCategory(category, tabId, windowId, enabledColors);
      const { groupId } = await ensureGroupForCategory(tab, category, color);

      await persistGroupingState(category, groupId, color);
      await recordGroupingStats(category);

      return { groupId, color };
    } catch (error) {
      const wrapped = toErrorEnvelope(error, (error as Error)?.message || "Failed to group tab");
      logError("grouping:groupTab failed", wrapped.message);
      throw wrapped;
    }
  });
}

async function isGroupActive(group: chrome.tabGroups.TabGroup) {
  try {
    const [activeTab] = await queryTabs({ active: true, windowId: group.windowId });
    return activeTab?.groupId === group.id;
  } catch (error) {
    logWarn("grouping:isGroupActive check failed; assuming inactive", toErrorMessage(error));
    return false;
  }
}

async function isGroupEmpty(groupId: number) {
  const tabs = await queryTabs({ groupId });
  return tabs.length === 0;
}

async function pruneGroupState(groupId: number) {
  let mutated = false;
  for (const [name, id] of Object.entries(groupIdMap)) {
    if (id === groupId) {
      delete groupIdMap[name];
      delete groupColorMap[name];
      mutated = true;
    }
  }

  if (!mutated) return;

  try {
    await saveState(groupColorMap, groupIdMap);
  } catch (error) {
    logWarn("grouping:pruneGroupState failed to persist", toErrorMessage(error));
  }
}

async function tryCleanupGroup(group: chrome.tabGroups.TabGroup, graceMs = 300000) {
  try {
    markPendingCleanup(group.id);

    const elapsed = now() - (pendingCleanup.get(group.id) || 0);
    if (elapsed < Math.max(0, graceMs)) {
      return;
    }

    const [empty, active] = await Promise.all([isGroupEmpty(group.id), isGroupActive(group)]);

    if (active || !empty) {
      clearPendingCleanup(group.id);
      return;
    }

    await removeTabGroup(group.id);
    await pruneGroupState(group.id);
    clearPendingCleanup(group.id);
  } catch (error) {
    logWarn("grouping:tryCleanupGroup failed", toErrorMessage(error));
  }
}

/**
 * Attempt cleanup of empty tab groups after a grace period.
 */
export async function autoCleanupEmptyGroups(graceMs = 300000) {
  try {
    const groups = await queryGroups({});

    for (const group of groups) {
      const tabs = await queryTabs({ groupId: group.id });

      if (tabs.length === 0) {
        await tryCleanupGroup(group, graceMs);
      } else {
        clearPendingCleanup(group.id);
      }
    }
  } catch (error) {
    logWarn("grouping:autoCleanupEmptyGroups skipped due to error", toErrorMessage(error));
  }
}

/**
 * Cleanup state when a tab group is removed.
 */
export async function handleGroupRemoved(groupId: number) {
  try {
    clearPendingCleanup(groupId);
    await pruneGroupState(groupId);
  } catch (error) {
    logWarn("grouping:handleGroupRemoved failed to persist cleanup", toErrorMessage(error));
  }
}

/**
 * Update in-memory maps when a group is renamed/color-changed.
 */
export async function handleGroupUpdated(group: chrome.tabGroups.TabGroup) {
  if (!group || typeof group !== "object") {
    return;
  }

  try {
    clearPendingCleanup(group.id);
    for (const [name, id] of Object.entries(groupIdMap)) {
      if (id === group.id && group.title && group.title !== name) {
        delete groupIdMap[name];
        delete groupColorMap[name];
        groupIdMap[group.title] = group.id;
        if (group.color) groupColorMap[group.title] = group.color;
      }
    }
    await saveState(groupColorMap, groupIdMap);
  } catch (error) {
    logWarn("grouping:handleGroupUpdated failed to persist update", toErrorMessage(error));
  }
}

/**
 * Return enabled colors from settings with fallback when all disabled.
 */
export function getEnabledColors(settings: Settings, fallbackColors: readonly string[] = AVAILABLE_COLORS) {
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

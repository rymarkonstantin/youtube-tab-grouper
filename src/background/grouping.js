import { AVAILABLE_COLORS, DEFAULT_STATS } from './constants.js';
import { loadState, saveState, loadStats, saveStats } from './storage.js';
import { queryTabs, queryGroups, getTabGroup, groupTabs, updateTabGroup } from './chromeApi.js';
import { logError, logWarn, toErrorEnvelope } from './logger.js';

const groupColorMap = {};
const groupIdMap = {};
const groupTabCounts = {};

function createMutex() {
    const locks = new Map();

    return async function runExclusive(key, task) {
        const previous = locks.get(key) || Promise.resolve();
        let release;
        const current = new Promise((resolve) => { release = resolve; });
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

export async function initializeGroupingState() {
    const { groupColorMap: savedColors, groupIdMap: savedIds } = await loadState();
    Object.assign(groupColorMap, savedColors || {});
    Object.assign(groupIdMap, savedIds || {});
}

async function getNeighborColors(tabId, windowId) {
    const tabs = await queryTabs({ windowId });
    const groupIds = [...new Set(
        tabs
            .filter(t => t.id !== tabId && t.groupId >= 0)
            .map(t => t.groupId)
    )];

    if (groupIds.length === 0) return new Set();

    const groups = await Promise.all(groupIds.map(gid => getTabGroup(gid)));
    return new Set(groups.map(g => g?.color).filter(Boolean));
}

function pickRandomColor(colors = []) {
    if (!colors.length) return "";
    const idx = Math.floor(Math.random() * colors.length);
    return colors[idx] || "";
}

async function selectColorForCategory(category, tabId, windowId, enabledColors = []) {
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

async function ensureGroupForCategory(tab, category, color) {
    const groups = await queryGroups({ title: category });
    const groupInWindow = groups.find(g => g.windowId === tab.windowId);

    let groupId;
    if (groupInWindow) {
        groupId = groupInWindow.id;
        await groupTabs(tab.id, groupId);
    } else {
        groupId = await groupTabs(tab.id);
    }

    await updateTabGroup(groupId, { title: category, color });
    return { groupId, color };
}

async function persistGroupingState(category, groupId, color) {
    groupIdMap[category] = groupId;
    groupColorMap[category] = color;
    try {
        await saveState(groupColorMap, groupIdMap);
    } catch (error) {
        const err = new Error(`Failed to persist grouping state: ${error?.message || error}`);
        err.cause = error;
        throw err;
    }
}

async function recordGroupingStats(category) {
    const stats = await loadStats(DEFAULT_STATS);
    stats.totalTabs = (stats.totalTabs || 0) + 1;
    stats.categoryCount[category] = (stats.categoryCount[category] || 0) + 1;
    try {
        await saveStats(stats);
    } catch (error) {
        const err = new Error(`Failed to persist grouping stats: ${error?.message || error}`);
        err.cause = error;
        throw err;
    }
}

export async function groupTab(tab, category, enabledColors) {
    return runCategoryExclusive(category, async () => {
        try {
            const color = await selectColorForCategory(category, tab.id, tab.windowId, enabledColors);
            const { groupId } = await ensureGroupForCategory(tab, category, color);

            await persistGroupingState(category, groupId, color);
            await recordGroupingStats(category);

            return { groupId, color };
        } catch (error) {
            const wrapped = toErrorEnvelope(error, error?.message || "Failed to group tab");
            logError("grouping:groupTab failed", wrapped.message);
            throw wrapped;
        }
    });
}

export async function autoCleanupEmptyGroups() {
    try {
        const groups = await queryGroups({});

        for (const group of groups) {
            const tabs = await queryTabs({ groupId: group.id });

            if (tabs.length === 0) {
                if (!groupTabCounts[group.id]) {
                    groupTabCounts[group.id] = Date.now();
                }
                else if (Date.now() - groupTabCounts[group.id] > 300000) {
                    chrome.tabGroups.remove(group.id, () => {
                        if (chrome.runtime.lastError) {
                            logWarn("grouping:autoCleanupEmptyGroups remove failed", chrome.runtime.lastError.message);
                            return;
                        }
                        for (const [name, id] of Object.entries(groupIdMap)) {
                            if (id === group.id) {
                                delete groupIdMap[name];
                                delete groupColorMap[name];
                            }
                        }
                        saveState(groupColorMap, groupIdMap);
                    });
                }
            } else {
                delete groupTabCounts[group.id];
            }
        }
    } catch (error) {
        logWarn("grouping:autoCleanupEmptyGroups skipped due to error", error?.message || error);
    }
}

export async function handleGroupRemoved(groupId) {
    try {
        for (const [name, id] of Object.entries(groupIdMap)) {
            if (id === groupId) {
                delete groupIdMap[name];
                delete groupColorMap[name];
            }
        }
        await saveState(groupColorMap, groupIdMap);
    } catch (error) {
        logWarn("grouping:handleGroupRemoved failed to persist cleanup", error?.message || error);
    }
}

export async function handleGroupUpdated(group) {
    if (!group || typeof group !== 'object') {
        return;
    }

    try {
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
        logWarn("grouping:handleGroupUpdated failed to persist update", error?.message || error);
    }
}

export function getEnabledColors(settings, fallbackColors = AVAILABLE_COLORS) {
    let enabledColors = [];

    if (settings.enabledColors && typeof settings.enabledColors === 'object') {
        enabledColors = Object.entries(settings.enabledColors)
            .filter(([, enabled]) => enabled)
            .map(([color]) => color);
    }

    if (enabledColors.length === 0) {
        enabledColors.push(...fallbackColors);
    }

    return enabledColors;
}

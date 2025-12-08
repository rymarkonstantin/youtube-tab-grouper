import { AVAILABLE_COLORS, DEFAULT_STATS } from './constants.js';
import { loadState, saveState, loadStats, saveStats } from './storage.js';
import { queryTabs, queryGroups, getTabGroup, groupTabs, updateTabGroup } from './chromeApi.js';
import { logError, logWarn, toErrorEnvelope } from './logger.js';

const groupColorMap = {};
const groupIdMap = {};
const colorAssignmentLock = {};
const groupTabCounts = {};

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

async function getColorForGroup(groupName, tabId, windowId, enabledColors) {
    if (groupColorMap[groupName]) {
        return groupColorMap[groupName];
    }

    if (colorAssignmentLock[groupName]) {
        return colorAssignmentLock[groupName];
    }

    const assignmentPromise = (async () => {
        try {
            const neighborColors = await getNeighborColors(tabId, windowId, enabledColors);
            const available = enabledColors.filter(c => !neighborColors.has(c));
            const color = available.length > 0
                ? available[Math.floor(Math.random() * available.length)]
                : enabledColors[Math.floor(Math.random() * enabledColors.length)];

            groupColorMap[groupName] = color;
            return color;
        } finally {
            delete colorAssignmentLock[groupName];
        }
    })();

    colorAssignmentLock[groupName] = assignmentPromise;
    return assignmentPromise;
}

export async function groupTab(tab, category, enabledColors) {
    try {
        const color = await getColorForGroup(category, tab.id, tab.windowId, enabledColors);
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

        groupIdMap[category] = groupId;
        groupColorMap[category] = color;
        await saveState(groupColorMap, groupIdMap);

        const stats = await loadStats(DEFAULT_STATS);
        stats.totalTabs = (stats.totalTabs || 0) + 1;
        stats.categoryCount[category] = (stats.categoryCount[category] || 0) + 1;
        await saveStats(stats);

        return { groupId, color };
    } catch (error) {
        const wrapped = toErrorEnvelope(error, "Failed to group tab");
        logError("grouping:groupTab failed", wrapped.message);
        throw wrapped;
    }
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

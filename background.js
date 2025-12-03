const AVAILABLE_COLORS = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan"];
const groupColorMap = {}; // { groupName: color }
const groupIdMap = {};    // { groupName: groupId } (to track existing groups)

/**
 * Get a set of colors used by other groups (neighbors) in the current window,
 * excluding the tab with tabId.
 * Returns a Promise<Set>
 */
function getNeighborColors(tabId) {
    return new Promise((resolve) => {
        const neighborColors = new Set();
        chrome.tabs.query({ currentWindow: true }, (tabs) => {
            tabs.forEach(t => {
                if (t.groupId >= 0 && t.id !== tabId) {
                    // find groupName for this groupId (if we already tracked it)
                    const entry = Object.entries(groupIdMap).find(([name, id]) => id === t.groupId);
                    if (entry) {
                        const groupName = entry[0];
                        const color = groupColorMap[groupName];
                        if (color) neighborColors.add(color);
                    }
                }
            });
            resolve(neighborColors);
        });
    });
}

/**
 * Get (or assign) a color for a group, avoiding neighbor colors when possible.
 * Returns a Promise<string>
 */
async function getColorForGroup(groupName, tabId) {
    if (groupColorMap[groupName]) {
        return groupColorMap[groupName]; // already assigned
    }

    const neighborColors = await getNeighborColors(tabId);

    // Pick a random color not used by neighbors
    const available = AVAILABLE_COLORS.filter(c => !neighborColors.has(c));
    const color = available.length > 0
        ? available[Math.floor(Math.random() * available.length)]
        : AVAILABLE_COLORS[Math.floor(Math.random() * AVAILABLE_COLORS.length)];

    groupColorMap[groupName] = color;
    return color;
}

/**
 * Message handler
 * Note: include sendResponse in signature so we can reply to isTabGrouped.
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "groupTab") {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            const tab = tabs[0];
            if (!tab) return;

            const category = msg.category && msg.category.trim() ? msg.category.trim() : "Other";

            try {
                const color = await getColorForGroup(category, tab.id);

                chrome.tabGroups.query({ title: category }, (groups) => {
                    if (groups.length > 0) {
                        // Group exists — add tab and ensure color is set
                        const existingGroupId = groups[0].id;
                        chrome.tabs.group({ tabIds: tab.id, groupId: existingGroupId }, () => {
                            chrome.tabGroups.update(existingGroupId, { color }, () => {
                                groupIdMap[category] = existingGroupId;
                                // ensure color map kept in sync
                                groupColorMap[category] = color;
                            });
                        });
                    } else {
                        // Create new group with this tab, then update title+color
                        chrome.tabs.group({ tabIds: tab.id }, (groupId) => {
                            // small delay to ensure group exists
                            setTimeout(() => {
                                chrome.tabGroups.update(groupId, { title: category, color }, () => {
                                    groupIdMap[category] = groupId;
                                    groupColorMap[category] = color;
                                });
                            }, 50);
                        });
                    }
                });
            } catch (e) {
                // fallback behavior if color resolution fails
                console.error("Error assigning color:", e);
                // still try to group without neighbor-aware color
                chrome.tabGroups.query({ title: category }, (groups) => {
                    if (groups.length > 0) {
                        chrome.tabs.group({ tabIds: tab.id, groupId: groups[0].id });
                        groupIdMap[category] = groups[0].id;
                    } else {
                        chrome.tabs.group({ tabIds: tab.id }, (groupId) => {
                            setTimeout(() => chrome.tabGroups.update(groupId, { title: category }), 50);
                            groupIdMap[category] = groupId;
                        });
                    }
                });
            }
        });

        // no sendResponse used here, but returning true keeps the message channel alive (safe)
        return true;
    }

    // Check if tab is already grouped
    if (msg.action === "isTabGrouped") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            const grouped = tab?.groupId >= 0;
            sendResponse({ grouped });
        });
        return true; // keep channel open for async sendResponse
    }

    // Not handled
    return false;
});

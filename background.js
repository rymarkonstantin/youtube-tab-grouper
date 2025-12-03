// ============================================================================
// CONSTANTS & STATE
// ============================================================================

const AVAILABLE_COLORS = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan"];
const groupColorMap = {};        // Cache: { groupName → color }
const groupIdMap = {};           // Cache: { groupName → groupId }
const colorAssignmentLock = {};  // Lock: { groupName → Promise }

// ============================================================================
// PROMISE WRAPPERS (Chrome API helpers)
// ============================================================================

/**
 * Query tabs with given filter criteria.
 * @param {object} query - Chrome tabs.query filter
 * @returns {Promise<Array>}
 */
function queryTabs(query) {
    return new Promise(resolve => chrome.tabs.query(query, resolve));
}

/**
 * Query tab groups with given filter criteria.
 * @param {object} query - Chrome tabGroups.query filter
 * @returns {Promise<Array>}
 */
function queryGroups(query) {
    return new Promise(resolve => chrome.tabGroups.query(query, resolve));
}

/**
 * Get a specific tab group by ID.
 * @param {number} groupId
 * @returns {Promise<object>}
 */
function getTabGroup(groupId) {
    return new Promise(resolve => chrome.tabGroups.get(groupId, resolve));
}

/**
 * Group one or more tabs into a group.
 * @param {number|Array<number>} tabIds
 * @param {number} [groupId] - Existing group ID, or undefined to create new
 * @returns {Promise<number>} - Resolved group ID
 */
function groupTabs(tabIds, groupId) {
    return new Promise(resolve => chrome.tabs.group({ tabIds, groupId }, resolve));
}

/**
 * Update a tab group's properties.
 * @param {number} groupId
 * @param {object} props - { title, color, collapsed }
 * @returns {Promise<object>}
 */
function updateTabGroup(groupId, props) {
    return new Promise(resolve => chrome.tabGroups.update(groupId, props, resolve));
}

// ============================================================================
// COLOR ASSIGNMENT LOGIC
// ============================================================================

/**
 * Get all colors used by other groups in a window.
 * Uses Promise.all for parallel fetching.
 * @param {number} tabId - Tab to exclude from neighbor check
 * @param {number} windowId
 * @returns {Promise<Set>} - Set of color strings used by neighbors
 */
async function getNeighborColors(tabId, windowId) {
    const tabs = await queryTabs({ windowId });
    
    // Extract unique group IDs, excluding the current tab and ungrouped tabs
    const groupIds = [...new Set(
        tabs
            .filter(t => t.id !== tabId && t.groupId >= 0)
            .map(t => t.groupId)
    )];

    if (groupIds.length === 0) return new Set();

    // Fetch all group details in parallel instead of sequential
    const groups = await Promise.all(
        groupIds.map(gid => getTabGroup(gid))
    );

    // Extract colors from valid groups
    return new Set(groups.map(g => g?.color).filter(Boolean));
}

/**
 * Select a color for a group, avoiding neighbor colors when possible.
 * Implements locking to prevent race conditions on concurrent calls.
 * @param {string} groupName - Category/group name
 * @param {number} tabId - Current tab ID (for neighbor detection)
 * @param {number} windowId
 * @returns {Promise<string>} - Selected color
 */
async function getColorForGroup(groupName, tabId, windowId) {
    // Fast path: return cached color
    if (groupColorMap[groupName]) {
        return groupColorMap[groupName];
    }

    // Prevent concurrent color assignments for the same group
    if (colorAssignmentLock[groupName]) {
        return colorAssignmentLock[groupName];
    }

    // Create assignment promise
    const assignmentPromise = (async () => {
        try {
            const neighborColors = await getNeighborColors(tabId, windowId);
            
            // Prefer colors not used by neighbors
            const available = AVAILABLE_COLORS.filter(c => !neighborColors.has(c));
            const color = available.length > 0
                ? available[Math.floor(Math.random() * available.length)]
                : AVAILABLE_COLORS[Math.floor(Math.random() * AVAILABLE_COLORS.length)];

            groupColorMap[groupName] = color;
            return color;
        } finally {
            delete colorAssignmentLock[groupName];
        }
    })();

    colorAssignmentLock[groupName] = assignmentPromise;
    return assignmentPromise;
}

// ============================================================================
// TAB GROUPING LOGIC
// ============================================================================

/**
 * Group a tab into a category, creating or reusing existing group.
 * @param {object} tab - Tab object from chrome.tabs API
 * @param {string} category - Category/group name
 */
async function groupTab(tab, category) {
    // Step 1: Assign color (may reuse cached or create new)
    const color = await getColorForGroup(category, tab.id, tab.windowId);

    // Step 2: Find existing group with same title in this window
    const groups = await queryGroups({ title: category });
    const groupInWindow = groups.find(g => g.windowId === tab.windowId);

    // Step 3: Add tab to group
    let groupId;
    if (groupInWindow) {
        // Reuse existing group
        groupId = groupInWindow.id;
        await groupTabs(tab.id, groupId);
    } else {
        // Create new group
        groupId = await groupTabs(tab.id);
    }

    // Step 4: Apply title and color
    await updateTabGroup(groupId, { title: category, color });

    // Step 5: Update cache
    groupIdMap[category] = groupId;
    groupColorMap[category] = color;
}

// ============================================================================
// STORAGE HELPERS
// ============================================================================

/**
 * Load state from chrome.storage.local
 */
async function loadState() {
    return new Promise(resolve => {
        chrome.storage.local.get(['groupColorMap', 'groupIdMap'], (result) => {
            Object.assign(groupColorMap, result.groupColorMap || {});
            Object.assign(groupIdMap, result.groupIdMap || {});
            resolve();
        });
    });
}

/**
 * Save state to chrome.storage.local
 */
async function saveState() {
    return new Promise(resolve => {
        chrome.storage.local.set({ groupColorMap, groupIdMap }, resolve);
    });
}

// Initialize on extension load
chrome.runtime.onInstalled.addListener(async () => {
    await loadState();
    console.log("State loaded from storage");
});

// Save state whenever it changes
async function groupTab(tab, category) {
    const color = await getColorForGroup(category, tab.id, tab.windowId);
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
    
    // Persist immediately
    await saveState();
}

chrome.tabGroups.onRemoved.addListener(async (groupId) => {
    for (const [name, id] of Object.entries(groupIdMap)) {
        if (id === groupId) {
            delete groupIdMap[name];
            delete groupColorMap[name];
            await saveState();
        }
    }
});

chrome.tabGroups.onUpdated.addListener(async (group) => {
    for (const [name, id] of Object.entries(groupIdMap)) {
        if (id === group.id && group.title && group.title !== name) {
            delete groupIdMap[name];
            delete groupColorMap[name];
            groupIdMap[group.title] = group.id;
            if (group.color) groupColorMap[group.title] = group.color;
            await saveState();
        }
    }
});

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "groupTab") {
        handleGroupTab(msg, sendResponse);
        return true;
    }

    if (msg.action === "isTabGrouped") {
        handleIsTabGrouped(sendResponse);
        return true;
    }

    return false;
});

/**
 * Handle "groupTab" message: group active tab into category.
 */
async function handleGroupTab(msg, sendResponse) {
    try {
        const [tab] = await queryTabs({ active: true, currentWindow: true });
        if (!tab) {
            console.warn("No active tab found");
            return;
        }

        const category = (msg.category || "").trim() || "Other";
        await groupTab(tab, category);
        sendResponse({ success: true, category });
    } catch (error) {
        console.error("Error grouping tab:", error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Handle "isTabGrouped" message: check if active tab is in a group.
 */
async function handleIsTabGrouped(sendResponse) {
    try {
        const [tab] = await queryTabs({ active: true, currentWindow: true });
        sendResponse({ grouped: tab?.groupId >= 0 });
    } catch (error) {
        console.error("Error checking tab group status:", error);
        sendResponse({ grouped: false, error: error.message });
    }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

/**
 * Clean up cache when a group is deleted.
 */
chrome.tabGroups.onRemoved.addListener((groupId) => {
    for (const [name, id] of Object.entries(groupIdMap)) {
        if (id === groupId) {
            delete groupIdMap[name];
            delete groupColorMap[name];
            console.log(`Cleaned up group cache: ${name}`);
        }
    }
});

/**
 * Update cache when a group is renamed or color changed.
 */
chrome.tabGroups.onUpdated.addListener((group) => {
    // Find and update cache entry if it exists
    for (const [name, id] of Object.entries(groupIdMap)) {
        if (id === group.id && group.title && group.title !== name) {
            delete groupIdMap[name];
            delete groupColorMap[name];
            groupIdMap[group.title] = group.id;
            if (group.color) groupColorMap[group.title] = group.color;
        }
    }
});

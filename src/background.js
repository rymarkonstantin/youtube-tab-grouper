/**
 * YouTube Tab Grouper - Background Service Worker
 * 
 * Main responsibilities:
 * - Handle tab grouping requests
 * - Manage color assignment and caching
 * - Predict categories using AI keywords
 * - Clean up empty groups automatically
 * - Track grouping statistics
 */

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

/** Available colors for tab groups */
const AVAILABLE_COLORS = [
    "grey", "blue", "red", "yellow", 
    "green", "pink", "purple", "cyan"
];

/** In-memory caches for grouping data */
const groupColorMap = {};      // Maps category name → assigned color
const groupIdMap = {};         // Maps category name → group ID
const colorAssignmentLock = {}; // Prevents race conditions
const groupTabCounts = {};     // Tracks empty group cleanup timing

/**
 * Keywords for AI-powered category detection
 * Each category has associated keywords to match against video titles/descriptions
 */
const CATEGORY_KEYWORDS = {
    "Gaming": ["gameplay", "gaming", "twitch", "esports", "fps", "rpg", "speedrun", "fortnite", "minecraft"],
    "Music": ["music", "song", "album", "artist", "concert", "cover", "remix", "lyrics"],
    "Tech": ["tech", "gadget", "review", "iphone", "laptop", "cpu", "gpu", "software", "coding"],
    "Cooking": ["recipe", "cooking", "food", "kitchen", "chef", "baking", "meal", "cuisine"],
    "Fitness": ["workout", "gym", "exercise", "fitness", "yoga", "training", "diet", "health"],
    "Education": ["tutorial", "course", "learn", "how to", "guide", "lesson", "education"],
    "News": ["news", "breaking", "current events", "politics", "world", "daily"],
    "Entertainment": ["movie", "series", "trailer", "reaction", "comedy", "funny", "meme"]
};

/** Default user settings */
const DEFAULT_SETTINGS = {
    autoGroupDelay: 2500,
    allowedHashtags: ['tech', 'music', 'gaming', 'cooking', 'sports', 'education', 'news'],
    channelCategoryMap: {},
    extensionEnabled: true,
    enabledColors: AVAILABLE_COLORS.reduce((obj, color) => {
        obj[color] = true;
        return obj;
    }, {}),
    autoCleanupEnabled: true,
    aiCategoryDetection: true,
    
    categoryKeywords: {
        "Gaming": ["gameplay", "gaming", "twitch", "esports", "fps", "rpg", "speedrun", "fortnite", "minecraft"],
        "Music": ["music", "song", "album", "artist", "concert", "cover", "remix", "lyrics"],
        "Tech": ["tech", "gadget", "review", "iphone", "laptop", "cpu", "gpu", "software", "coding"],
        "Cooking": ["recipe", "cooking", "food", "kitchen", "chef", "baking", "meal", "cuisine"],
        "Fitness": ["workout", "gym", "exercise", "fitness", "yoga", "training", "diet", "health"],
        "Education": ["tutorial", "course", "learn", "how to", "guide", "lesson", "education"],
        "News": ["news", "breaking", "current events", "politics", "world", "daily"],
        "Entertainment": ["movie", "series", "trailer", "reaction", "comedy", "funny", "meme"]
    }
};

// ============================================================================
// STORAGE UTILITIES
// ============================================================================

/**
 * Load cached group mappings from local storage
 * @async
 * @returns {Promise<void>}
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
 * Persist group mappings to local storage
 * @async
 * @returns {Promise<void>}
 */
async function saveState() {
    return new Promise(resolve => {
        chrome.storage.local.set({ groupColorMap, groupIdMap }, resolve);
    });
}

/**
 * Load user settings from sync storage
 * @async
 * @returns {Promise<Object>} User settings with fallbacks
 */
async function loadSettings() {
    return new Promise(resolve => {
        chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
            const settings = result || {};
            
            if (!settings.autoGroupDelay) settings.autoGroupDelay = DEFAULT_SETTINGS.autoGroupDelay;
            if (!settings.allowedHashtags) settings.allowedHashtags = DEFAULT_SETTINGS.allowedHashtags;
            if (!settings.channelCategoryMap) settings.channelCategoryMap = DEFAULT_SETTINGS.channelCategoryMap;
            if (settings.extensionEnabled === undefined) settings.extensionEnabled = DEFAULT_SETTINGS.extensionEnabled;
            if (settings.aiCategoryDetection === undefined) settings.aiCategoryDetection = DEFAULT_SETTINGS.aiCategoryDetection;
            if (settings.autoCleanupEnabled === undefined) settings.autoCleanupEnabled = DEFAULT_SETTINGS.autoCleanupEnabled;
            
            if (!settings.enabledColors || typeof settings.enabledColors !== 'object' || Object.keys(settings.enabledColors).length === 0) {
                settings.enabledColors = DEFAULT_SETTINGS.enabledColors;
            }
            
            resolve(settings);
        });
    });
}

/**
 * Save user settings to sync storage
 * @async
 * @param {Object} settings - User configuration
 * @returns {Promise<void>}
 */
async function saveSettings(settings) {
    return new Promise(resolve => {
        chrome.storage.sync.set(settings, resolve);
    });
}

/**
 * Load grouping statistics
 * @async
 * @returns {Promise<Object>} Statistics object
 */
async function loadStats() {
    return new Promise(resolve => {
        chrome.storage.local.get('groupingStats', (result) => {
            resolve(result.groupingStats || {
                totalTabs: 0,
                categoryCount: {},
                sessionsToday: 0,
                lastReset: new Date().toDateString()
            });
        });
    });
}

/**
 * Save grouping statistics
 * @async
 * @param {Object} stats - Statistics object
 * @returns {Promise<void>}
 */
async function saveStats(stats) {
    return new Promise(resolve => {
        chrome.storage.local.set({ groupingStats: stats }, resolve);
    });
}

// ============================================================================
// CHROME API WRAPPERS (Promise-based)
// ============================================================================

/**
 * Query tabs by filter criteria
 * @param {Object} query - Chrome tabs.query filter
 * @returns {Promise<Array>} Array of tab objects
 */
function queryTabs(query) {
    return new Promise(resolve => chrome.tabs.query(query, resolve));
}

/**
 * Query tab groups by filter criteria
 * @param {Object} query - Chrome tabGroups.query filter
 * @returns {Promise<Array>} Array of group objects
 */
function queryGroups(query) {
    return new Promise(resolve => chrome.tabGroups.query(query, resolve));
}

/**
 * Get a specific tab group by ID
 * @param {number} groupId - The group ID
 * @returns {Promise<Object>} Group object
 */
function getTabGroup(groupId) {
    return new Promise(resolve => chrome.tabGroups.get(groupId, resolve));
}

/**
 * Add tab(s) to a group
 * @param {number|Array<number>} tabIds - Tab ID(s)
 * @param {number} [groupId] - Target group ID (undefined = create new)
 * @returns {Promise<number>} Resulting group ID
 */
function groupTabs(tabIds, groupId) {
    return new Promise(resolve => chrome.tabs.group({ tabIds, groupId }, resolve));
}

/**
 * Update group properties (title, color, etc.)
 * @param {number} groupId - The group ID
 * @param {Object} props - Properties to update
 * @returns {Promise<Object>} Updated group object
 */
function updateTabGroup(groupId, props) {
    return new Promise(resolve => chrome.tabGroups.update(groupId, props, resolve));
}

// ============================================================================
// COLOR ASSIGNMENT ENGINE
// ============================================================================

/**
 * Get colors already used by neighbor groups in this window
 * 
 * This prevents visual clutter by avoiding duplicate colors
 * near each other. Uses parallel fetching for performance.
 * 
 * @async
 * @param {number} tabId - Current tab ID (excluded from neighbors)
 * @param {number} windowId - Browser window ID
 * @param {Array<string>} enabledColors - Available colors to consider
 * @returns {Promise<Set>} Set of color strings used by neighbors
 */
async function getNeighborColors(tabId, windowId, enabledColors) {
    // Fetch all tabs in this window
    const tabs = await queryTabs({ windowId });

    // Extract unique group IDs, excluding current tab and ungrouped tabs
    const groupIds = [...new Set(
        tabs
            .filter(t => t.id !== tabId && t.groupId >= 0)
            .map(t => t.groupId)
    )];

    if (groupIds.length === 0) return new Set();

    // Fetch all group details in parallel (faster than sequential)
    const groups = await Promise.all(
        groupIds.map(gid => getTabGroup(gid))
    );

    // Extract and return colors
    return new Set(groups.map(g => g?.color).filter(Boolean));
}

/**
 * Get or assign a color for a category
 * 
 * Uses intelligent color selection:
 * 1. Check cache for existing assignment
 * 2. Prevent race conditions with locking
 * 3. Detect neighbor colors and avoid them
 * 4. Select random color from available pool
 * 
 * @async
 * @param {string} groupName - Category name
 * @param {number} tabId - Current tab ID
 * @param {number} windowId - Browser window ID
 * @param {Array<string>} enabledColors - Available colors
 * @returns {Promise<string>} Assigned color
 */
async function getColorForGroup(groupName, tabId, windowId, enabledColors) {
    // Fast path: return cached color
    if (groupColorMap[groupName]) {
        return groupColorMap[groupName];
    }

    // Wait if color assignment is already in progress (race condition protection)
    if (colorAssignmentLock[groupName]) {
        return colorAssignmentLock[groupName];
    }

    // Create assignment promise
    const assignmentPromise = (async () => {
        try {
            // Get colors used by neighbor groups
            const neighborColors = await getNeighborColors(tabId, windowId, enabledColors);

            // Prefer colors NOT used by neighbors
            const available = enabledColors.filter(c => !neighborColors.has(c));
            const color = available.length > 0
                ? available[Math.floor(Math.random() * available.length)]
                : enabledColors[Math.floor(Math.random() * enabledColors.length)];

            // Cache the assignment
            groupColorMap[groupName] = color;
            return color;
        } finally {
            // Remove lock after completion
            delete colorAssignmentLock[groupName];
        }
    })();

    // Store lock to prevent concurrent assignments
    colorAssignmentLock[groupName] = assignmentPromise;
    return assignmentPromise;
}

// ============================================================================
// AI CATEGORY PREDICTION
// ============================================================================

/**
 * Predict video category using keyword matching + YouTube metadata
 * 
 * Priority order:
 * 1. Keyword matching against title/description
 * 2. YouTube category metadata (if available)
 * 3. Default to "Other"
 * 
 * @param {Object} metadata - Video metadata
 * @param {string} metadata.title - Video title
 * @param {string} metadata.description - Video description
 * @param {Array<string>} metadata.keywords - Meta keywords
 * @param {string} metadata.youtubeCategory - YouTube category (new!)
 * @param {boolean} aiEnabled - Whether AI detection is enabled
 * @param {Object} categoryKeywords - Keywords for each category
 * @returns {string} Predicted category name
 */
function predictCategory(metadata, aiEnabled, categoryKeywords = DEFAULT_SETTINGS.categoryKeywords) {
    if (!aiEnabled) return "Other";

    const scores = {};
    const text = `${metadata.title} ${metadata.description} ${(metadata.keywords || []).join(' ')}`.toLowerCase();

    // Step 1: Score each category based on keyword matches
    Object.entries(categoryKeywords).forEach(([category, keywords]) => {
        const score = keywords.reduce((sum, keyword) => {
            const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
            return sum + (text.match(regex) || []).length;
        }, 0);
        if (score > 0) scores[category] = score;
    });

    // Step 2: If keywords found a match, return it
    const topCategory = Object.entries(scores).sort(([, a], [, b]) => b - a)[0];
    if (topCategory && topCategory[1] > 0) {
        return topCategory[0];
    }

    // Step 3: Fallback to YouTube category metadata if available
    if (metadata.youtubeCategory) {
        const category = mapYouTubeCategory(metadata.youtubeCategory);
        console.log(`📊 Using YouTube category: ${metadata.youtubeCategory} → ${category}`);
        return category;
    }

    // Step 4: Final fallback to "Other"
    return "Other";
}

/**
 * Map YouTube's official categories to our custom categories
 * 
 * YouTube categories: Music, Gaming, Entertainment, Sports, News, etc.
 * Our categories: Gaming, Music, Tech, Cooking, Fitness, Education, News, Entertainment
 * 
 * @param {string} youtubeCategory - YouTube's category name
 * @returns {string} Mapped category name
 */
function mapYouTubeCategory(youtubeCategory) {
    if (!youtubeCategory) return "Other";

    const categoryMap = {
        // YouTube → Our Categories
        "Music": "Music",
        "Gaming": "Gaming",
        "Entertainment": "Entertainment",
        "Sports": "Fitness",
        "News & Politics": "News",
        "Education": "Education",
        "Tech": "Tech",
        "Cooking": "Cooking",
        "Howto & Style": "Education",
        "Travel & Events": "Entertainment",
        "People & Blogs": "Entertainment",
        "Comedy": "Entertainment",
        "Film & Animation": "Entertainment",
        "Autos": "Tech",
        "Pets & Animals": "Entertainment",
        "Nonprofits & Activism": "News"
    };

    return categoryMap[youtubeCategory] || "Other";
}

// ============================================================================
// TAB GROUPING LOGIC
// ============================================================================

/**
 * Group a tab into a category
 * 
 * Process:
 * 1. Assign color (reuse existing or create new)
 * 2. Find/create group with this category name
 * 3. Add tab to group
 * 4. Update group properties
 * 5. Cache and persist assignments
 * 6. Update statistics
 * 
 * @async
 * @param {Object} tab - Tab object from Chrome API
 * @param {string} category - Category/group name
 * @param {Array<string>} enabledColors - Available colors
 * @returns {Promise<Object>} {groupId, color}
 */
async function groupTab(tab, category, enabledColors) {
    // Step 1: Assign color
    const color = await getColorForGroup(category, tab.id, tab.windowId, enabledColors);

    // Step 2: Find existing group with same title in this window
    const groups = await queryGroups({ title: category });
    const groupInWindow = groups.find(g => g.windowId === tab.windowId);

    // Step 3 & 4: Add tab to group and update properties
    let groupId;
    if (groupInWindow) {
        // Reuse existing group
        groupId = groupInWindow.id;
        await groupTabs(tab.id, groupId);
    } else {
        // Create new group
        groupId = await groupTabs(tab.id);
    }

    // Apply title and color
    await updateTabGroup(groupId, { title: category, color });

    // Step 5: Update caches
    groupIdMap[category] = groupId;
    groupColorMap[category] = color;
    await saveState();

    // Step 6: Update statistics
    const stats = await loadStats();
    stats.totalTabs = (stats.totalTabs || 0) + 1;
    stats.categoryCount[category] = (stats.categoryCount[category] || 0) + 1;
    await saveStats(stats);

    return { groupId, color };
}

/**
 * Batch group all YouTube tabs in current window
 * 
 * Useful for organizing multiple tabs at once
 * 
 * @async
 * @returns {Promise<Object>} {success: boolean, count: number}
 */
async function batchGroupAllTabs() {
    try {
        const tabs = await queryTabs({
            url: "https://www.youtube.com/*",
            currentWindow: true
        });

        const settings = await loadSettings();
        
        let enabledColors = [];
        if (settings.enabledColors && typeof settings.enabledColors === 'object') {
            enabledColors = Object.entries(settings.enabledColors)
                .filter(([, enabled]) => enabled)
                .map(([color]) => color);
        }

        if (enabledColors.length === 0) {
            enabledColors = [...AVAILABLE_COLORS];
        }

        console.log(`📊 Batch grouping ${tabs.length} YouTube tabs...`);

        let successCount = 0;
        for (const tab of tabs) {
            try {
                const metadata = await getVideoMetadata(tab.id);
                metadata.title = tab.title;
                
                // ✅ Pass channel mapping to predictCategory
                const category = predictCategory(
                    metadata,
                    settings.aiCategoryDetection,
                    settings.categoryKeywords || DEFAULT_SETTINGS.categoryKeywords,
                    settings.channelCategoryMap || {}  // ← ADD THIS
                );
                await groupTab(tab, category, enabledColors);
                successCount++;
            } catch (error) {
                console.error(`❌ Failed to group tab ${tab.id}:`, error);
            }
        }

        console.log(`✅ Successfully grouped ${successCount}/${tabs.length} tabs`);
        return { success: true, count: successCount };
    } catch (error) {
        console.error("❌ Batch grouping error:", error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// AUTO-CLEANUP ENGINE
// ============================================================================

/**
 * Automatically remove empty groups after 5 minutes
 * 
 * Keeps browser clean by removing unused groups.
 * Also cleans up related cache entries.
 * 
 * @async
 * @returns {Promise<void>}
 */
async function autoCleanupEmptyGroups() {
    const groups = await queryGroups({});

    for (const group of groups) {
        const tabs = await queryTabs({ groupId: group.id });

        if (tabs.length === 0) {
            // Mark for deletion on first detection
            if (!groupTabCounts[group.id]) {
                groupTabCounts[group.id] = Date.now();
            } 
            // Delete after 5 minutes
            else if (Date.now() - groupTabCounts[group.id] > 300000) {
                chrome.tabGroups.remove(group.id, () => {
                    console.log(`Auto-removed empty group: ${group.title}`);

                    // Clean up related cache entries
                    for (const [name, id] of Object.entries(groupIdMap)) {
                        if (id === group.id) {
                            delete groupIdMap[name];
                            delete groupColorMap[name];
                        }
                    }
                    saveState();
                });
            }
        } else {
            // Reset timer if group now has tabs
            delete groupTabCounts[group.id];
        }
    }
}

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

/**
 * Handle "groupTab" message from popup/content script
 * 
 * @async
 * @param {Object} msg - Message object
 * @param {string} msg.category - Optional custom category
 * @param {Function} sendResponse - Response callback
 * @returns {Promise<void>}
 */
async function handleGroupTab(msg, sendResponse) {
    try {
        const [tab] = await queryTabs({ active: true, currentWindow: true });
        if (!tab) {
            sendResponse({ success: false, error: "No active tab found" });
            return;
        }

        const settings = await loadSettings();
        if (!settings.extensionEnabled) {
            sendResponse({ success: false, error: "Extension is disabled" });
            return;
        }

        let enabledColors = [];
        if (settings.enabledColors && typeof settings.enabledColors === 'object') {
            enabledColors = Object.entries(settings.enabledColors)
                .filter(([, enabled]) => enabled)
                .map(([color]) => color);
        }

        if (enabledColors.length === 0) {
            enabledColors = [...AVAILABLE_COLORS];
        }

        let category = msg.category || "";
        if (!category.trim()) {
            const metadata = await getVideoMetadata(tab.id);
            metadata.title = tab.title;
            
            // ✅ Pass channel mapping to predictCategory
            category = predictCategory(
                metadata,
                settings.aiCategoryDetection,
                settings.categoryKeywords || DEFAULT_SETTINGS.categoryKeywords,
                settings.channelCategoryMap || {}  // ← ADD THIS
            );
        }
        category = (category || "Other").trim();

        const result = await groupTab(tab, category, enabledColors);
        sendResponse({ success: true, category, color: result.color });

    } catch (error) {
        console.error("❌ Error grouping tab:", error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Handle "isTabGrouped" message
 * 
 * @async
 * @param {Function} sendResponse - Response callback
 * @returns {Promise<void>}
 */
async function handleIsTabGrouped(sendResponse) {
    try {
        const [tab] = await queryTabs({ active: true, currentWindow: true });
        sendResponse({ grouped: tab?.groupId >= 0 });
    } catch (error) {
        sendResponse({ grouped: false, error: error.message });
    }
}

/**
 * Handle "batchGroup" message
 * 
 * @async
 * @param {Function} sendResponse - Response callback
 * @returns {Promise<void>}
 */
async function handleBatchGroup(sendResponse) {
    try {
        const result = await batchGroupAllTabs();
        sendResponse(result);
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

/**
 * Initialize extension on install/update
 */
chrome.runtime.onInstalled.addListener(async () => {
    await loadState();

    // Create context menu items
    chrome.contextMenus.create({
        id: "groupTab",
        title: "📌 Group This Tab",
        contexts: ["page"],  // ✅ CHANGED from "tab" to "page"
        documentUrlPatterns: ["https://www.youtube.com/*"]
    });

    chrome.contextMenus.create({
        id: "groupAllYT",
        title: "📚 Group All YouTube Tabs",
        contexts: ["page"]  // ✅ CHANGED from "all" to "page"
    });

    console.log("✅ YouTube Tab Grouper initialized");
});

/**
 * Handle messages from content script and popup
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "groupTab") {
        handleGroupTab(msg, sendResponse);
        return true; // Keep connection open for async response
    }

    if (msg.action === "isTabGrouped") {
        handleIsTabGrouped(sendResponse);
        return true;
    }

    if (msg.action === "batchGroup") {
        handleBatchGroup(sendResponse);
        return true;
    }

    return false;
});

/**
 * Handle context menu clicks
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    try {
        const settings = await loadSettings();
        
        if (!settings.enabledColors || typeof settings.enabledColors !== 'object') {
            console.error("Invalid enabledColors settings");
            return;
        }
        
        const enabledColors = Object.entries(settings.enabledColors)
            .filter(([, enabled]) => enabled)
            .map(([color]) => color);

        if (enabledColors.length === 0) {
            enabledColors.push(...AVAILABLE_COLORS);
        }

        if (info.menuItemId === "groupTab" && tab.url.includes("youtube.com")) {
            const metadata = await getVideoMetadata(tab.id);
            metadata.title = tab.title;
            
            // ✅ Pass channel mapping
            const category = predictCategory(
                metadata,
                settings.aiCategoryDetection,
                settings.categoryKeywords || DEFAULT_SETTINGS.categoryKeywords,
                settings.channelCategoryMap || {}  // ← ADD THIS
            );
            await groupTab(tab, category, enabledColors);
        }

        if (info.menuItemId === "groupAllYT") {
            await batchGroupAllTabs();
        }
    } catch (error) {
        console.error("Context menu error:", error);
    }
});

/**
 * Handle keyboard shortcuts
 */
chrome.commands.onCommand.addListener(async (command) => {
    try {
        const settings = await loadSettings();
        
        if (!settings.enabledColors || typeof settings.enabledColors !== 'object') {
            console.error("Invalid enabledColors settings");
            return;
        }
        
        const enabledColors = Object.entries(settings.enabledColors)
            .filter(([, enabled]) => enabled)
            .map(([color]) => color);

        if (enabledColors.length === 0) {
            console.warn("No colors enabled, using defaults");
            enabledColors.push(...AVAILABLE_COLORS);
        }

        if (command === "group-current-tab") {
            const [tab] = await queryTabs({ active: true, currentWindow: true });
            if (tab?.url.includes("youtube.com")) {
                // ✅ Pass categoryKeywords from settings
                const category = predictCategory(
                    { title: tab.title }, 
                    settings.aiCategoryDetection,
                    settings.categoryKeywords || DEFAULT_SETTINGS.categoryKeywords
                );
                await groupTab(tab, category, enabledColors);
            }
        }

        if (command === "batch-group-all") {
            await batchGroupAllTabs();
        }

        if (command === "toggle-extension") {
            settings.extensionEnabled = !settings.extensionEnabled;
            await saveSettings(settings);
            console.log(`Extension ${settings.extensionEnabled ? '✅ enabled' : '❌ disabled'}`);
        }
    } catch (error) {
        console.error("Command error:", error);
    }
});

/**
 * Clean up cache when a group is removed
 */
chrome.tabGroups.onRemoved.addListener(async (groupId) => {
    for (const [name, id] of Object.entries(groupIdMap)) {
        if (id === groupId) {
            delete groupIdMap[name];
            delete groupColorMap[name];
        }
    }
    await saveState();
});

/**
 * Sync cache when a group is renamed or color changed
 */
chrome.tabGroups.onUpdated.addListener(async (group) => {
    try {
        if (!group || typeof group !== 'object') {
            console.warn("Invalid group object in onUpdated");
            return;
        }

        for (const [name, id] of Object.entries(groupIdMap)) {
            if (id === group.id && group.title && group.title !== name) {
                delete groupIdMap[name];
                delete groupColorMap[name];
                groupIdMap[group.title] = group.id;
                if (group.color) groupColorMap[group.title] = group.color;
            }
        }
        await saveState();
    } catch (error) {
        console.error("Tab group update error:", error);
    }
});

/**
 * Run auto-cleanup every minute
 */
setInterval(() => {
    loadSettings().then(settings => {
        if (settings.autoCleanupEnabled) {
            autoCleanupEmptyGroups();
        }
    });
}, 60000);

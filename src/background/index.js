import { AVAILABLE_COLORS, DEFAULT_SETTINGS } from './constants.js';
import { loadSettings, saveSettings, runMigrations } from './storage.js';
import { predictCategory } from './categorizer.js';
import {
    initializeGroupingState,
    groupTab,
    autoCleanupEmptyGroups,
    handleGroupRemoved,
    handleGroupUpdated,
    getEnabledColors
} from './grouping.js';
import { queryTabs } from './chromeApi.js';
import { getVideoMetadata } from './metadata.js';

const initializationPromise = initializeBackground();

chrome.runtime.onInstalled.addListener(async () => {
    await ensureInitialized();
    registerContextMenus();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "groupTab") {
        handleGroupTab(msg, sendResponse);
        return true;
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

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    try {
        await ensureInitialized();

        if (info.menuItemId === "groupTab" && tab.url.includes("youtube.com")) {
            await groupSingleTab({ tab });
        }

        if (info.menuItemId === "groupAllYT") {
            await batchGroupAllTabs();
        }
    } catch (error) {
        console.error("Context menu error:", error);
    }
});

chrome.commands.onCommand.addListener(async (command) => {
    try {
        if (command === "group-current-tab") {
            const [tab] = await queryTabs({ active: true, currentWindow: true });
            if (tab?.url?.includes("youtube.com")) {
                await groupSingleTab({ tab });
            }
        }

        if (command === "batch-group-all") {
            await batchGroupAllTabs();
        }

        if (command === "toggle-extension") {
            const settings = await loadSettings();
            settings.extensionEnabled = !settings.extensionEnabled;
            await saveSettings(settings);
        }
    } catch (error) {
        console.error("Command error:", error);
    }
});

chrome.tabGroups.onRemoved.addListener(async (groupId) => {
    await handleGroupRemoved(groupId);
});

chrome.tabGroups.onUpdated.addListener(async (group) => {
    try {
        await handleGroupUpdated(group);
    } catch (error) {
        console.error("Tab group update error:", error);
    }
});

setInterval(() => {
    loadSettings().then(settings => {
        if (settings.autoCleanupEnabled) {
            autoCleanupEmptyGroups();
        }
    });
}, 60000);

async function handleGroupTab(msg, sendResponse) {
    try {
        const result = await groupSingleTab({
            category: msg.category,
            metadata: msg.metadata
        });

        sendResponse(result);
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

async function handleIsTabGrouped(sendResponse) {
    try {
        const [tab] = await queryTabs({ active: true, currentWindow: true });
        sendResponse({ grouped: tab?.groupId >= 0 });
    } catch (error) {
        sendResponse({ grouped: false, error: error.message });
    }
}

async function handleBatchGroup(sendResponse) {
    try {
        const result = await batchGroupAllTabs();
        sendResponse(result);
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

async function batchGroupAllTabs() {
    try {
        await ensureInitialized();
        const tabs = await queryTabs({
            url: "https://www.youtube.com/*",
            currentWindow: true
        });

        const settings = await loadSettings();
        if (!settings.extensionEnabled) {
            return { success: false, error: "Extension is disabled" };
        }

        const enabledColors = getEnabledColors(settings, AVAILABLE_COLORS);

        let successCount = 0;
        for (const tab of tabs) {
            try {
                const category = await resolveCategoryForTab(tab, settings);
                await groupTab(tab, category, enabledColors);
                successCount++;
            } catch (error) {
                console.error(`Failed to group tab ${tab.id}:`, error);
            }
        }

        return { success: true, count: successCount };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function initializeBackground() {
    try {
        await initializeGroupingState();
        await runMigrations();
    } catch (error) {
        console.error("Initialization error:", error);
    }
}

async function ensureInitialized() {
    try {
        await initializationPromise;
    } catch (error) {
        console.error("Failed to initialize background:", error);
    }
}

function registerContextMenus() {
    chrome.contextMenus.create({
        id: "groupTab",
        title: "📌 Group This Tab",
        contexts: ["page"],
        documentUrlPatterns: ["https://www.youtube.com/*"]
    });

    chrome.contextMenus.create({
        id: "groupAllYT",
        title: "📚 Group All YouTube Tabs",
        contexts: ["page"]
    });
}

async function groupSingleTab({ tab, category, metadata } = {}) {
    const targetTab = tab || (await getActiveYouTubeTab());
    if (!targetTab) {
        return { success: false, error: "No active tab found" };
    }

    await ensureInitialized();

    const settings = await loadSettings();
    if (!settings.extensionEnabled) {
        return { success: false, error: "Extension is disabled" };
    }

    const enabledColors = getEnabledColors(settings, AVAILABLE_COLORS);
    const resolvedCategory = await resolveCategoryForTab(targetTab, settings, metadata, category);
    const result = await groupTab(targetTab, resolvedCategory, enabledColors);

    return { success: true, category: resolvedCategory, color: result.color };
}

async function resolveCategoryForTab(tab, settings, providedMetadata = {}, providedCategory = "") {
    if (providedCategory && providedCategory.trim()) {
        return providedCategory.trim();
    }

    const metadata = await getMergedMetadata(tab, providedMetadata);

    return predictCategory(
        metadata,
        settings.aiCategoryDetection,
        settings.categoryKeywords || DEFAULT_SETTINGS.categoryKeywords,
        settings.channelCategoryMap || {}
    );
}

async function getMergedMetadata(tab, providedMetadata = {}) {
    const baseMetadata = providedMetadata.title ? providedMetadata : await getVideoMetadata(tab.id);
    return {
        title: tab.title,
        channel: "",
        description: "",
        keywords: [],
        youtubeCategory: null,
        ...baseMetadata,
        title: tab.title || baseMetadata.title || ""
    };
}

async function getActiveYouTubeTab() {
    const [activeTab] = await queryTabs({ active: true, currentWindow: true });
    if (!activeTab || !activeTab.url?.includes("youtube.com")) {
        return null;
    }
    return activeTab;
}

import { AVAILABLE_COLORS, DEFAULT_SETTINGS } from './constants.js';
import { loadSettings, saveSettings, runMigrations } from './storage.js';
import { predictCategory } from './categorizer.js';
import { initializeGroupingState, groupTab, autoCleanupEmptyGroups, handleGroupRemoved, handleGroupUpdated, getEnabledColors } from './grouping.js';
import { queryTabs } from './chromeApi.js';
import { getVideoMetadata } from './metadata.js';

initializeGroupingState();
runMigrations();

chrome.runtime.onInstalled.addListener(async () => {
    await initializeGroupingState();
    await runMigrations();

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
        const settings = await loadSettings();
        const enabledColors = getEnabledColors(settings, AVAILABLE_COLORS);

        if (info.menuItemId === "groupTab" && tab.url.includes("youtube.com")) {
            const metadata = await getVideoMetadata(tab.id);
            metadata.title = tab.title;

            const category = predictCategory(
                metadata,
                settings.aiCategoryDetection,
                settings.categoryKeywords || DEFAULT_SETTINGS.categoryKeywords,
                settings.channelCategoryMap || {}
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

chrome.commands.onCommand.addListener(async (command) => {
    try {
        const settings = await loadSettings();
        const enabledColors = getEnabledColors(settings, AVAILABLE_COLORS);

        if (command === "group-current-tab") {
            const [tab] = await queryTabs({ active: true, currentWindow: true });
            if (tab?.url?.includes("youtube.com")) {
                const metadata = await getVideoMetadata(tab.id);
                metadata.title = tab.title;

                const category = predictCategory(
                    metadata,
                    settings.aiCategoryDetection,
                    settings.categoryKeywords || DEFAULT_SETTINGS.categoryKeywords,
                    settings.channelCategoryMap || {}
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

        const enabledColors = getEnabledColors(settings, AVAILABLE_COLORS);

        let category = msg.category || "";
        if (!category.trim()) {
            let metadata = msg.metadata || {};
            if (!metadata.title) {
                metadata = await getVideoMetadata(tab.id);
            }
            metadata.title = tab.title;

            category = predictCategory(
                metadata,
                settings.aiCategoryDetection,
                settings.categoryKeywords || DEFAULT_SETTINGS.categoryKeywords,
                settings.channelCategoryMap || {}
            );
        }
        category = (category || "Other").trim();

        const result = await groupTab(tab, category, enabledColors);
        sendResponse({ success: true, category, color: result.color });
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
        const tabs = await queryTabs({
            url: "https://www.youtube.com/*",
            currentWindow: true
        });

        const settings = await loadSettings();
        const enabledColors = getEnabledColors(settings, AVAILABLE_COLORS);

        let successCount = 0;
        for (const tab of tabs) {
            try {
                const metadata = await getVideoMetadata(tab.id);
                metadata.title = tab.title;

                const category = predictCategory(
                    metadata,
                    settings.aiCategoryDetection,
                    settings.categoryKeywords || DEFAULT_SETTINGS.categoryKeywords,
                    settings.channelCategoryMap || {}
                );
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

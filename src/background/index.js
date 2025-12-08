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

bootstrap();

chrome.runtime.onInstalled.addListener(async () => {
    try {
        await initializeGroupingState();
        await runMigrations();
        await registerContextMenus();
    } catch (error) {
        console.error("Install initialization failed:", error);
    }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "groupTab") {
        handleGroupTabMessage(msg, sendResponse);
        return true;
    }

    if (msg.action === "isTabGrouped") {
        handleIsTabGroupedMessage(sendResponse);
        return true;
    }

    if (msg.action === "batchGroup") {
        handleBatchGroupMessage(sendResponse);
        return true;
    }

    return false;
});

chrome.contextMenus.onClicked.addListener(handleContextMenuClick);
chrome.commands.onCommand.addListener(handleCommand);

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
    loadSettings()
        .then((settings) => {
            if (settings.autoCleanupEnabled) {
                autoCleanupEmptyGroups();
            }
        })
        .catch((error) => console.error("Auto cleanup check failed:", error));
}, 60000);

async function bootstrap() {
    try {
        await initializeGroupingState();
        await runMigrations();
        await registerContextMenus();
    } catch (error) {
        console.error("Background bootstrap failed:", error);
    }
}

async function registerContextMenus() {
    await clearContextMenus();

    chrome.contextMenus.create({
        id: "groupTab",
        title: "Group This Tab",
        contexts: ["page"],
        documentUrlPatterns: ["https://www.youtube.com/*"]
    });

    chrome.contextMenus.create({
        id: "groupAllYT",
        title: "Group All YouTube Tabs",
        contexts: ["page"]
    });
}

async function clearContextMenus() {
    return new Promise((resolve) => {
        chrome.contextMenus.removeAll(() => {
            if (chrome.runtime.lastError) {
                console.warn("Failed to clear context menus:", chrome.runtime.lastError.message);
            }
            resolve();
        });
    });
}

async function handleGroupTabMessage(msg, sendResponse) {
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
        const category = await resolveCategory(tab, settings, msg.metadata, msg.category);
        const result = await groupTab(tab, category, enabledColors);

        sendResponse({ success: true, category, color: result.color });
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

async function handleIsTabGroupedMessage(sendResponse) {
    try {
        const [tab] = await queryTabs({ active: true, currentWindow: true });
        sendResponse({ grouped: tab?.groupId >= 0 });
    } catch (error) {
        sendResponse({ grouped: false, error: error.message });
    }
}

async function handleBatchGroupMessage(sendResponse) {
    try {
        const result = await batchGroupAllTabs();
        sendResponse(result);
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

async function handleContextMenuClick(info, tab) {
    if (!tab || !isYouTubeUrl(tab.url)) {
        return;
    }

    try {
        const settings = await loadSettings();
        if (!settings.extensionEnabled) {
            return;
        }

        const enabledColors = getEnabledColors(settings, AVAILABLE_COLORS);

        if (info.menuItemId === "groupTab") {
            const category = await resolveCategory(tab, settings);
            await groupTab(tab, category, enabledColors);
        }

        if (info.menuItemId === "groupAllYT") {
            await batchGroupAllTabs(settings, enabledColors);
        }
    } catch (error) {
        console.error("Context menu error:", error);
    }
}

async function handleCommand(command) {
    try {
        const settings = await loadSettings();
        const enabledColors = getEnabledColors(settings, AVAILABLE_COLORS);

        if (command === "group-current-tab") {
            const [tab] = await queryTabs({ active: true, currentWindow: true });
            if (tab && isYouTubeUrl(tab.url) && settings.extensionEnabled) {
                const category = await resolveCategory(tab, settings);
                await groupTab(tab, category, enabledColors);
            }
        }

        if (command === "batch-group-all" && settings.extensionEnabled) {
            await batchGroupAllTabs(settings, enabledColors);
        }

        if (command === "toggle-extension") {
            settings.extensionEnabled = !settings.extensionEnabled;
            await saveSettings(settings);
        }
    } catch (error) {
        console.error("Command error:", error);
    }
}

async function batchGroupAllTabs(settingsOverride, enabledColorsOverride) {
    try {
        const tabs = await queryTabs({
            url: "https://www.youtube.com/*",
            currentWindow: true
        });

        const settings = settingsOverride || await loadSettings();
        if (!settings.extensionEnabled) {
            return { success: false, error: "Extension is disabled" };
        }

        const enabledColors = enabledColorsOverride || getEnabledColors(settings, AVAILABLE_COLORS);

        let successCount = 0;
        for (const tab of tabs) {
            try {
                const category = await resolveCategory(tab, settings);
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

async function resolveCategory(tab, settings, metadataOverride = {}, requestedCategory = "") {
    if (requestedCategory && requestedCategory.trim()) {
        return requestedCategory.trim();
    }

    let metadata = metadataOverride || {};
    if (!metadata.title) {
        metadata = await getVideoMetadata(tab.id);
    }
    metadata.title = tab.title;

    return predictCategory(
        metadata,
        settings.aiCategoryDetection,
        settings.categoryKeywords || DEFAULT_SETTINGS.categoryKeywords,
        settings.channelCategoryMap || {}
    ) || "Other";
}

function isYouTubeUrl(url = "") {
    return url.includes("youtube.com");
}

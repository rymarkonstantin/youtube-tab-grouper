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
import {
    MESSAGE_ACTIONS,
    buildBatchGroupResponse,
    buildErrorResponse,
    buildGroupTabResponse,
    buildIsGroupedResponse,
    buildSettingsResponse
} from '../shared/messages.js';
import { handleMessage, generateRequestId, MESSAGE_VERSION } from '../shared/messaging.js';

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

const MESSAGE_ROUTES = {
    [MESSAGE_ACTIONS.GROUP_TAB]: {
        requiresEnabled: true,
        handler: handleGroupTabMessage
    },
    [MESSAGE_ACTIONS.BATCH_GROUP]: {
        requiresEnabled: true,
        handler: handleBatchGroupMessage
    },
    [MESSAGE_ACTIONS.GET_SETTINGS]: {
        requiresEnabled: false,
        handler: handleGetSettingsMessage
    },
    [MESSAGE_ACTIONS.IS_TAB_GROUPED]: {
        requiresEnabled: false,
        handler: handleIsTabGroupedMessage
    }
};

const backgroundDispatcher = handleMessage(
    buildRouteHandlers(MESSAGE_ROUTES),
    {
        requireVersion: true,
        onUnknown: (action) => buildErrorResponse(`Unknown action "${action || "undefined"}"`)
    }
);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (isLegacyGroupTab(msg)) {
        const translated = {
            ...msg,
            action: MESSAGE_ACTIONS.GROUP_TAB,
            version: MESSAGE_VERSION,
            requestId: msg?.requestId || generateRequestId("legacy")
        };
        console.warn("[compat] Received legacy groupTab message; translating to v1 envelope (will be removed in next release).");
        return backgroundDispatcher(translated, sender, sendResponse);
    }

    return backgroundDispatcher(msg, sender, sendResponse);
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

function buildRouteHandlers(routes) {
    return Object.entries(routes).reduce((acc, [action, route]) => {
        acc[action] = async (msg, sender) => {
            let settings = null;

            if (route.requiresEnabled) {
                settings = await loadSettings();
                if (!settings.extensionEnabled) {
                    return buildErrorResponse("Extension is disabled");
                }
            }

            return route.handler(msg, sender, settings);
        };
        return acc;
    }, {});
}

function isLegacyGroupTab(msg) {
    return msg
        && typeof msg === 'object'
        && msg.action === "groupTab"
        && (msg.version === undefined || msg.requestId === undefined);
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

async function handleGroupTabMessage(msg, sender, preloadedSettings) {
    const [tab] = await queryTabs({ active: true, currentWindow: true });
    if (!tab) {
        return buildErrorResponse("No active tab found");
    }

    const settings = preloadedSettings || await loadSettings();
    if (!settings.extensionEnabled) {
        return buildErrorResponse("Extension is disabled");
    }

    const enabledColors = getEnabledColors(settings, AVAILABLE_COLORS);
    const category = await resolveCategory(tab, settings, msg.metadata, msg.category);
    const result = await groupTab(tab, category, enabledColors);

    return buildGroupTabResponse({ category, color: result.color });
}

async function handleIsTabGroupedMessage() {
    try {
        const [tab] = await queryTabs({ active: true, currentWindow: true });
        return buildIsGroupedResponse(tab?.groupId >= 0);
    } catch (error) {
        return buildIsGroupedResponse(false, error.message);
    }
}

async function handleBatchGroupMessage(msg, sender, preloadedSettings) {
    try {
        const result = await batchGroupAllTabs(preloadedSettings);
        return result;
    } catch (error) {
        return buildErrorResponse(error.message);
    }
}

async function handleGetSettingsMessage() {
    try {
        const settings = await loadSettings();
        return buildSettingsResponse(settings);
    } catch (error) {
        return buildErrorResponse(error.message);
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
            return buildErrorResponse("Extension is disabled");
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

        return buildBatchGroupResponse(successCount);
    } catch (error) {
        return buildErrorResponse(error.message);
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

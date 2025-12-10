import { AVAILABLE_COLORS, DEFAULT_SETTINGS } from "./constants";
import { categoryResolver } from "./services/categoryResolver";
import {
  initializeGroupingState,
  groupTab,
  autoCleanupEmptyGroups,
  handleGroupRemoved,
  handleGroupUpdated,
  getEnabledColors
} from "./tabGrouping";
import { getVideoMetadata } from "./metadataFetcher";
import { chromeApiClient } from "./infra/chromeApiClient";
import { settingsRepository } from "./repositories/settingsRepository";
import { runMigrations } from "./infra/migrations";
import {
  MESSAGE_ACTIONS,
  MessageAction,
  buildBatchGroupResponse,
  buildErrorResponse,
  buildGroupTabResponse,
  buildIsGroupedResponse,
  buildSettingsResponse
} from "../shared/messageContracts";
import { generateRequestId, MESSAGE_VERSION } from "../shared/messageTransport";
import { logDebug, setDebugLogging } from "./logger";
import { MessageRouter } from "../shared/messaging/messageRouter";
import type { Settings, Metadata, GroupTabRequest } from "../shared/types";

const toErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
};

void bootstrap();

chrome.runtime.onInstalled.addListener(() => {
  void (async () => {
    try {
      await initializeGroupingState();
      await runMigrations();
      await registerContextMenus();
    } catch (error) {
      console.error("Install initialization failed:", error);
    }
  })();
});

type RouteHandler = (
  msg: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
  settings?: Settings
) => Promise<unknown>;

interface RouteConfig {
  requiresEnabled: boolean;
  handler: RouteHandler;
}

const MESSAGE_ROUTES: Partial<Record<MessageAction, RouteConfig>> = {
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

const backgroundRouter = new MessageRouter(buildRouteHandlers(MESSAGE_ROUTES), {
  requireVersion: true,
  onUnknown: (action) => buildErrorResponse(`Unknown action "${action || "undefined"}"`)
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (isLegacyGroupTab(msg)) {
    const baseMsg = msg && typeof msg === "object" ? (msg as Record<string, unknown>) : {};
    const translated = {
      ...baseMsg,
      action: MESSAGE_ACTIONS.GROUP_TAB,
      version: MESSAGE_VERSION,
      requestId: typeof baseMsg.requestId === "string" ? baseMsg.requestId : generateRequestId("legacy")
    };
    console.warn("[compat] Received legacy groupTab message; translating to v1 envelope (will be removed in next release).");
    return backgroundRouter.listener(translated, sender, sendResponse);
  }

  return backgroundRouter.listener(msg, sender, sendResponse);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void handleContextMenuClick(info, tab);
});
chrome.commands.onCommand.addListener((command) => {
  void handleCommand(command);
});

chrome.tabGroups.onRemoved.addListener((group) => {
  void handleGroupRemoved(group.id);
});

chrome.tabGroups.onUpdated.addListener((group) => {
  void (async () => {
    try {
      await handleGroupUpdated(group);
    } catch (error) {
      console.error("Tab group update error:", error);
    }
  })();
});

setInterval(() => {
  void settingsRepository
    .get()
    .then((settings) => {
      if (settings.autoCleanupEnabled) {
        void autoCleanupEmptyGroups(settings.autoCleanupGraceMs);
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

function buildRouteHandlers(routes: Partial<Record<MessageAction, RouteConfig>>) {
  return Object.entries(routes).reduce<Partial<Record<MessageAction, RouteHandler>>>((acc, [action, route]) => {
    if (!route) return acc;
    acc[action as MessageAction] = async (msg, sender) => {
      let settings: Settings | null = null;

      if (route.requiresEnabled) {
        settings = await settingsRepository.get();
        setDebugLogging(settings.debugLogging);
        if (!settings.extensionEnabled) {
          return buildErrorResponse("Extension is disabled");
        }
      }

      const context = {
        action,
        tabId: sender?.tab?.id,
        windowId: sender?.tab?.windowId
      };

      logDebug("action:start", context);
      try {
        const result = await route.handler(msg, sender, settings ?? undefined);
        logDebug("action:success", { ...context, result });
        return result;
      } catch (error) {
        logDebug("action:error", { ...context, error: toErrorMessage(error) });
        throw error;
      }
    };
    return acc;
  }, {});
}

function isLegacyGroupTab(msg) {
  return (
    msg &&
    typeof msg === "object" &&
    (msg as { action?: string }).action === "groupTab" &&
    ((msg as { version?: unknown }).version === undefined || (msg as { requestId?: unknown }).requestId === undefined)
  );
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
  return new Promise<void>((resolve) => {
    chrome.contextMenus.removeAll(() => {
      if (chrome.runtime.lastError) {
        console.warn("Failed to clear context menus:", chrome.runtime.lastError.message);
      }
      resolve();
    });
  });
}

async function handleGroupTabMessage(msg: GroupTabRequest, sender: chrome.runtime.MessageSender, preloadedSettings?: Settings) {
  const [tab] = await chromeApiClient.queryTabs({ active: true, currentWindow: true });
  if (tab?.id === undefined) {
    return buildErrorResponse("No active tab found");
  }

  const settings = preloadedSettings || (await settingsRepository.get());
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
    const [tab] = await chromeApiClient.queryTabs({ active: true, currentWindow: true });
    return buildIsGroupedResponse((tab?.groupId ?? -1) >= 0);
  } catch (error) {
    return buildIsGroupedResponse(false, (error as Error)?.message);
  }
}

async function handleBatchGroupMessage(_msg: unknown, _sender: chrome.runtime.MessageSender, preloadedSettings?: Settings) {
  try {
    const result = await batchGroupAllTabs(preloadedSettings);
    return result;
  } catch (error) {
    return buildErrorResponse((error as Error)?.message || "Batch grouping failed");
  }
}

async function handleGetSettingsMessage() {
  try {
    const settings = await settingsRepository.get();
    return buildSettingsResponse({ ...settings });
  } catch (error) {
    return buildErrorResponse((error as Error)?.message || "Failed to load settings");
  }
}

async function handleContextMenuClick(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) {
  if (!tab || !isYouTubeUrl(tab.url)) {
    return;
  }

  try {
    const settings = await settingsRepository.get();
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

async function handleCommand(command: string) {
  try {
    const settings = await settingsRepository.get();
    const enabledColors = getEnabledColors(settings, AVAILABLE_COLORS);

    if (command === "group-current-tab") {
      const [tab] = await chromeApiClient.queryTabs({ active: true, currentWindow: true });
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
      await settingsRepository.save(settings);
    }
  } catch (error) {
    console.error("Command error:", error);
  }
}

async function batchGroupAllTabs(settingsOverride?: Settings, enabledColorsOverride?: string[]) {
  try {
    const tabs = await chromeApiClient.queryTabs({
      url: "https://www.youtube.com/*",
      currentWindow: true
    });

    const settings = settingsOverride || (await settingsRepository.get());
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
    return buildErrorResponse((error as Error)?.message || "Batch grouping failed");
  }
}

async function resolveCategory(
  tab: chrome.tabs.Tab,
  settings: Settings,
  metadataOverride: Partial<Metadata> = {},
  requestedCategory = ""
) {
  if (tab.id === undefined) {
    throw new Error("Cannot resolve category for tab without id");
  }

  const trimmedCategory = requestedCategory?.trim();
  if (trimmedCategory) {
    return trimmedCategory;
  }

  const metadata = await getVideoMetadata(tab.id, {
    fallbackMetadata: metadataOverride,
    fallbackTitle: tab?.title || ""
  });

  return categoryResolver.resolve(metadata, {
    requestedCategory,
    aiEnabled: settings.aiCategoryDetection,
    categoryKeywords: settings.categoryKeywords || DEFAULT_SETTINGS.categoryKeywords,
    channelMap: settings.channelCategoryMap || {}
  });
}

function isYouTubeUrl(url = "") {
  return url.includes("youtube.com");
}

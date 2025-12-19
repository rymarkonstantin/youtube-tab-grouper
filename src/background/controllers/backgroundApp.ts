import {
  MESSAGE_ACTIONS,
  MessageAction,
  buildBatchGroupResponse,
  buildErrorResponse,
  buildGroupTabResponse,
  buildIsGroupedResponse,
  buildSettingsResponse
} from "../../shared/messageContracts";
import { MESSAGE_VERSION, generateRequestId } from "../../shared/messageTransport";
import { HandlerContext, MessageRouter, RouterMiddleware } from "../../shared/messaging/messageRouter";
import { computeEnabledColors } from "../../shared/settings";
import type { GroupTabRequest, Settings } from "../../shared/types";
import { toErrorMessage } from "../../shared/utils/errorUtils";
import { AVAILABLE_COLORS } from "../constants";
import { chromeApiClient } from "../infra/chromeApiClient";
import { runMigrations } from "../infra/migrations";
import { logDebug, setDebugLogging } from "../logger";
import { settingsRepository } from "../repositories/settingsRepository";
import { cleanupScheduler } from "../services/cleanupScheduler";
import { tabGroupingService } from "../tabGrouping";
import { runWithErrorHandling } from "../utils/ErrorHandling";

type RouteHandler = (
  msg: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
  context: HandlerContext
) => Promise<unknown>;

interface RouteConfig {
  requiresEnabled: boolean;
  handler: RouteHandler;
}

interface BackgroundAppDeps {
  router?: MessageRouter;
  settingsRepo?: typeof settingsRepository;
  groupingService?: typeof tabGroupingService;
  cleanupScheduler?: typeof cleanupScheduler;
  chromeApi?: typeof chromeApiClient;
}

export class BackgroundApp {
  private router: MessageRouter;
  private settingsRepo: typeof settingsRepository;
  private groupingService: typeof tabGroupingService;
  private cleanupScheduler: typeof cleanupScheduler;
  private chromeApi: typeof chromeApiClient;

  private started = false;

  constructor(deps: BackgroundAppDeps = {}) {
    this.settingsRepo = deps.settingsRepo ?? settingsRepository;
    this.groupingService = deps.groupingService ?? tabGroupingService;
    this.cleanupScheduler = deps.cleanupScheduler ?? cleanupScheduler;
    this.chromeApi = deps.chromeApi ?? chromeApiClient;
    const { handlers, middleware } = this.buildRouteHandlers();
    this.router =
      deps.router ??
      new MessageRouter(handlers, {
        requireVersion: true,
        middleware,
        onUnknown: (action) => buildErrorResponse(`Unknown action "${action || "undefined"}"`)
      });
  }

  async start() {
    if (this.started) return;
    this.started = true;

    await this.groupingService.initialize();
    await runMigrations();
    await this.registerContextMenus();
    this.cleanupScheduler.start();

    chrome.runtime.onMessage.addListener(this.handleMessage);
    chrome.contextMenus.onClicked.addListener(this.handleContextMenuClick);
    chrome.commands.onCommand.addListener(this.handleCommand);
  }

  stop() {
    if (!this.started) return;
    this.started = false;

    chrome.runtime.onMessage.removeListener(this.handleMessage);
    chrome.contextMenus.onClicked.removeListener(this.handleContextMenuClick);
    chrome.commands.onCommand.removeListener(this.handleCommand);
    this.cleanupScheduler.stop();
  }

  private handleMessage = (msg: unknown, sender: chrome.runtime.MessageSender, sendResponse: (value: unknown) => void) => {
    if (isLegacyGroupTab(msg)) {
      const baseMsg = msg && typeof msg === "object" ? (msg as Record<string, unknown>) : {};
      const translated = {
        ...baseMsg,
        action: MESSAGE_ACTIONS.GROUP_TAB,
        version: MESSAGE_VERSION,
        requestId: typeof baseMsg.requestId === "string" ? baseMsg.requestId : generateRequestId("legacy")
      };
      console.warn(
        "[compat] Received legacy groupTab message; translating to v1 envelope (will be removed in next release)."
      );
      return this.router.listener(translated, sender, sendResponse);
    }

    return this.router.listener(msg, sender, sendResponse);
  };

  private handleContextMenuClick = (info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => {
    void runWithErrorHandling(
      "contextMenu:click",
      async () => {
        if (!tab || !this.isYouTubeUrl(tab.url)) {
          return;
        }

        const settings = await this.settingsRepo.get();
        if (!settings.extensionEnabled) {
          return;
        }

        const enabledColors = computeEnabledColors(settings);

        if (info.menuItemId === "groupTab") {
          const category = await this.groupingService.resolveCategory(tab, settings);
          await this.groupingService.groupTab(tab, category, enabledColors);
        }

        if (info.menuItemId === "groupAllYT") {
          await this.batchGroupAllTabs(settings);
        }
      },
      { fallbackMessage: "Context menu error", mapError: () => undefined }
    );
  };

  private handleCommand = (command: string) => {
    void runWithErrorHandling(
      "command",
      async () => {
        const settings = await this.settingsRepo.get();
        const enabledColors = computeEnabledColors(settings);

        if (command === "group-current-tab") {
          const [tab] = await this.chromeApi.queryTabs({ active: true, currentWindow: true });
          if (tab && this.isYouTubeUrl(tab.url) && settings.extensionEnabled) {
            const category = await this.groupingService.resolveCategory(tab, settings);
            await this.groupingService.groupTab(tab, category, enabledColors);
          }
        }

        if (command === "batch-group-all" && settings.extensionEnabled) {
          await this.batchGroupAllTabs(settings);
        }

        if (command === "toggle-extension") {
          settings.extensionEnabled = !settings.extensionEnabled;
          await this.settingsRepo.save(settings);
        }
      },
      { fallbackMessage: "Command error", mapError: () => undefined }
    );
  };

  private async registerContextMenus() {
    await new Promise<void>((resolve) => {
      chrome.contextMenus.removeAll(() => {
        if (chrome.runtime.lastError) {
          console.warn("Failed to clear context menus:", chrome.runtime.lastError.message);
        }
        resolve();
      });
    });

    chrome.contextMenus.create({
      id: "groupTab",
      title: "Group This Tab",
      contexts: ["page"],
      documentUrlPatterns: ["https://www.youtube.com/*"]
    });

    chrome.contextMenus.create({
      id: "groupAllYT",
      title: "Group All YouTube Tabs",
      contexts: ["page"],
      documentUrlPatterns: ["https://www.youtube.com/*"]
    });
  }

  private async batchGroupAllTabs(settingsOverride?: Settings) {
    return runWithErrorHandling(
      "batchGroupAllTabs",
      async () => {
        const tabs = await this.chromeApi.queryTabs({
          url: "https://www.youtube.com/*",
          currentWindow: true
        });

        const settings = settingsOverride || (await this.settingsRepo.get());
        const { count, errors } = await this.groupingService.groupTabs(tabs, settings);

        if (errors.length && count === 0) {
          return buildErrorResponse(errors.join("; "));
        }

        return buildBatchGroupResponse(count, errors.length ? { errors } : {});
      },
      {
        fallbackMessage: "Batch grouping failed",
        mapError: (error) => buildErrorResponse((error as Error)?.message || "Batch grouping failed")
      }
    );
  }

  private isYouTubeUrl(url = "") {
    return url.includes("youtube.com");
  }

  private buildRouteHandlers() {
    const routes: Partial<Record<MessageAction, RouteConfig>> = {
      [MESSAGE_ACTIONS.GROUP_TAB]: {
        requiresEnabled: true,
        handler: this.handleGroupTabMessage
      },
      [MESSAGE_ACTIONS.BATCH_GROUP]: {
        requiresEnabled: true,
        handler: this.handleBatchGroupMessage
      },
      [MESSAGE_ACTIONS.GET_SETTINGS]: {
        requiresEnabled: false,
        handler: this.handleGetSettingsMessage
      },
      [MESSAGE_ACTIONS.IS_TAB_GROUPED]: {
        requiresEnabled: false,
        handler: this.handleIsTabGroupedMessage
      }
    };

    const handlers = Object.entries(routes).reduce<Partial<Record<MessageAction, RouteHandler>>>(
      (acc, [action, route]) => {
        if (!route) return acc;
        acc[action as MessageAction] = route.handler;
        return acc;
      },
      {}
    );

    const middleware = [
      this.buildSettingsMiddleware(routes),
      this.buildLoggingMiddleware()
    ];

    return { handlers, middleware };
  }

  private buildSettingsMiddleware(routes: Partial<Record<MessageAction, RouteConfig>>): RouterMiddleware {
    return async (context, next) => {
      const route = routes[context.action as MessageAction];
      if (!route?.requiresEnabled) {
        return next();
      }

      const settings = await this.settingsRepo.get();
      setDebugLogging(settings.debugLogging);
      if (!settings.extensionEnabled) {
        return buildErrorResponse("Extension is disabled");
      }

      context.state.settings = settings;
      return next();
    };
  }

  private buildLoggingMiddleware(): RouterMiddleware {
    return async (context, next) => {
      const logContext = {
        action: context.action,
        tabId: context.sender?.tab?.id,
        windowId: context.sender?.tab?.windowId
      };

      logDebug("action:start", logContext);
      try {
        const result = await next();
        logDebug("action:success", { ...logContext, result });
        return result;
      } catch (error) {
        logDebug("action:error", { ...logContext, error: toErrorMessage(error) });
        throw error;
      }
    };
  }

  private handleIsTabGroupedMessage: RouteHandler = async () =>
    runWithErrorHandling(
      "route:isTabGrouped",
      async () => {
        const [tab] = await this.chromeApi.queryTabs({ active: true, currentWindow: true });
        return buildIsGroupedResponse((tab?.groupId ?? -1) >= 0);
      },
      {
        fallbackMessage: "Failed to check group state",
        mapError: (error) => buildIsGroupedResponse(false, toErrorMessage(error))
      }
    );

  private handleGetSettingsMessage: RouteHandler = async () =>
    runWithErrorHandling(
      "route:getSettings",
      async () => {
        const settings = await this.settingsRepo.get();
        return buildSettingsResponse({ ...settings });
      },
      {
        fallbackMessage: "Failed to load settings",
        mapError: (error) =>
          buildSettingsResponse({}, { error: toErrorMessage(error) || "Failed to load settings" })
      }
    );

  private handleGroupTabMessage: RouteHandler = async (msg, sender, context) =>
    runWithErrorHandling(
      "route:groupTab",
      async () => {
        const [tab] = await this.chromeApi.queryTabs({ active: true, currentWindow: true });
        if (tab?.id === undefined) {
          return buildErrorResponse("No active tab found");
        }

        const settings = (context.state.settings as Settings | undefined) || (await this.settingsRepo.get());
        if (!settings.extensionEnabled) {
          return buildErrorResponse("Extension is disabled");
        }

        const enabledColors = computeEnabledColors(settings, AVAILABLE_COLORS);
        const category = await this.groupingService.resolveCategory(
          tab,
          settings,
          (msg as GroupTabRequest).metadata,
          (msg as GroupTabRequest).category
        );
        const result = await this.groupingService.groupTab(tab, category, enabledColors);

        return buildGroupTabResponse({ category, color: result.color });
      },
      {
        fallbackMessage: "Failed to group tab",
        mapError: (error) => buildErrorResponse(toErrorMessage(error) || "Failed to group tab")
      }
    );

  private handleBatchGroupMessage: RouteHandler = async (_msg, _sender, context) =>
    runWithErrorHandling(
      "route:batchGroup",
      async () => this.batchGroupAllTabs(context.state.settings as Settings | undefined),
      {
        fallbackMessage: "Batch grouping failed",
        mapError: (error) => buildErrorResponse((error as Error)?.message || "Batch grouping failed")
      }
    );
}

function isLegacyGroupTab(msg: unknown) {
  return (
    msg &&
    typeof msg === "object" &&
    (msg as { action?: string }).action === "groupTab" &&
    ((msg as { version?: unknown }).version === undefined || (msg as { requestId?: unknown }).requestId === undefined)
  );
}


// removed standalone handler functions; logic moved into BackgroundApp methods

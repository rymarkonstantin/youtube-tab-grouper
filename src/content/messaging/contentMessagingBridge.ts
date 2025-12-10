import { MESSAGE_ACTIONS } from "../../shared/messageContracts";
import { MessageRouter } from "../../shared/messaging/messageRouter";
import type { Metadata } from "../../shared/types";
import { normalizeVideoMetadata } from "../../shared/metadataSchema";

export interface ContentMessagingBridgeOptions {
  getMetadata?: () => Promise<Metadata> | Metadata;
  isEnabled?: () => boolean;
}

export class ContentMessagingBridge {
  private router: MessageRouter;
  private getMetadata?: () => Promise<Metadata> | Metadata;
  private isEnabled?: () => boolean;

  constructor(options: ContentMessagingBridgeOptions = {}) {
    this.getMetadata = options.getMetadata;
    this.isEnabled = options.isEnabled;

    this.router = new MessageRouter(
      {
        [MESSAGE_ACTIONS.GET_VIDEO_METADATA]: this.handleGetVideoMetadata
      },
      {
        requireVersion: true,
        onUnknown: (action, msg) => {
          console.warn(
            `Unknown content message action: ${action || (msg as { action?: string })?.action || "undefined"}`
          );
          return false;
        }
      }
    );
  }

  start() {
    chrome.runtime.onMessage.addListener(this.router.listener);
  }

  stop() {
    chrome.runtime.onMessage.removeListener(this.router.listener);
  }

  private handleGetVideoMetadata = async () => {
    const enabled = typeof this.isEnabled === "function" ? this.isEnabled() : true;
    if (!enabled) {
      return normalizeVideoMetadata();
    }
    const raw = typeof this.getMetadata === "function" ? await this.getMetadata() : {};
    return normalizeVideoMetadata(raw);
  };
}

export const createContentMessagingBridge = (options: ContentMessagingBridgeOptions = {}) =>
  new ContentMessagingBridge(options);

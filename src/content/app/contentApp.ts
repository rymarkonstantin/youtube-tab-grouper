import type { GroupTabResponse, Metadata, Settings } from "../../shared/types";
import { toErrorMessage } from "../../shared/utils/errorUtils";
import { isEnabled, loadConfig } from "../config";
import { sendGroupTab, sendIsTabGrouped } from "../messageClient";
import { ContentMessagingBridge } from "../messaging/contentMessagingBridge";
import { AutoGroupController } from "./autoGroupController";
import { GroupButtonView } from "./groupButtonView";
import { MetadataCollector } from "./metadataCollector";

const DISABLED_GROUP_RESPONSE: GroupTabResponse = { success: false, error: "Extension is disabled" };

export class ContentApp {
  private config: Settings | null = null;
  private lastGroupedMetadataHash: string | null = null;
  private autoGroup = new AutoGroupController();
  private buttonView = new GroupButtonView();
  private bridge: ContentMessagingBridge;
  private metadataCollector = new MetadataCollector();

  constructor() {
    this.bridge = new ContentMessagingBridge({
      getMetadata: () => this.getNormalizedMetadata(),
      isEnabled: () => isEnabled(this.config)
    });
  }

  async start() {
    await this.initialize();

    if (document.readyState === "loading") {
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          this.bridge.start();
        },
        { once: true }
      );
    } else {
      this.bridge.start();
    }

    const onPageHide = () => this.stop();
    window.addEventListener("pagehide", onPageHide, { once: true });
  }

  stop() {
    this.autoGroup.cancel();
    this.buttonView.remove();
    this.bridge.stop();
  }

  private async initialize() {
    try {
      this.config = await loadConfig();

      if (!isEnabled(this.config)) {
        console.log("YouTube Tab Grouper is disabled");
        return;
      }

      await this.renderButton();

      this.autoGroup.start(this.config, () => this.triggerAutoGroup());
    } catch (error) {
      console.error("Error initializing YouTube Tab Grouper:", toErrorMessage(error));
    }
  }

  private getNormalizedMetadata() {
    return this.metadataCollector.collect();
  }

  private computeMetadataHash(metadata: Metadata) {
    try {
      return JSON.stringify(metadata);
    } catch (error) {
      console.warn("Failed to compute metadata hash:", toErrorMessage(error));
      return null;
    }
  }

  private async requestGroupTab(category: string, metadata: Metadata): Promise<GroupTabResponse> {
    if (!isEnabled(this.config)) {
      return DISABLED_GROUP_RESPONSE;
    }

    try {
      return await sendGroupTab({ category, metadata });
    } catch (error) {
      return { success: false, error: toErrorMessage(error) };
    }
  }

  private async handleManualGroup() {
    const metadata = this.getNormalizedMetadata();
    const metadataHash = this.computeMetadataHash(metadata);
    const response = await this.requestGroupTab("", metadata);
    if (response?.success) {
      this.buttonView.remove();
      this.lastGroupedMetadataHash = metadataHash;
      console.log(`Tab grouped as "${response.category}"`);
    } else if (response?.error) {
      console.warn("Manual grouping failed:", response.error);
    }
  }

  private async renderButton() {
    if (!isEnabled(this.config)) return null;

    try {
      const groupedCheck = await sendIsTabGrouped();
      if (groupedCheck?.grouped) {
        this.buttonView.remove();
        return null;
      }
    } catch (error) {
      console.warn("Grouped status check failed:", toErrorMessage(error));
    }

    return this.buttonView.render(() => {
      void this.handleManualGroup();
    });
  }

  private async triggerAutoGroup() {
    const metadata = this.getNormalizedMetadata();
    const metadataHash = this.computeMetadataHash(metadata);

    if (metadataHash && metadataHash === this.lastGroupedMetadataHash) {
      return;
    }

    const response = await this.requestGroupTab("", metadata);
    if (response?.success) {
      this.buttonView.remove();
      this.lastGroupedMetadataHash = metadataHash;
      console.log(`Auto-grouped as "${response.category}"`);
    } else if (response?.error) {
      console.warn("Auto-group failed:", response.error);
    }
  }
}

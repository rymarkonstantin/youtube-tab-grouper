import { normalizeVideoMetadata } from "../shared/metadataSchema";
import type { GroupTabResponse, Metadata, Settings } from "../shared/types";
import { isEnabled, loadConfig } from "./config";
import { cancelAutoGroup, startAutoGroup } from "./autoGroup";
import { removeGroupButton, renderGroupButton } from "./dom";
import { extractVideoMetadata } from "./metadataExtractor";
import { registerMessageHandlers, sendGroupTab, sendIsTabGrouped } from "./messageClient";

const DISABLED_GROUP_RESPONSE: GroupTabResponse = { success: false, error: "Extension is disabled" };

export function startContent() {
  let config: Settings | null = null;
  let lastGroupedMetadataHash: string | null = null;

  const getNormalizedMetadata = () => normalizeVideoMetadata(extractVideoMetadata());
  const computeMetadataHash = (metadata: Metadata) => {
    try {
      return JSON.stringify(metadata);
    } catch (error) {
      console.warn("Failed to compute metadata hash:", (error as Error)?.message || error);
      return null;
    }
  };

  const requestGroupTab = async (category: string, metadata: Metadata): Promise<GroupTabResponse> => {
    if (!isEnabled(config)) {
      return DISABLED_GROUP_RESPONSE;
    }

    try {
      return await sendGroupTab({ category, metadata });
    } catch (error) {
      return { success: false, error: (error as Error)?.message || "Failed to group tab" };
    }
  };

  const handleManualGroup = async () => {
    const metadata = getNormalizedMetadata();
    const metadataHash = computeMetadataHash(metadata);
    const response = await requestGroupTab("", metadata);
    if (response?.success) {
      removeGroupButton();
      lastGroupedMetadataHash = metadataHash;
      console.log(`Tab grouped as "${response.category}"`);
    } else if (response?.error) {
      console.warn("Manual grouping failed:", response.error);
    }
  };

  const renderButton = async () => {
    if (!isEnabled(config)) return null;

    try {
      const groupedCheck = await sendIsTabGrouped();
      if (groupedCheck?.grouped) {
        removeGroupButton();
        return null;
      }
    } catch (error) {
      console.warn("Grouped status check failed:", (error as Error)?.message || error);
    }

    return renderGroupButton({ onClick: () => { void handleManualGroup(); } });
  };

  const triggerAutoGroup = async () => {
    const metadata = getNormalizedMetadata();
    const metadataHash = computeMetadataHash(metadata);

    if (metadataHash && metadataHash === lastGroupedMetadataHash) {
      return;
    }

    const response = await requestGroupTab("", metadata);
    if (response?.success) {
      removeGroupButton();
      lastGroupedMetadataHash = metadataHash;
      console.log(`Auto-grouped as "${response.category}"`);
    } else if (response?.error) {
      console.warn("Auto-group failed:", response.error);
    }
  };

  const initialize = async () => {
    try {
      config = await loadConfig();

      if (!isEnabled(config)) {
        console.log("YouTube Tab Grouper is disabled");
        return;
      }

      await renderButton();

      startAutoGroup({
        config,
        onGroup: triggerAutoGroup
      });

      registerMessageHandlers({
        getMetadata: getNormalizedMetadata,
        isEnabled: () => isEnabled(config)
      });
    } catch (error) {
      console.error("Error initializing YouTube Tab Grouper:", error);
    }
  };

  const cleanup = () => {
    cancelAutoGroup();
    removeGroupButton();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { void initialize(); }, { once: true });
  } else {
    void initialize();
  }

  // Some pages (e.g., YouTube) disallow unload handlers by permission policy.
  // Use pagehide to trigger cleanup when the document is discarded.
  const onPageHide = () => cleanup();
  window.addEventListener("pagehide", onPageHide, { once: true });
}

startContent();

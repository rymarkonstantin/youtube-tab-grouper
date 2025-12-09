import { normalizeVideoMetadata } from '../shared/metadataSchema.js';
import { isEnabled, loadConfig } from './config.js';
import { cancelAutoGroup, startAutoGroup } from './autoGroup.js';
import { removeGroupButton, renderGroupButton } from './dom.js';
import { extractVideoMetadata } from './metadataExtractor.js';
import { registerMessageHandlers, sendGroupTab, sendIsTabGrouped } from './messageClient.js';

const DISABLED_GROUP_RESPONSE = { success: false, error: "Extension is disabled" };

export function startContent() {
    let config = null;

    const getNormalizedMetadata = () => normalizeVideoMetadata(extractVideoMetadata());

    const requestGroupTab = async (category, metadata) => {
        if (!isEnabled(config)) {
            return DISABLED_GROUP_RESPONSE;
        }

        try {
            return await sendGroupTab({ category, metadata });
        } catch (error) {
            return { success: false, error: error?.message || "Failed to group tab" };
        }
    };

    const handleManualGroup = async () => {
        const metadata = extractVideoMetadata();
        const response = await requestGroupTab("", metadata);
        if (response?.success) {
            removeGroupButton();
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
            console.warn("Grouped status check failed:", error?.message || error);
        }

        return renderGroupButton({ onClick: handleManualGroup });
    };

    const triggerAutoGroup = () => requestGroupTab("", extractVideoMetadata())
        .then((response) => {
            if (response?.success) {
                removeGroupButton();
                console.log(`Auto-grouped as "${response.category}"`);
            } else if (response?.error) {
                console.warn("Auto-group failed:", response.error);
            }
        });

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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }

    window.addEventListener('unload', cleanup, { once: true });
}

startContent();

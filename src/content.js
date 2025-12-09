import { normalizeVideoMetadata } from './shared/messages.js';
import { isEnabled, loadConfig } from './content/config.js';
import { resolveCategory } from './content/category.js';
import { cancelAutoGroup, startAutoGroup } from './content/autoGroup.js';
import { removeGroupButton, renderGroupButton } from './content/dom.js';
import { extractVideoMetadata } from './content/metadata.js';
import { registerMessageHandlers, sendGroupTab } from './content/messaging.js';

/**
 * YouTube Tab Grouper - Content Script
 * 
 * Runs on YouTube pages and:
 * - Extracts video metadata
 * - Creates floating group button
 * - Auto-groups videos after delay
 * - Communicates with background service worker
 */

(function () {
    'use strict';

    // ====================================================================
    // STATE & CONSTANTS
    // ====================================================================

    let config = null; // User configuration (loaded from storage)
    const DISABLED_GROUP_RESPONSE = { success: false, error: "Extension is disabled" };

    const getNormalizedMetadata = () => normalizeVideoMetadata(extractVideoMetadata());

    async function requestGroupTab(category, metadata) {
        if (!isEnabled(config)) {
            return DISABLED_GROUP_RESPONSE;
        }

        try {
            return await sendGroupTab({ category, metadata });
        } catch (error) {
            return { success: false, error: error?.message || "Failed to group tab" };
        }
    }

    // ====================================================================
    // CONFIGURATION LOADER
    // ====================================================================

    // ====================================================================
    // VIDEO DATA EXTRACTION
    // ====================================================================

    // ====================================================================
    // CATEGORY DETECTION
    // ====================================================================

    const getCategory = (video) => resolveCategory(video, config);

    // ====================================================================
    // UI CREATION
    // ====================================================================

    /**
     * Create floating "Group" button on YouTube page
     * 
     * Button features:
     * - Fixed position (top-left)
     * - Hover effects
     * - Click handler for manual grouping
     * - Auto-hides if tab already grouped
     * 
     * @returns {void}
     */
    function createUI() {
        if (!isEnabled(config)) {
            return;
        }

        // Don't create button if tab already grouped
        const activeTab = document.activeElement;
        if (activeTab?.groupId >= 0) return;

        const button = renderGroupButton({
            onClick: async () => {
            const metadata = extractVideoMetadata();
            const response = await requestGroupTab("", metadata);
            if (response?.success) {
                    removeGroupButton();
                console.log(`Tab grouped as "${response.category}"`);
            } else if (response?.error) {
                console.warn("Manual grouping failed:", response.error);
            }
            }
        });

        return button;
    }

    // ====================================================================
    // INITIALIZATION & AUTO-GROUPING
    // ====================================================================

    const triggerAutoGroup = () => {
        const metadata = extractVideoMetadata();

        return requestGroupTab("", metadata).then((response) => {
            if (response?.success) {
                removeGroupButton();
                console.log(`Auto-grouped as "${response.category}"`);
            } else if (response?.error) {
                console.warn("Auto-group failed:", response.error);
            }
        });
    };

    /**
     * Main initialization function
     * 
     * Steps:
     * 1. Load configuration from storage
     * 2. Check if extension is enabled
     * 3. Create floating button UI
     * 4. Schedule auto-grouping after delay
     * 
     * @async
     * @returns {Promise<void>}
     */
    async function initialize() {
        try {
            // Step 1: Load configuration
            config = await loadConfig();

            // Step 2: Check if enabled
            if (!isEnabled(config)) {
                console.log("YouTube Tab Grouper is disabled");
                return;
            }

            // Step 3: Create UI
            createUI();

            // Step 4: Schedule auto-grouping (if enabled)
            startAutoGroup({
                config,
                onGroup: triggerAutoGroup
            });

        } catch (error) {
            console.error("Error initializing YouTube Tab Grouper:", error);
        }
    }

    // ====================================================================
    // STARTUP
    // ====================================================================

    // Initialize extension when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

    registerMessageHandlers({
        getMetadata: getNormalizedMetadata,
        isEnabled: () => isEnabled(config)
    });

})();



import { MESSAGE_ACTIONS, normalizeVideoMetadata } from './shared/messages.js';
import { handleMessage, sendMessageSafe } from './shared/messaging.js';
import { BUTTON, FALLBACK_GROUP, SELECTORS } from './content/constants.js';
import { isEnabled, loadConfig } from './content/config.js';

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
            return await sendMessageSafe(MESSAGE_ACTIONS.GROUP_TAB, { category, metadata });
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

    /**
     * Extract metadata from current YouTube video
     * 
     * @returns {Object} Video metadata with channel
     */
    function getVideoData() {
        // Better title extraction
        const title =
            document.querySelector(SELECTORS.title)?.innerText ||
            document.title.replace("- YouTube", "").trim();

        // FIX: Better channel extraction
        const channel = 
            document.querySelector(SELECTORS.channelName)?.innerText ||
            document.querySelector(SELECTORS.channelLink)?.innerText ||
            document.querySelector(SELECTORS.channelHandleLink)?.innerText ||
            "";

        const description = 
            document.querySelector(SELECTORS.descriptionMeta)?.content || "";

        const keywords = 
            (document.querySelector(SELECTORS.keywordsMeta)?.content || "")
                .split(',')
                .map(k => k.trim());

        return { 
            title, 
            channel: channel.trim(), 
            description, 
            keywords 
        };
    }

    /**
     * Extract full metadata including YouTube category
     * 
     * @returns {Object} Complete video metadata
     */
    function extractVideoMetadata() {
        const videoData = getVideoData();
        
        const metadata = {
            title: videoData.title,
            channel: videoData.channel,
            description: videoData.description,
            keywords: videoData.keywords,
            youtubeCategory: null
        };

        // Method 1: Extract from JSON-LD (most reliable)
        const jsonLdScript = document.querySelector(SELECTORS.jsonLdScript);
        if (jsonLdScript) {
            try {
                const jsonLd = JSON.parse(jsonLdScript.textContent);
                if (jsonLd.description) metadata.description = jsonLd.description;
                if (jsonLd.keywords) {
                    metadata.keywords = jsonLd.keywords.split(',').map(k => k.trim());
                }
            } catch (e) {
                console.warn("Failed to parse JSON-LD:", e);
            }
        }

        // Method 2: Extract YouTube category from ytInitialData
        try {
            // Access YouTube's global data object
            if (window.ytInitialData) {
                const data = window.ytInitialData;
                
                // Navigate through YouTube's complex structure
                const contents = data?.contents?.twoColumnWatchNextResults?.results?.results?.contents;
                if (contents && Array.isArray(contents)) {
                    for (const item of contents) {
                        // Look for videoPrimaryInfoRenderer which contains metadata
                        if (item.videoPrimaryInfoRenderer?.categoryId) {
                            metadata.youtubeCategory = item.videoPrimaryInfoRenderer.categoryId;
                            console.log(`Found YouTube category: ${metadata.youtubeCategory}`);
                            break;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn("Failed to extract YouTube category from ytInitialData:", e);
        }

        // Method 3: Fallback - Extract from meta tags
        if (!metadata.youtubeCategory) {
            try {
                const genreMeta = document.querySelector(SELECTORS.genreMeta);
                if (genreMeta?.content) {
                    metadata.youtubeCategory = genreMeta.content.trim();
                    console.log(`Found YouTube category via meta tag: ${metadata.youtubeCategory}`);
                }
            } catch (e) {
                console.warn("Failed to extract from meta tag:", e);
            }
        }

        console.log("Extracted metadata:", metadata);
        return metadata;
    }

    // ====================================================================
    // CATEGORY DETECTION
    // ====================================================================

    /**
     * Detect video category
     * 
     * Priority (highest to lowest):
     * 1. Channel Mapping (if user mapped this channel)
     * 2. Title Keywords (AI prediction)
     * 3. Description (fallback)
     * 
     * @async
     * @param {Object} video - Video metadata
     * @returns {Promise<Object|null>} {name, source} or null if disabled
     */
    async function getCategory(video) {
        // Check if extension is enabled
        if (!isEnabled(config)) return null;

        // 1. Check channel mapping (highest priority)
        if (config.channelCategoryMap[video.channel]) {
            return {
                name: config.channelCategoryMap[video.channel],
                source: "channel_mapping"
            };
        }

        // 2. AI keyword detection
        if (config.aiCategoryDetection && video.title) {
            // Category will be predicted by background script
            return null; // Let background handle this
        }

        // 3. Fallback to channel name
        if (video.channel) {
            return { name: video.channel, source: "channel_name" };
        }

        return { name: FALLBACK_GROUP, source: "fallback" };
    }

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

        // Create button element
        const button = document.createElement('button');
        button.id = BUTTON.id;
        button.textContent = BUTTON.label;
        button.setAttribute('title', BUTTON.title);

        // Apply styling
        button.style.cssText = `
            position: fixed;
            top: 16px;
            left: 16px;
            z-index: 9999;
            padding: 8px 12px;
            background: #4285F4;
            color: white;
            border: none;
            border-radius: 20px;
            font-weight: 600;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
            box-shadow: 0 2px 8px rgba(66, 133, 244, 0.3);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;

        // Hover effects
        button.addEventListener('mouseover', () => {
            button.style.background = '#3367d6';
            button.style.boxShadow = '0 4px 12px rgba(66, 133, 244, 0.5)';
        });

        button.addEventListener('mouseout', () => {
            button.style.background = '#4285F4';
            button.style.boxShadow = '0 2px 8px rgba(66, 133, 244, 0.3)';
        });

        // Click handler
        button.addEventListener('click', async () => {
            const metadata = extractVideoMetadata();
            const response = await requestGroupTab("", metadata);
            if (response?.success) {
                button.remove();
                console.log(`Tab grouped as "${response.category}"`);
            } else if (response?.error) {
                console.warn("Manual grouping failed:", response.error);
            }
        });

        // Add button to page
        document.body.appendChild(button);
    }

    // ====================================================================
    // INITIALIZATION & AUTO-GROUPING
    // ====================================================================

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
            if (config.autoGroupDelay > 0 && isEnabled(config)) {
                setTimeout(() => {
                    // Extract full metadata including YouTube category
                    const metadata = extractVideoMetadata();

                    requestGroupTab("", metadata).then((response) => {
                        if (response?.success) {
                            const btn = document.getElementById(BUTTON.id);
                            if (btn) btn.remove();
                            console.log(`Auto-grouped as "${response.category}"`);
                        } else if (response?.error) {
                            console.warn("Auto-group failed:", response.error);
                        }
                    });
                }, config.autoGroupDelay);
            }

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

    chrome.runtime.onMessage.addListener(handleMessage({
        [MESSAGE_ACTIONS.GET_VIDEO_METADATA]: async () => {
            if (!isEnabled(config)) {
                return normalizeVideoMetadata();
            }
            return getNormalizedMetadata();
        }
    }, { requireVersion: true }));

})();



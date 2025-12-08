import { SELECTORS } from './constants.js';

/**
 * Extract metadata from current YouTube video.
 *
 * @returns {Object} Video metadata with channel.
 */
export function getVideoData() {
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
 * Extract full metadata including YouTube category.
 *
 * @returns {Object} Complete video metadata.
 */
export function extractVideoMetadata() {
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

import { mergeMetadata, normalizeVideoMetadata } from '../shared/metadataSchema.js';
import { SELECTORS } from './constants.js';

const splitKeywords = (value = "") => typeof value === 'string'
    ? value.split(',').map((item) => item.trim()).filter(Boolean)
    : [];
const getDocumentTitle = () => document.title.replace("- YouTube", "").trim();

function readDomMetadata() {
    const title =
        document.querySelector(SELECTORS.title)?.innerText ||
        "";

    const channel =
        document.querySelector(SELECTORS.channelName)?.innerText ||
        document.querySelector(SELECTORS.channelLink)?.innerText ||
        document.querySelector(SELECTORS.channelHandleLink)?.innerText ||
        "";

    const description =
        document.querySelector(SELECTORS.descriptionMeta)?.content || "";

    const keywords = splitKeywords(document.querySelector(SELECTORS.keywordsMeta)?.content || "");

    return {
        title,
        channel,
        description,
        keywords
    };
}

function extractJsonLdMetadata() {
    const script = document.querySelector(SELECTORS.jsonLdScript);
    if (!script) return {};

    try {
        const data = JSON.parse(script.textContent);
        const keywords = Array.isArray(data.keywords)
            ? data.keywords
            : splitKeywords(data.keywords || "");

        return {
            description: data.description,
            keywords
        };
    } catch (error) {
        console.warn("Failed to parse JSON-LD:", error);
        return {};
    }
}

function extractCategoryFromInitialData() {
    try {
        if (!window.ytInitialData) return null;
        const contents = window.ytInitialData?.contents?.twoColumnWatchNextResults?.results?.results?.contents;
        if (!Array.isArray(contents)) return null;

        for (const item of contents) {
            if (item?.videoPrimaryInfoRenderer?.categoryId !== undefined && item?.videoPrimaryInfoRenderer?.categoryId !== null) {
                return item.videoPrimaryInfoRenderer.categoryId;
            }
        }
    } catch (error) {
        console.warn("Failed to extract YouTube category from ytInitialData:", error);
    }
    return null;
}

function extractCategoryFromMeta() {
    try {
        const genreMeta = document.querySelector(SELECTORS.genreMeta);
        if (genreMeta?.content) {
            return genreMeta.content.trim();
        }
    } catch (error) {
        console.warn("Failed to extract category from meta tag:", error);
    }
    return null;
}

function detectYouTubeCategory() {
    return extractCategoryFromInitialData() ?? extractCategoryFromMeta();
}

/**
 * Extract basic metadata from the DOM.
 * @returns {import('../shared/types.js').Metadata}
 */
export function getVideoData() {
    const base = readDomMetadata();
    return normalizeVideoMetadata(base, { fallbackTitle: getDocumentTitle() });
}

/**
 * Extract metadata from DOM + JSON-LD + meta tags, normalized.
 * @returns {import('../shared/types.js').Metadata}
 */
export function extractVideoMetadata() {
    const base = getVideoData();
    const jsonLd = extractJsonLdMetadata();
    const youtubeCategory = detectYouTubeCategory();

    const merged = mergeMetadata(
        { ...jsonLd, youtubeCategory },
        base
    );

    return normalizeVideoMetadata(merged, { fallbackTitle: base.title || getDocumentTitle() });
}

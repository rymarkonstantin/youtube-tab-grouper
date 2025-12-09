/** @typedef {import('./types.js').Metadata} Metadata */

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value) => typeof value === 'string';
const toTrimmedString = (value) => isString(value) ? value.trim() : '';

export const EMPTY_METADATA = Object.freeze({
    title: "",
    channel: "",
    description: "",
    keywords: [],
    youtubeCategory: null
});

const normalizeKeywords = (value) => {
    if (!Array.isArray(value)) return [];
    return value
        .map(toTrimmedString)
        .filter(Boolean);
};

const normalizeCategory = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    return null;
};

/**
 * Validate that a payload matches the expected metadata shape.
 * Fields may be undefined/null but must match their expected primitive types.
 */
export function isVideoMetadata(value) {
    if (!isObject(value)) return false;

    const { title, channel, description, keywords, youtubeCategory } = value;
    const stringsAreValid = [title, channel, description].every(
        (field) => field === undefined || isString(field)
    );

    const keywordsAreValid = keywords === undefined
        || (Array.isArray(keywords) && keywords.every(isString));

    const categoryIsValid = youtubeCategory === undefined
        || youtubeCategory === null
        || isString(youtubeCategory)
        || typeof youtubeCategory === "number";

    return stringsAreValid && keywordsAreValid && categoryIsValid;
}

/**
 * Normalize metadata into a consistent, trimmed shape.
 * Optional fallbackTitle is used when the incoming payload omits a title.
 */
/**
 * @param {Metadata} [metadata]
 * @param {{ fallbackTitle?: string }} [options]
 * @returns {Metadata}
 */
export function normalizeVideoMetadata(metadata = {}, { fallbackTitle = "" } = {}) {
    const source = isObject(metadata) ? metadata : {};
    const normalized = {
        title: toTrimmedString(source.title) || toTrimmedString(fallbackTitle),
        channel: toTrimmedString(source.channel),
        description: toTrimmedString(source.description),
        keywords: normalizeKeywords(source.keywords),
        youtubeCategory: normalizeCategory(source.youtubeCategory)
    };

    return normalized;
}

/**
 * Merge two metadata payloads, preferring populated fields from `preferred`.
 */
/**
 * @param {Metadata} [preferred]
 * @param {Metadata} [fallback]
 * @returns {Metadata}
 */
export function mergeMetadata(preferred = {}, fallback = {}) {
    const base = normalizeVideoMetadata(fallback);
    const prioritized = normalizeVideoMetadata(preferred);

    return {
        title: prioritized.title || base.title,
        channel: prioritized.channel || base.channel,
        description: prioritized.description || base.description,
        keywords: prioritized.keywords.length > 0 ? prioritized.keywords : base.keywords,
        youtubeCategory: prioritized.youtubeCategory ?? base.youtubeCategory ?? null
    };
}

/**
 * Determine if a metadata payload contains any usable content.
 */
/**
 * @param {Metadata} [metadata]
 * @returns {boolean}
 */
export function hasMetadataContent(metadata = {}) {
    const normalized = normalizeVideoMetadata(metadata);
    return Boolean(
        normalized.title
        || normalized.channel
        || normalized.description
        || (normalized.keywords && normalized.keywords.length > 0)
        || normalized.youtubeCategory !== null
    );
}

import { normalizeVideoMetadata } from '../shared/metadataSchema.js';
import { DEFAULT_SETTINGS } from './constants.js';

const FALLBACK_CATEGORY = "Other";

const toCategory = (value) => typeof value === 'string' ? value.trim() : '';

function fromChannelMap(channel, channelMap = {}) {
    if (!channel) return "";
    return channelMap[channel] || "";
}

function predictFromKeywords(metadata, aiEnabled, categoryKeywords = DEFAULT_SETTINGS.categoryKeywords) {
    if (!aiEnabled) return "";

    const scores = {};
    const text = `${metadata.title} ${metadata.description} ${(metadata.keywords || []).join(' ')}`.toLowerCase();

    for (const [category, keywords] of Object.entries(categoryKeywords || {})) {
        const score = (keywords || []).reduce((sum, keyword) => {
            const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
            return sum + (text.match(regex) || []).length;
        }, 0);

        if (score > 0) {
            scores[category] = score;
        }
    }

    let bestCategory = "";
    let bestScore = 0;

    for (const [category, score] of Object.entries(scores)) {
        if (score > bestScore) {
            bestCategory = category;
            bestScore = score;
        }
    }

    return bestCategory;
}

export function mapYouTubeCategory(youtubeCategory) {
    if (!youtubeCategory) return "";

    const categoryMap = {
        "Music": "Music",
        "Gaming": "Gaming",
        "Entertainment": "Entertainment",
        "Sports": "Fitness",
        "News & Politics": "News",
        "Education": "Education",
        "Tech": "Tech",
        "Cooking": "Cooking",
        "Howto & Style": "Education",
        "Travel & Events": "Entertainment",
        "People & Blogs": "Entertainment",
        "Comedy": "Entertainment",
        "Film & Animation": "Entertainment",
        "Autos": "Tech",
        "Pets & Animals": "Entertainment",
        "Nonprofits & Activism": "News"
    };

    return categoryMap[youtubeCategory] || "";
}

/**
 * Deterministic category resolution priority:
 * 1) channel mapping
 * 2) supplied override
 * 3) keyword scoring (if enabled)
 * 4) YouTube category mapping
 * 5) fallback ("Other")
 *
 * @param {import('../shared/metadataSchema.js').Metadata} rawMetadata
 * @param {{
 *  requestedCategory?: string,
 *  aiEnabled?: boolean,
 *  categoryKeywords?: Record<string,string[]>,
 *  channelMap?: Record<string,string>
 * }} [options]
 * @returns {string}
 */
export function predictCategory(rawMetadata, options = {}) {
    const {
        requestedCategory = "",
        aiEnabled = true,
        categoryKeywords = DEFAULT_SETTINGS.categoryKeywords,
        channelMap = {}
    } = options;

    const metadata = normalizeVideoMetadata(rawMetadata);

    const mappedChannelCategory = fromChannelMap(metadata.channel, channelMap);
    if (mappedChannelCategory) {
        return mappedChannelCategory;
    }

    const override = toCategory(requestedCategory);
    if (override) {
        return override;
    }

    const keywordCategory = predictFromKeywords(metadata, aiEnabled, categoryKeywords);
    if (keywordCategory) {
        return keywordCategory;
    }

    const youtubeMappedCategory = mapYouTubeCategory(metadata.youtubeCategory);
    if (youtubeMappedCategory) {
        return youtubeMappedCategory;
    }

    return FALLBACK_CATEGORY;
}

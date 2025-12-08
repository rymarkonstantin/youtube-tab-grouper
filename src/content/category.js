import { FALLBACK_GROUP } from './constants.js';
import { isEnabled } from './config.js';

/**
 * Resolve a category for the provided video metadata and settings.
 *
 * Priority (highest to lowest):
 * 1. Channel Mapping (if user mapped this channel)
 * 2. Title Keywords (AI prediction handled in background)
 * 3. Description/channel name (fallback)
 *
 * @param {Object} video - Video metadata
 * @param {Object} settings - Normalized settings
 * @returns {Object|null} {name, source} or null if disabled/AI handled elsewhere
 */
export function resolveCategory(video = {}, settings = {}) {
    if (!isEnabled(settings)) return null;

    // 1. Check channel mapping (highest priority)
    if (settings.channelCategoryMap?.[video.channel]) {
        return {
            name: settings.channelCategoryMap[video.channel],
            source: "channel_mapping"
        };
    }

    // 2. AI keyword detection (handled in background)
    if (settings.aiCategoryDetection && video.title) {
        return null; // Let background handle this
    }

    // 3. Fallback to channel name
    if (video.channel) {
        return { name: video.channel, source: "channel_name" };
    }

    return { name: FALLBACK_GROUP, source: "fallback" };
}

import { hasMetadataContent, mergeMetadata, normalizeVideoMetadata } from '../shared/metadataSchema.js';
import { MESSAGE_ACTIONS } from '../shared/messageContracts.js';
import { sendMessageSafe } from '../shared/messageTransport.js';
import { logWarn } from './logger.js';

const CONTENT_METADATA_TIMEOUTS_MS = [1200, 2000, 3200];
const CONTENT_METADATA_BACKOFF_MS = [150, 350];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {number} tabId
 * @param {number} timeoutMs
 * @param {string} fallbackTitle
 */
async function requestContentMetadata(tabId, timeoutMs, fallbackTitle) {
    const response = await sendMessageSafe(
        MESSAGE_ACTIONS.GET_VIDEO_METADATA,
        {},
        { tabId, timeoutMs }
    );
    return normalizeVideoMetadata(response, { fallbackTitle });
}

/**
 * Fetch metadata from content script with retries and merge with fallbacks.
 * @param {number} tabId
 * @param {{ fallbackMetadata?: import('../shared/types.js').Metadata, fallbackTitle?: string }} [options]
 * @returns {Promise<import('../shared/types.js').Metadata>}
 */
export async function getVideoMetadata(tabId, options = {}) {
    const { fallbackMetadata = {}, fallbackTitle = "" } = options;
    let lastError = null;
    let attempts = 0;

    const attemptCount = CONTENT_METADATA_TIMEOUTS_MS.length;

    for (const timeoutMs of CONTENT_METADATA_TIMEOUTS_MS) {
        attempts += 1;
        try {
            const contentMetadata = await requestContentMetadata(tabId, timeoutMs, fallbackTitle);
            const merged = mergeMetadata(contentMetadata, fallbackMetadata);
            if (hasMetadataContent(merged)) {
                return merged;
            }
        } catch (error) {
            lastError = error;
        }

        const isLastAttempt = attempts >= attemptCount;
        const backoff = CONTENT_METADATA_BACKOFF_MS[Math.min(attempts - 1, CONTENT_METADATA_BACKOFF_MS.length - 1)];
        if (!isLastAttempt && backoff) {
            await delay(backoff);
        }
    }

    if (lastError) {
        logWarn("metadata:getVideoMetadata exhausted retries; returning fallback metadata", lastError?.message || lastError);
    } else {
        logWarn("metadata:getVideoMetadata returning fallback metadata after empty content response");
    }

    return normalizeVideoMetadata(fallbackMetadata, { fallbackTitle });
}

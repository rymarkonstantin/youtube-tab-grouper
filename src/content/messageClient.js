/** @typedef {import('../shared/types.ts').MessageEnvelope} MessageEnvelope */

import { normalizeVideoMetadata } from '../shared/metadataSchema.js';
import { MESSAGE_ACTIONS, validateResponse } from '../shared/messageContracts.js';
import { handleMessage, sendMessageSafe } from '../shared/messageTransport.js';

const toGroupTabPayload = (categoryOrPayload, metadata) => {
    if (categoryOrPayload && typeof categoryOrPayload === 'object' && !Array.isArray(categoryOrPayload)) {
        return categoryOrPayload;
    }
    return { category: categoryOrPayload, metadata };
};

const timeoutResponse = (timeoutMs) => ({ success: false, error: `Message timed out after ${timeoutMs}ms` });
const disabledResponse = () => ({ success: false, error: "Extension is disabled" });

/**
 * Send a groupTab request from the content script.
 * @param {string|object} categoryOrPayload
 * @param {import('../shared/types.ts').Metadata} [metadata]
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<import('../shared/types.ts').GroupTabResponse>}
 */
export async function sendGroupTab(categoryOrPayload, metadata, options = {}) {
    const { timeoutMs } = options;
    try {
        const response = await sendMessageSafe(
            MESSAGE_ACTIONS.GROUP_TAB,
            toGroupTabPayload(categoryOrPayload, metadata),
            { timeoutMs, validateResponsePayload: true }
        );

        const { valid, errors } = validateResponse(MESSAGE_ACTIONS.GROUP_TAB, response || {});
        if (!valid) {
            return { success: false, error: errors.join("; ") || "Invalid response" };
        }
        return response;
    } catch (error) {
        const message = error?.message || "Unknown error";
        if (/disabled/i.test(message)) {
            return disabledResponse();
        }
        if (/timed out/i.test(message) && timeoutMs) {
            return timeoutResponse(timeoutMs);
        }
        return { success: false, error: message };
    }
}

/**
 * Fetch settings from background.
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<{ success:boolean, settings?: import('../shared/types.ts').Settings, error?: string }>}
 */
export async function sendGetSettings(options = {}) {
    const { timeoutMs } = options;
    try {
        const response = await sendMessageSafe(
            MESSAGE_ACTIONS.GET_SETTINGS,
            {},
            { timeoutMs, validateResponsePayload: true }
        );
        const { valid, errors } = validateResponse(MESSAGE_ACTIONS.GET_SETTINGS, response || {});
        if (!valid) {
            return { success: false, error: errors.join("; ") || "Invalid response" };
        }
        return response;
    } catch (error) {
        const message = error?.message || "Unknown error";
        if (/disabled/i.test(message)) {
            return disabledResponse();
        }
        if (/timed out/i.test(message) && timeoutMs) {
            return timeoutResponse(timeoutMs);
        }
        return { success: false, error: message };
    }
}

/**
 * Check if the active tab is already grouped.
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<{ grouped: boolean, error?: string } & Partial<MessageEnvelope>>}
 */
export async function sendIsTabGrouped(options = {}) {
    const { timeoutMs } = options;
    return sendMessageSafe(
        MESSAGE_ACTIONS.IS_TAB_GROUPED,
        {},
        { timeoutMs, validateResponsePayload: true }
    );
}

export function replyWithMetadata({ getMetadata, isEnabled }) {
    return async () => {
        const enabled = typeof isEnabled === 'function' ? isEnabled() : true;
        if (!enabled) {
            return normalizeVideoMetadata();
        }
        const raw = typeof getMetadata === 'function' ? await getMetadata() : {};
        return normalizeVideoMetadata(raw);
    };
}

export function registerMessageHandlers({ getMetadata, isEnabled }) {
    const listener = handleMessage({
        [MESSAGE_ACTIONS.GET_VIDEO_METADATA]: replyWithMetadata({ getMetadata, isEnabled })
    }, {
        requireVersion: true,
        onUnknown: (action, msg) => {
            console.warn(`Unknown content message action: ${action || msg?.action || "undefined"}`);
            return false;
        }
    });

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
}
/** @typedef {import('../shared/types.ts').Metadata} Metadata */
/** @typedef {import('../shared/types.ts').GroupTabResponse} GroupTabResponse */
/** @typedef {import('../shared/types.ts').Settings} Settings */

import { MESSAGE_ACTIONS, normalizeVideoMetadata } from '../shared/messages.js';
import { handleMessage, sendMessageSafe } from '../shared/messaging.js';

// TODO: bolt on shared schema validation here once content-side message schemas are available.
const toGroupTabPayload = (categoryOrPayload, metadata) => {
    if (categoryOrPayload && typeof categoryOrPayload === 'object' && !Array.isArray(categoryOrPayload)) {
        return categoryOrPayload;
    }
    return { category: categoryOrPayload, metadata };
};

export function sendGroupTab(categoryOrPayload, metadata) {
    return sendMessageSafe(MESSAGE_ACTIONS.GROUP_TAB, toGroupTabPayload(categoryOrPayload, metadata));
}

export function sendGetSettings() {
    return sendMessageSafe(MESSAGE_ACTIONS.GET_SETTINGS, {});
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
    // TODO: add runtime validation for msg payloads once shared schemas land.
    const listener = handleMessage({
        [MESSAGE_ACTIONS.GET_VIDEO_METADATA]: replyWithMetadata({ getMetadata, isEnabled })
    }, {
        requireVersion: true,
        onUnknown: (action, msg) => {
            // Legacy bridge for unversioned { action: "groupTab" } requests.
            if (action === MESSAGE_ACTIONS.GROUP_TAB || msg?.action === MESSAGE_ACTIONS.GROUP_TAB) {
                return sendGroupTab(msg);
            }
            console.warn(`Unknown content message action: ${action || msg?.action || "undefined"}`);
            return false;
        }
    });

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
}

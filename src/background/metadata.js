import { MESSAGE_ACTIONS, normalizeVideoMetadata } from '../shared/messages.js';
import { sendMessageSafe } from '../shared/messaging.js';

export async function getVideoMetadata(tabId) {
    try {
        const response = await sendMessageSafe(
            MESSAGE_ACTIONS.GET_VIDEO_METADATA,
            {},
            { tabId }
        );
        return normalizeVideoMetadata(response);
    } catch (error) {
        return normalizeVideoMetadata();
    }
}

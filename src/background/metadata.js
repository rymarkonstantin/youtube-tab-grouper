import { MESSAGE_ACTIONS, normalizeVideoMetadata } from '../shared/messages.js';
import { sendMessageSafe } from '../shared/messaging.js';
import { logWarn } from './logger.js';

export async function getVideoMetadata(tabId) {
    try {
        const response = await sendMessageSafe(
            MESSAGE_ACTIONS.GET_VIDEO_METADATA,
            {},
            { tabId }
        );
        return normalizeVideoMetadata(response);
    } catch (error) {
        logWarn("metadata:getVideoMetadata failed; returning empty metadata", error?.message || error);
        return normalizeVideoMetadata();
    }
}

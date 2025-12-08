import { MESSAGE_ACTIONS, normalizeVideoMetadata } from '../shared/messages.js';

export async function getVideoMetadata(tabId) {
    return new Promise((resolve) => {
        try {
            chrome.tabs.sendMessage(
                tabId,
                { action: MESSAGE_ACTIONS.GET_VIDEO_METADATA },
                (response) => {
                    if (chrome.runtime.lastError) {
                        resolve(normalizeVideoMetadata());
                    } else {
                        resolve(normalizeVideoMetadata(response));
                    }
                }
            );
        } catch (error) {
            resolve(normalizeVideoMetadata());
        }
    });
}

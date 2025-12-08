import { MESSAGE_ACTIONS } from '../shared/messages.js';
import { sendMessageSafe } from '../shared/messaging.js';
import { withSettingsDefaults } from '../shared/settings.js';
import { CONTENT_SETTINGS_DEFAULTS } from './constants.js';

export const normalizeContentSettings = (settings = {}) =>
    withSettingsDefaults({ ...CONTENT_SETTINGS_DEFAULTS, ...(settings || {}) });

export const isEnabled = (settings) => settings?.extensionEnabled !== false;

export async function loadConfig() {
    try {
        const response = await sendMessageSafe(MESSAGE_ACTIONS.GET_SETTINGS, {});
        if (response?.success && response.settings) {
            return normalizeContentSettings(response.settings);
        }
    } catch (error) {
        console.warn("Config load failed, using defaults:", error?.message || error);
    }
    return normalizeContentSettings();
}

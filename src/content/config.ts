import { SettingsService } from "../shared/domain/settingsService";
import type { Settings } from "../shared/types";
import { CONTENT_SETTINGS_DEFAULTS } from "./constants";
import { sendGetSettings } from "./messageClient";

const settingsService = new SettingsService(CONTENT_SETTINGS_DEFAULTS);

export const normalizeContentSettings = (settings: Partial<Settings> = {}): Settings =>
  settingsService.loadSettings(settings);

export const isEnabled = (settings?: Settings | null) => settings?.extensionEnabled !== false;

export async function loadConfig(): Promise<Settings> {
  try {
    const response = await sendGetSettings();
    if (response?.success && response.settings) {
      return normalizeContentSettings(response.settings);
    }
  } catch (error) {
    console.warn("Config load failed, using defaults:", (error as Error)?.message || error);
  }
  return normalizeContentSettings();
}

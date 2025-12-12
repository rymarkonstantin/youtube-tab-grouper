import { DEFAULT_SETTINGS, migrateSettingsV0ToV1, withSettingsDefaults } from "../settings";
import type { Settings } from "../types";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export class SettingsService {
  private defaults: Settings;

  constructor(defaults: Settings = DEFAULT_SETTINGS) {
    this.defaults = withSettingsDefaults(defaults);
  }

  getDefaults(overrides?: Partial<Settings>): Settings {
    const merged = overrides ? { ...this.defaults, ...overrides } : this.defaults;
    return withSettingsDefaults(merged);
  }

  loadSettings(raw: Partial<Settings> = {}, overrides?: Partial<Settings>): Settings {
    const defaults = this.getDefaults(overrides);
    const source = isObject(raw) ? raw : {};
    const merged = { ...defaults, ...source } as Settings;
    return migrateSettingsV0ToV1(merged);
  }
}

export const settingsService = new SettingsService();

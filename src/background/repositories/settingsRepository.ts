import { DEFAULT_SETTINGS, migrateSettingsV0ToV1, withSettingsDefaults } from "../constants";
import { getSettings, resetSettings, updateSettings } from "../../shared/settings";
import type { Settings } from "../../shared/types";

export class SettingsRepository {
  private cache: Settings | null = null;
  private defaults: Settings;

  constructor(defaults: Settings = DEFAULT_SETTINGS) {
    this.defaults = defaults;
  }

  async get(): Promise<Settings> {
    if (this.cache) return this.cache;
    const settings = await getSettings(withSettingsDefaults(this.defaults));
    const migrated = migrateSettingsV0ToV1(settings);
    this.cache = migrated;
    return migrated;
  }

  async save(next: Partial<Settings> | Settings): Promise<Settings> {
    const updated = await updateSettings(next as Settings);
    this.cache = updated;
    return updated;
  }

  async reset(defaults: Settings = this.defaults): Promise<Settings> {
    const normalized = withSettingsDefaults(defaults);
    const resetValue = await resetSettings(normalized);
    this.cache = resetValue;
    return resetValue;
  }

  clearCache() {
    this.cache = null;
  }

  getDefaults() {
    return withSettingsDefaults(this.defaults);
  }
}

export const settingsRepository = new SettingsRepository();

import { DEFAULT_SETTINGS } from "../constants";
import { getSettings, resetSettings, updateSettings } from "../../shared/settings";
import type { Settings } from "../../shared/types";
import { SettingsService } from "../../shared/domain/settingsService";

export class SettingsRepository {
  private cache: Settings | null = null;
  private service: SettingsService;

  constructor(defaults: Settings = DEFAULT_SETTINGS, service = new SettingsService(defaults)) {
    this.service = service;
  }

  async get(): Promise<Settings> {
    if (this.cache) return this.cache;
    const settings = await getSettings(this.service.getDefaults());
    const normalized = this.service.loadSettings(settings);
    this.cache = normalized;
    return normalized;
  }

  async save(next: Partial<Settings> | Settings): Promise<Settings> {
    const updated = await updateSettings(next as Settings);
    const normalized = this.service.loadSettings(updated);
    this.cache = normalized;
    return normalized;
  }

  async reset(defaults: Settings = this.service.getDefaults()): Promise<Settings> {
    const normalizedDefaults = this.service.getDefaults(defaults);
    const resetValue = await resetSettings(normalizedDefaults);
    const normalized = this.service.loadSettings(resetValue);
    this.cache = normalized;
    return normalized;
  }

  clearCache() {
    this.cache = null;
  }

  getDefaults() {
    return this.service.getDefaults();
  }
}

export const settingsRepository = new SettingsRepository();

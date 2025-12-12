import {
  DEFAULT_SETTINGS,
  SETTINGS_VERSION,
  STATS_VERSION,
  withStatsDefaults,
  migrateStatsV0ToV1
} from "../constants";
import { settingsRepository } from "../repositories/settingsRepository";
import { statsRepository } from "../repositories/statsRepository";
import { readAllChromeStorage } from "../repositories/repositoryUtils";
import { SettingsService } from "../../shared/domain/settingsService";
import type { Settings, GroupingStats } from "../../shared/types";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export interface MigrationResult {
  settingsMigrated: boolean;
  statsMigrated: boolean;
  settingsError: unknown;
  statsError: unknown;
  settings: Settings;
  stats: GroupingStats;
}

export async function runMigrations(defaults: Settings = DEFAULT_SETTINGS): Promise<MigrationResult> {
  const results: Omit<MigrationResult, "settings" | "stats"> = {
    settingsMigrated: false,
    statsMigrated: false,
    settingsError: null,
    statsError: null
  };

  let syncData: Record<string, unknown> = {};
  let localData: Record<string, unknown> = {};
  const settingsService = new SettingsService(defaults);

  try {
    [syncData, localData] = await Promise.all([
      readAllChromeStorage("sync").catch((error) => {
        console.warn("Storage migrations: failed to read sync; using defaults", (error as Error)?.message || error);
        results.settingsError = error;
        return {};
      }),
      readAllChromeStorage("local").catch((error) => {
        console.warn("Storage migrations: failed to read local; using defaults", (error as Error)?.message || error);
        results.statsError = error;
        return {};
      })
    ]);

    const normalizedSettings = settingsService.loadSettings(syncData as Partial<Settings>);

    const needsSettingsMigration = !syncData?.version || Number(syncData.version) < SETTINGS_VERSION;
    let migratedSettings: Settings;
    if (needsSettingsMigration) {
      migratedSettings = normalizedSettings;
      await settingsRepository.reset(migratedSettings);
      results.settingsMigrated = true;
    } else {
      migratedSettings = normalizedSettings;
      settingsRepository.clearCache();
    }

    // Stats migration (local)
    const groupingStatsValue = (localData as { groupingStats?: unknown }).groupingStats;
    let rawStats: Partial<GroupingStats> = {};
    if (isObject(groupingStatsValue)) {
      rawStats = groupingStatsValue as Partial<GroupingStats>;
    }
    const needsStatsMigration = !rawStats?.version || Number(rawStats.version) < STATS_VERSION;
    let migratedStats: GroupingStats;
    if (needsStatsMigration) {
      migratedStats = migrateStatsV0ToV1(rawStats);
      await statsRepository.reset(migratedStats);
      results.statsMigrated = true;
    } else {
      migratedStats = withStatsDefaults(rawStats);
      statsRepository.clearCache();
    }

    console.info("Storage migrations finished", {
      settingsMigrated: results.settingsMigrated,
      statsMigrated: results.statsMigrated
    });

    return {
      ...results,
      settings: migratedSettings,
      stats: migratedStats
    };
  } catch (error) {
    console.error("Storage migrations failed", error);
    return {
      ...results,
      settings: settingsService.getDefaults(),
      stats: withStatsDefaults({})
    };
  }
}


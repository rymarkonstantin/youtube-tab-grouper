import {
  DEFAULT_SETTINGS,
  SETTINGS_VERSION,
  STATS_VERSION,
  migrateSettingsV0ToV1,
  migrateStatsV0ToV1,
  withSettingsDefaults,
  withStatsDefaults
} from "../constants";
import { settingsRepository } from "../repositories/settingsRepository";
import { statsRepository } from "../repositories/statsRepository";
import type { Settings, GroupingStats } from "../../shared/types";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toError = (reason: unknown) => {
  if (reason instanceof Error) return reason;
  if (typeof reason === "string") return new Error(reason);
  try {
    return new Error(JSON.stringify(reason));
  } catch {
    return new Error("Unknown error");
  }
};

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

  try {
    [syncData, localData] = await Promise.all([
      readAllSync().catch((error) => {
        console.warn("Storage migrations: failed to read sync; using defaults", (error as Error)?.message || error);
        results.settingsError = error;
        return {};
      }),
      readAllLocal().catch((error) => {
        console.warn("Storage migrations: failed to read local; using defaults", (error as Error)?.message || error);
        results.statsError = error;
        return {};
      })
    ]);

    // Settings migration (sync)
    const needsSettingsMigration = !syncData?.version || Number(syncData.version) < SETTINGS_VERSION;
    let migratedSettings: Settings;
    if (needsSettingsMigration) {
      migratedSettings = migrateSettingsV0ToV1({
        ...defaults,
        ...syncData
      });
      await settingsRepository.reset(migratedSettings);
      results.settingsMigrated = true;
    } else {
      migratedSettings = withSettingsDefaults(syncData as Partial<Settings>);
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
      settings: withSettingsDefaults(defaults),
      stats: withStatsDefaults({})
    };
  }
}

async function readAllSync(): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.sync.get(null, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result || {});
        }
      });
    } catch (error) {
      reject(toError(error));
    }
  });
}

async function readAllLocal(): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get(null, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result || {});
        }
      });
    } catch (error) {
      reject(toError(error));
    }
  });
}

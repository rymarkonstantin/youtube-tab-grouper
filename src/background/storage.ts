import {
  DEFAULT_SETTINGS,
  DEFAULT_STATS,
  SETTINGS_VERSION,
  STATS_VERSION,
  withSettingsDefaults,
  withStatsDefaults,
  migrateSettingsV0ToV1,
  migrateStatsV0ToV1
} from "./constants";
import { getSettings, updateSettings, resetSettings } from "../shared/settings";
import { getStats, updateStats, resetStats } from "../shared/stats";
import type { GroupingState, Settings, GroupingStats } from "../shared/types";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
};

const toError = (error: unknown) => (error instanceof Error ? error : new Error(toErrorMessage(error)));

function handleCallback<T>(resolve: (value: T) => void, reject: (reason?: unknown) => void, transform: () => T) {
  if (chrome.runtime.lastError) {
    reject(new Error(chrome.runtime.lastError.message));
  } else {
    resolve(transform());
  }
}

export async function getSync(defaults: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.sync.get(defaults, (result) => handleCallback(resolve, reject, () => result || defaults));
    } catch (error) {
      reject(toError(error));
    }
  });
}

export async function setSync(values: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.sync.set(values, () => handleCallback(resolve, reject, () => undefined));
    } catch (error) {
      reject(toError(error));
    }
  });
}

export async function getLocal(defaults: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get(defaults, (result) => handleCallback(resolve, reject, () => result || defaults));
    } catch (error) {
      reject(toError(error));
    }
  });
}

export async function setLocal(values: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set(values, () => handleCallback(resolve, reject, () => undefined));
    } catch (error) {
      reject(toError(error));
    }
  });
}

export async function loadState(): Promise<GroupingState> {
  const { groupColorMap = {}, groupIdMap = {} } = await getLocal({ groupColorMap: {}, groupIdMap: {} });
  return {
    groupColorMap: groupColorMap as GroupingState["groupColorMap"],
    groupIdMap: groupIdMap as GroupingState["groupIdMap"]
  };
}

export async function saveState(groupColorMap: Record<string, string>, groupIdMap: Record<string, number>): Promise<void> {
  await setLocal({ groupColorMap, groupIdMap });
}

export async function loadSettings(defaults: Settings = DEFAULT_SETTINGS): Promise<Settings> {
  const settings = await getSettings(withSettingsDefaults(defaults));
  return migrateSettingsV0ToV1(settings);
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  return updateSettings(settings);
}

export async function loadStats(defaultStats: GroupingStats = DEFAULT_STATS): Promise<GroupingStats> {
  const stats = await getStats(withStatsDefaults(defaultStats));
  return migrateStatsV0ToV1(stats);
}

export async function saveStats(stats: GroupingStats): Promise<GroupingStats> {
  return updateStats(stats);
}

interface MigrationResult {
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
      await resetSettings(migratedSettings);
      results.settingsMigrated = true;
    } else {
      migratedSettings = withSettingsDefaults(syncData as Partial<Settings>);
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
      await resetStats(migratedStats);
      results.statsMigrated = true;
    } else {
      migratedStats = withStatsDefaults(rawStats);
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

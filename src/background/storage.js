import {
    DEFAULT_SETTINGS,
    DEFAULT_STATS,
    SETTINGS_VERSION,
    STATS_VERSION,
    withSettingsDefaults,
    withStatsDefaults,
    migrateSettingsV0ToV1,
    migrateStatsV0ToV1
} from './constants.js';
import {
    getSettings,
    updateSettings,
    resetSettings
} from '../shared/settings.js';
import {
    getStats,
    updateStats,
    resetStats
} from '../shared/stats.js';

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

function handleCallback(resolve, reject, transform = (value) => value) {
    if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
    } else {
        resolve(transform());
    }
}

export async function getSync(defaults = {}) {
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.sync.get(defaults, (result) =>
                handleCallback(resolve, reject, () => result || defaults)
            );
        } catch (error) {
            reject(error);
        }
    });
}

export async function setSync(values) {
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.sync.set(values, () => handleCallback(resolve, reject));
        } catch (error) {
            reject(error);
        }
    });
}

export async function getLocal(defaults = {}) {
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.local.get(defaults, (result) =>
                handleCallback(resolve, reject, () => result || defaults)
            );
        } catch (error) {
            reject(error);
        }
    });
}

export async function setLocal(values) {
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.local.set(values, () => handleCallback(resolve, reject));
        } catch (error) {
            reject(error);
        }
    });
}

export async function loadState() {
    const { groupColorMap = {}, groupIdMap = {} } = await getLocal({ groupColorMap: {}, groupIdMap: {} });
    return { groupColorMap, groupIdMap };
}

export async function saveState(groupColorMap, groupIdMap) {
    await setLocal({ groupColorMap, groupIdMap });
}

export async function loadSettings(defaults = DEFAULT_SETTINGS) {
    const settings = await getSettings(withSettingsDefaults(defaults));
    return migrateSettingsV0ToV1(settings);
}

export async function saveSettings(settings) {
    return updateSettings(settings);
}

export async function loadStats(defaultStats = DEFAULT_STATS) {
    const stats = await getStats(withStatsDefaults(defaultStats));
    return migrateStatsV0ToV1(stats);
}

export async function saveStats(stats) {
    return updateStats(stats);
}

export async function runMigrations(defaults = DEFAULT_SETTINGS) {
    const results = {
        settingsMigrated: false,
        statsMigrated: false,
        settingsError: null,
        statsError: null
    };

    let syncData = {};
    let localData = {};

    try {
        [syncData, localData] = await Promise.all([
            readAllSync().catch((error) => {
                console.warn("Storage migrations: failed to read sync; using defaults", error?.message || error);
                results.settingsError = error;
                return {};
            }),
            readAllLocal().catch((error) => {
                console.warn("Storage migrations: failed to read local; using defaults", error?.message || error);
                results.statsError = error;
                return {};
            })
        ]);

        // Settings migration (sync)
        const needsSettingsMigration = !syncData?.version || syncData.version < SETTINGS_VERSION;
        let migratedSettings;
        if (needsSettingsMigration) {
            migratedSettings = migrateSettingsV0ToV1({
                ...defaults,
                ...syncData
            });
            await resetSettings(migratedSettings);
            results.settingsMigrated = true;
        } else {
            migratedSettings = withSettingsDefaults(syncData);
        }

        // Stats migration (local)
        const rawStats = isObject(localData?.groupingStats) ? localData.groupingStats : {};
        const needsStatsMigration = !rawStats?.version || rawStats.version < STATS_VERSION;
        let migratedStats;
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

async function readAllSync() {
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
            reject(error);
        }
    });
}

async function readAllLocal() {
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
            reject(error);
        }
    });
}

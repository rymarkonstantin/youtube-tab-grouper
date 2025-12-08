export const STATS_VERSION = 1;

export const DEFAULT_STATS = {
    totalTabs: 0,
    categoryCount: {},
    sessionsToday: 0,
    lastReset: new Date().toDateString()
};

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeCategoryCount = (value) => {
    if (!isObject(value)) return {};
    const normalized = {};
    for (const [category, count] of Object.entries(value)) {
        if (typeof category === 'string' && category.trim()) {
            const numericCount = Number(count);
            normalized[category.trim()] = Number.isFinite(numericCount) && numericCount > 0
                ? Math.floor(numericCount)
                : 0;
        }
    }
    return normalized;
};

export function withStatsDefaults(value = {}) {
    const source = isObject(value) ? value : {};
    const totalTabs = Number.isFinite(Number(source.totalTabs)) && Number(source.totalTabs) >= 0
        ? Math.floor(Number(source.totalTabs))
        : DEFAULT_STATS.totalTabs;

    const sessionsToday = Number.isFinite(Number(source.sessionsToday)) && Number(source.sessionsToday) >= 0
        ? Math.floor(Number(source.sessionsToday))
        : DEFAULT_STATS.sessionsToday;

    return {
        ...DEFAULT_STATS,
        ...source,
        totalTabs,
        sessionsToday,
        categoryCount: normalizeCategoryCount(source.categoryCount),
        lastReset: typeof source.lastReset === 'string' && source.lastReset.trim()
            ? source.lastReset
            : DEFAULT_STATS.lastReset,
        version: STATS_VERSION
    };
}

export function isStats(value) {
    if (!isObject(value)) return false;
    const normalized = withStatsDefaults(value);
    return typeof normalized.totalTabs === 'number'
        && typeof normalized.sessionsToday === 'number'
        && typeof normalized.lastReset === 'string'
        && isObject(normalized.categoryCount);
}

export function migrateStatsV0ToV1(value = {}) {
    const source = isObject(value) ? value : {};
    // Accept both raw stats and nested { groupingStats }
    const candidate = isObject(source.groupingStats) ? source.groupingStats : source;
    const migrated = withStatsDefaults(candidate);
    return {
        ...migrated,
        version: STATS_VERSION
    };
}

export async function getStats(defaults = DEFAULT_STATS) {
    const mergedDefaults = withStatsDefaults(defaults);
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.local.get({ groupingStats: mergedDefaults }, (result) => {
                if (chrome.runtime.lastError) {
                    console.warn("stats:getStats falling back to defaults:", chrome.runtime.lastError.message);
                    resolve(withStatsDefaults(mergedDefaults));
                    return;
                }
                resolve(withStatsDefaults(result.groupingStats));
            });
        } catch (error) {
            console.warn("stats:getStats caught error, using defaults:", error?.message || error);
            resolve(withStatsDefaults(mergedDefaults));
        }
    });
}

export async function updateStats(update) {
    const current = await getStats();
    const next = typeof update === 'function'
        ? update({ ...current })
        : { ...current, ...update };

    const normalized = withStatsDefaults(next);

    return new Promise((resolve) => {
        try {
            chrome.storage.local.set({ groupingStats: normalized }, () => {
                if (chrome.runtime.lastError) {
                    console.warn("stats:updateStats failed to persist; will retry next session:", chrome.runtime.lastError.message);
                } else {
                    resolve(normalized);
                }
            });
        } catch (error) {
            console.warn("stats:updateStats caught error; will retry next session:", error?.message || error);
            resolve(normalized);
        }
    });
}

export async function resetStats(defaults = DEFAULT_STATS) {
    const normalized = withStatsDefaults(defaults);
    return new Promise((resolve) => {
        try {
            chrome.storage.local.set({ groupingStats: normalized }, () => {
                if (chrome.runtime.lastError) {
                    console.warn("stats:resetStats failed to persist; will retry next session:", chrome.runtime.lastError.message);
                } else {
                    resolve(normalized);
                }
            });
        } catch (error) {
            console.warn("stats:resetStats caught error; will retry next session:", error?.message || error);
            resolve(normalized);
        }
    });
}

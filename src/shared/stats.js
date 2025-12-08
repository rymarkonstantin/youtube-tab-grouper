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
            : DEFAULT_STATS.lastReset
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

export async function getStats(defaults = DEFAULT_STATS) {
    const mergedDefaults = withStatsDefaults(defaults);
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.local.get({ groupingStats: mergedDefaults }, (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                resolve(withStatsDefaults(result.groupingStats));
            });
        } catch (error) {
            reject(error);
        }
    });
}

export async function updateStats(update) {
    const current = await getStats();
    const next = typeof update === 'function'
        ? update({ ...current })
        : { ...current, ...update };

    const normalized = withStatsDefaults(next);

    return new Promise((resolve, reject) => {
        try {
            chrome.storage.local.set({ groupingStats: normalized }, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(normalized);
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}

export async function resetStats(defaults = DEFAULT_STATS) {
    const normalized = withStatsDefaults(defaults);
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.local.set({ groupingStats: normalized }, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(normalized);
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}

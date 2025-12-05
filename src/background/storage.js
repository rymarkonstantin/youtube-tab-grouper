import { DEFAULT_SETTINGS, DEFAULT_STATS } from './constants.js';

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
    const settings = await getSync(defaults);
    return {
        ...defaults,
        ...settings,
        enabledColors: normalizeEnabledColors(settings.enabledColors, defaults),
        categoryKeywords: settings.categoryKeywords || defaults.categoryKeywords,
        channelCategoryMap: settings.channelCategoryMap || defaults.channelCategoryMap,
        allowedHashtags: settings.allowedHashtags || defaults.allowedHashtags
    };
}

export async function saveSettings(settings) {
    await setSync(settings);
}

export async function loadStats(defaultStats = DEFAULT_STATS) {
    const { groupingStats = defaultStats } = await getLocal({ groupingStats: defaultStats });
    return {
        ...defaultStats,
        ...groupingStats,
        categoryCount: groupingStats.categoryCount || {}
    };
}

export async function saveStats(stats) {
    await setLocal({ groupingStats: stats });
}

export async function runMigrations(defaults = DEFAULT_SETTINGS) {
    const settings = await loadSettings(defaults);
    let updated = false;

    if (!settings.enabledColors || Object.keys(settings.enabledColors).length === 0) {
        settings.enabledColors = defaults.enabledColors;
        updated = true;
    }

    if (!settings.categoryKeywords) {
        settings.categoryKeywords = defaults.categoryKeywords;
        updated = true;
    }

    if (updated) {
        await saveSettings(settings);
    }

    return settings;
}

function normalizeEnabledColors(enabledColors, defaults) {
    if (!enabledColors || typeof enabledColors !== 'object' || Object.keys(enabledColors).length === 0) {
        return defaults.enabledColors;
    }
    return enabledColors;
}

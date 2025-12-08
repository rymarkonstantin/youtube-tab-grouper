export const SETTINGS_VERSION = 1;

export const AVAILABLE_COLORS = [
    "grey", "blue", "red", "yellow",
    "green", "pink", "purple", "cyan"
];

export const CATEGORY_KEYWORDS = {
    "Gaming": ["gameplay", "gaming", "twitch", "esports", "fps", "rpg", "speedrun", "fortnite", "minecraft"],
    "Music": ["music", "song", "album", "artist", "concert", "cover", "remix", "lyrics"],
    "Tech": ["tech", "gadget", "review", "iphone", "laptop", "cpu", "gpu", "software", "coding"],
    "Cooking": ["recipe", "cooking", "food", "kitchen", "chef", "baking", "meal", "cuisine"],
    "Fitness": ["workout", "gym", "exercise", "fitness", "yoga", "training", "diet", "health"],
    "Education": ["tutorial", "course", "learn", "how to", "guide", "lesson", "education"],
    "News": ["news", "breaking", "current events", "politics", "world", "daily"],
    "Entertainment": ["movie", "series", "trailer", "reaction", "comedy", "funny", "meme"]
};

export const DEFAULT_SETTINGS = {
    autoGroupDelay: 2500,
    autoGroupDelayMs: 2500, // legacy alias support
    allowedHashtags: ['tech', 'music', 'gaming', 'cooking', 'sports', 'education', 'news'],
    channelCategoryMap: {},
    extensionEnabled: true,
    enabledColors: AVAILABLE_COLORS.reduce((obj, color) => {
        obj[color] = true;
        return obj;
    }, {}),
    autoCleanupEnabled: true,
    aiCategoryDetection: true,
    categoryKeywords: CATEGORY_KEYWORDS
};

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const toStringArray = (value) => {
    if (!Array.isArray(value)) return [];
    return value
        .map(item => typeof item === 'string' ? item.trim() : '')
        .filter(item => item.length > 0);
};

const normalizeEnabledColors = (value) => {
    if (!isObject(value)) {
        return { ...DEFAULT_SETTINGS.enabledColors };
    }

    const normalized = {};
    let enabledCount = 0;

    for (const color of AVAILABLE_COLORS) {
        const raw = value[color];
        const enabled = raw === false ? false : true;
        normalized[color] = enabled;
        if (enabled) enabledCount += 1;
    }

    // Fallback: if the user disabled everything, restore defaults so grouping still works.
    if (enabledCount === 0) {
        return { ...DEFAULT_SETTINGS.enabledColors };
    }

    return normalized;
};

const normalizeCategoryKeywords = (value) => {
    if (!isObject(value)) {
        return { ...DEFAULT_SETTINGS.categoryKeywords };
    }

    const normalized = {};

    // Preserve any user-defined categories while ensuring defaults exist.
    const combinedKeys = new Set([
        ...Object.keys(DEFAULT_SETTINGS.categoryKeywords),
        ...Object.keys(value)
    ]);

    for (const category of combinedKeys) {
        const keywords = toStringArray(value[category]);
        if (keywords.length > 0) {
            normalized[category] = keywords;
        } else if (DEFAULT_SETTINGS.categoryKeywords[category]) {
            normalized[category] = DEFAULT_SETTINGS.categoryKeywords[category];
        } else {
            normalized[category] = [];
        }
    }

    return normalized;
};

const normalizeChannelCategoryMap = (value) => {
    if (!isObject(value)) return {};
    const normalized = {};
    for (const [channel, category] of Object.entries(value)) {
        if (typeof channel === 'string' && channel.trim()) {
            normalized[channel.trim()] = typeof category === 'string' && category.trim()
                ? category.trim()
                : 'Other';
        }
    }
    return normalized;
};

export function withSettingsDefaults(value = {}) {
    const source = isObject(value) ? value : {};

    const rawDelay = Number.isFinite(Number(source.autoGroupDelayMs))
        ? Number(source.autoGroupDelayMs)
        : Number(source.autoGroupDelay);

    const autoGroupDelay = Number.isFinite(rawDelay)
        ? Math.max(0, rawDelay)
        : DEFAULT_SETTINGS.autoGroupDelay;

    return {
        ...DEFAULT_SETTINGS,
        ...source,
        autoGroupDelay,
        autoGroupDelayMs: autoGroupDelay,
        version: SETTINGS_VERSION,
        extensionEnabled: source.extensionEnabled !== false,
        aiCategoryDetection: source.aiCategoryDetection !== false,
        autoCleanupEnabled: source.autoCleanupEnabled !== false,
        allowedHashtags: toStringArray(source.allowedHashtags).length > 0
            ? toStringArray(source.allowedHashtags)
            : [...DEFAULT_SETTINGS.allowedHashtags],
        enabledColors: normalizeEnabledColors(source.enabledColors),
        categoryKeywords: normalizeCategoryKeywords(source.categoryKeywords),
        channelCategoryMap: normalizeChannelCategoryMap(source.channelCategoryMap)
    };
}

export function isSettings(value) {
    if (!isObject(value)) return false;
    const normalized = withSettingsDefaults(value);
    return typeof normalized.autoGroupDelay === 'number'
        && Array.isArray(normalized.allowedHashtags)
        && isObject(normalized.enabledColors)
        && isObject(normalized.categoryKeywords)
        && isObject(normalized.channelCategoryMap);
}

export function migrateSettingsV0ToV1(value = {}) {
    const source = isObject(value) ? value : {};

    const migrated = withSettingsDefaults({
        ...source,
        autoGroupDelay: source.autoGroupDelay ?? source.autoGroupDelayMs,
        autoGroupDelayMs: source.autoGroupDelayMs ?? source.autoGroupDelay
    });

    return {
        ...migrated,
        version: SETTINGS_VERSION
    };
}

export async function getSettings(defaults = DEFAULT_SETTINGS) {
    const mergedDefaults = withSettingsDefaults(defaults);
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.sync.get(mergedDefaults, (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                resolve(withSettingsDefaults(result));
            });
        } catch (error) {
            reject(error);
        }
    });
}

export async function updateSettings(update) {
    const current = await getSettings();
    const next = typeof update === 'function'
        ? update({ ...current })
        : { ...current, ...update };

    const normalized = withSettingsDefaults(next);

    return new Promise((resolve, reject) => {
        try {
            chrome.storage.sync.set(normalized, () => {
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

export async function resetSettings(defaults = DEFAULT_SETTINGS) {
    const normalized = withSettingsDefaults(defaults);
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.sync.set(normalized, () => {
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

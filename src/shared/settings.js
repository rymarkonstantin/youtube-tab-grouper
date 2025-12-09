/** @typedef {import('./types.ts').Settings} Settings */

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

/** @typedef {import('./types.ts').Settings} Settings */

export const DEFAULT_SETTINGS = {
    autoGroupDelay: 2500,
    autoGroupDelayMs: 2500, // legacy alias support
    autoCleanupGraceMs: 300000,
    allowedHashtags: ['tech', 'music', 'gaming', 'cooking', 'sports', 'education', 'news'],
    channelCategoryMap: {},
    extensionEnabled: true,
    debugLogging: false,
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

    const rawCleanupGrace = Number.isFinite(Number(source.autoCleanupGraceMs))
        ? Number(source.autoCleanupGraceMs)
        : DEFAULT_SETTINGS.autoCleanupGraceMs;

    const autoCleanupGraceMs = rawCleanupGrace >= 0
        ? rawCleanupGrace
        : DEFAULT_SETTINGS.autoCleanupGraceMs;

    return {
        ...DEFAULT_SETTINGS,
        ...source,
        autoGroupDelay,
        autoGroupDelayMs: autoGroupDelay,
        debugLogging: source.debugLogging === true,
        autoCleanupGraceMs,
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
    return new Promise((resolve) => {
        try {
            chrome.storage.sync.get(mergedDefaults, (result) => {
                if (chrome.runtime.lastError) {
                    console.warn("settings:getSettings falling back to defaults:", chrome.runtime.lastError.message);
                    resolve(withSettingsDefaults(mergedDefaults));
                    return;
                }
                resolve(withSettingsDefaults(result));
            });
        } catch (error) {
            console.warn("settings:getSettings caught error, using defaults:", error?.message || error);
            resolve(withSettingsDefaults(mergedDefaults));
        }
    });
}

export async function updateSettings(update) {
    const current = await getSettings();
    const next = typeof update === 'function'
        ? update({ ...current })
        : { ...current, ...update };

    const normalized = withSettingsDefaults(next);
    try {
        await scheduleSyncWrite(normalized);
    } catch (error) {
        console.warn("settings:updateSettings failed to persist; will retry next session:", error?.message || error);
    }
    return normalized;
}

export async function resetSettings(defaults = DEFAULT_SETTINGS) {
    const normalized = withSettingsDefaults(defaults);
    try {
        await scheduleSyncWrite(normalized);
    } catch (error) {
        console.warn("settings:resetSettings failed to persist; will retry next session:", error?.message || error);
    }
    return normalized;
}

// -----------------------------------------------------------------------------
// Internal sync write discipline (debounced + merged to reduce quota usage)
// -----------------------------------------------------------------------------
const SYNC_WRITE_DEBOUNCE_MS = 150;
let pendingSyncPayload = null;
let pendingSyncResolvers = [];
let pendingSyncTimer = null;

function sanitizeSettingsPayload(settings) {
    const payload = {
        version: settings.version ?? SETTINGS_VERSION,
        autoGroupDelay: settings.autoGroupDelay,
        autoGroupDelayMs: settings.autoGroupDelay,
        autoCleanupGraceMs: settings.autoCleanupGraceMs,
        allowedHashtags: settings.allowedHashtags || [],
        channelCategoryMap: settings.channelCategoryMap || {},
        extensionEnabled: settings.extensionEnabled !== false,
        aiCategoryDetection: settings.aiCategoryDetection !== false,
        autoCleanupEnabled: settings.autoCleanupEnabled !== false,
        enabledColors: settings.enabledColors || {},
        categoryKeywords: settings.categoryKeywords || {}
    };

    return Object.entries(payload).reduce((acc, [key, value]) => {
        if (value !== undefined) {
            acc[key] = value;
        }
        return acc;
    }, {});
}

function scheduleSyncWrite(settings) {
    const payload = sanitizeSettingsPayload(settings);

    return new Promise((resolve, reject) => {
        pendingSyncPayload = { ...(pendingSyncPayload || {}), ...payload };
        pendingSyncResolvers.push({ resolve, reject });

        clearTimeout(pendingSyncTimer);
        pendingSyncTimer = setTimeout(flushSyncWrite, SYNC_WRITE_DEBOUNCE_MS);
    });
}

function flushSyncWrite() {
    const payload = pendingSyncPayload;
    const resolvers = pendingSyncResolvers;

    pendingSyncPayload = null;
    pendingSyncResolvers = [];
    pendingSyncTimer = null;

    if (!payload || Object.keys(payload).length === 0) {
        resolvers.forEach(({ resolve }) => resolve({}));
        return;
    }

    chrome.storage.sync.set(payload, () => {
        if (chrome.runtime.lastError) {
            const error = new Error(chrome.runtime.lastError.message);
            console.warn("settings:flushSyncWrite failed; settings will retry on next change:", error.message);
            resolvers.forEach(({ reject }) => reject(error));
        } else {
            resolvers.forEach(({ resolve }) => resolve(payload));
        }
    });
}

import type { Settings, ChannelCategoryMap, CategoryKeywordsMap } from "./types";

export const SETTINGS_VERSION = 1;

export const AVAILABLE_COLORS = [
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan"
] as const;

export const CATEGORY_KEYWORDS: CategoryKeywordsMap = {
  Gaming: ["gameplay", "gaming", "twitch", "esports", "fps", "rpg", "speedrun", "fortnite", "minecraft"],
  Music: ["music", "song", "album", "artist", "concert", "cover", "remix", "lyrics"],
  Tech: ["tech", "gadget", "review", "iphone", "laptop", "cpu", "gpu", "software", "coding"],
  Cooking: ["recipe", "cooking", "food", "kitchen", "chef", "baking", "meal", "cuisine"],
  Fitness: ["workout", "gym", "exercise", "fitness", "yoga", "training", "diet", "health"],
  Education: ["tutorial", "course", "learn", "how to", "guide", "lesson", "education"],
  News: ["news", "breaking", "current events", "politics", "world", "daily"],
  Entertainment: ["movie", "series", "trailer", "reaction", "comedy", "funny", "meme"]
};

export const DEFAULT_SETTINGS: Settings = {
  autoGroupDelay: 2500,
  autoGroupDelayMs: 2500, // legacy alias support
  autoCleanupGraceMs: 300000,
  allowedHashtags: ["tech", "music", "gaming", "cooking", "sports", "education", "news"],
  channelCategoryMap: {},
  extensionEnabled: true,
  debugLogging: false,
  enabledColors: AVAILABLE_COLORS.reduce<Record<string, boolean>>((obj, color) => {
    obj[color] = true;
    return obj;
  }, {}),
  autoCleanupEnabled: true,
  aiCategoryDetection: true,
  categoryKeywords: CATEGORY_KEYWORDS,
  version: SETTINGS_VERSION
};

export function computeEnabledColors(
  settings: Settings,
  fallbackColors: readonly string[] = AVAILABLE_COLORS
): string[] {
  const enabledColors: string[] = [];

  if (settings.enabledColors && typeof settings.enabledColors === "object") {
    enabledColors.push(
      ...Object.entries(settings.enabledColors)
        .filter(([, enabled]) => Boolean(enabled))
        .map(([color]) => color)
    );
  }

  if (enabledColors.length === 0) {
    enabledColors.push(...fallbackColors);
  }

  return enabledColors;
}

type SettingsUpdater = Partial<Settings> | ((settings: Settings) => Settings);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
};

const normalizeEnabledColors = (value: unknown): Record<string, boolean> => {
  if (!isObject(value)) {
    return { ...DEFAULT_SETTINGS.enabledColors };
  }

  const normalized: Record<string, boolean> = {};
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

const normalizeCategoryKeywords = (value: unknown): CategoryKeywordsMap => {
  if (!isObject(value)) {
    return { ...DEFAULT_SETTINGS.categoryKeywords };
  }

  const normalized: CategoryKeywordsMap = {};

  const combinedKeys = new Set<string>([
    ...Object.keys(DEFAULT_SETTINGS.categoryKeywords),
    ...Object.keys(value as CategoryKeywordsMap)
  ]);

  for (const category of combinedKeys) {
    const keywords = toStringArray((value as CategoryKeywordsMap)[category]);
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

const normalizeChannelCategoryMap = (value: unknown): ChannelCategoryMap => {
  if (!isObject(value)) return {};
  const normalized: ChannelCategoryMap = {};
  for (const [channel, category] of Object.entries(value as ChannelCategoryMap)) {
    if (typeof channel === "string" && channel.trim()) {
      normalized[channel.trim()] =
        typeof category === "string" && category.trim() ? category.trim() : "Other";
    }
  }
  return normalized;
};

export function withSettingsDefaults(value: Partial<Settings> = {}): Settings {
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

  const autoCleanupGraceMs = rawCleanupGrace >= 0 ? rawCleanupGrace : DEFAULT_SETTINGS.autoCleanupGraceMs;

  const normalizedHashtags = toStringArray(source.allowedHashtags);

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
    allowedHashtags: normalizedHashtags.length > 0 ? normalizedHashtags : [...DEFAULT_SETTINGS.allowedHashtags],
    enabledColors: normalizeEnabledColors(source.enabledColors),
    categoryKeywords: normalizeCategoryKeywords(source.categoryKeywords),
    channelCategoryMap: normalizeChannelCategoryMap(source.channelCategoryMap)
  };
}

export function isSettings(value: unknown): value is Settings {
  if (!isObject(value)) return false;
  const normalized = withSettingsDefaults(value);
  return (
    typeof normalized.autoGroupDelay === "number" &&
    Array.isArray(normalized.allowedHashtags) &&
    isObject(normalized.enabledColors) &&
    isObject(normalized.categoryKeywords) &&
    isObject(normalized.channelCategoryMap)
  );
}

export function migrateSettingsV0ToV1(value: Partial<Settings> = {}): Settings {
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

export async function getSettings(defaults: Settings = DEFAULT_SETTINGS): Promise<Settings> {
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
      console.warn("settings:getSettings caught error, using defaults:", (error as Error)?.message || error);
      resolve(withSettingsDefaults(mergedDefaults));
    }
  });
}

export async function updateSettings(update: SettingsUpdater): Promise<Settings> {
  const current = await getSettings();
  const next =
    typeof update === "function" ? (update as (s: Settings) => Settings)({ ...current }) : { ...current, ...update };

  const normalized = withSettingsDefaults(next);
  try {
    await scheduleSyncWrite(normalized);
  } catch (error) {
    console.warn("settings:updateSettings failed to persist; will retry next session:", (error as Error)?.message || error);
  }
  return normalized;
}

export async function resetSettings(defaults: Settings = DEFAULT_SETTINGS): Promise<Settings> {
  const normalized = withSettingsDefaults(defaults);
  try {
    await scheduleSyncWrite(normalized);
  } catch (error) {
    console.warn("settings:resetSettings failed to persist; will retry next session:", (error as Error)?.message || error);
  }
  return normalized;
}

// -----------------------------------------------------------------------------
// Internal sync write discipline (debounced + merged to reduce quota usage)
// -----------------------------------------------------------------------------
const SYNC_WRITE_DEBOUNCE_MS = 150;
let pendingSyncPayload: Partial<Settings> | null = null;
let pendingSyncSettings: Settings | null = null;
let pendingSyncResolvers: { resolve: (value: Settings | PromiseLike<Settings>) => void; reject: (reason?: unknown) => void }[] =
  [];
let pendingSyncTimer: ReturnType<typeof setTimeout> | null = null;

function sanitizeSettingsPayload(settings: Settings) {
  const payload: Partial<Settings> = {
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

  return Object.entries(payload).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function scheduleSyncWrite(settings: Settings) {
  const payload = sanitizeSettingsPayload(settings);

  return new Promise<Settings>((resolve, reject) => {
    pendingSyncPayload = { ...(pendingSyncPayload || {}), ...payload };
    pendingSyncSettings = settings;
    pendingSyncResolvers.push({ resolve, reject });

    if (pendingSyncTimer) {
      clearTimeout(pendingSyncTimer);
    }
    pendingSyncTimer = setTimeout(flushSyncWrite, SYNC_WRITE_DEBOUNCE_MS);
  });
}

function flushSyncWrite() {
  const payload = pendingSyncPayload;
  const resolvers = pendingSyncResolvers;
  const resolvedSettings = pendingSyncSettings || DEFAULT_SETTINGS;

  pendingSyncPayload = null;
  pendingSyncSettings = null;
  pendingSyncResolvers = [];
  pendingSyncTimer = null;

  if (!payload || Object.keys(payload).length === 0) {
    resolvers.forEach(({ resolve }) => resolve(resolvedSettings));
    return;
  }

  chrome.storage.sync.set(payload, () => {
    if (chrome.runtime.lastError) {
      const error = new Error(chrome.runtime.lastError.message);
      console.warn("settings:flushSyncWrite failed; settings will retry on next change:", error.message);
      resolvers.forEach(({ reject }) => reject(error));
    } else {
      resolvers.forEach(({ resolve }) => resolve(resolvedSettings));
    }
  });
}

import type { GroupingStats } from "./types";

export const STATS_VERSION = 1;

export const DEFAULT_STATS: GroupingStats = {
  totalTabs: 0,
  categoryCount: {},
  sessionsToday: 0,
  lastReset: new Date().toDateString(),
  version: STATS_VERSION
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeCategoryCount = (value: unknown): Record<string, number> => {
  if (!isObject(value)) return {};
  const normalized: Record<string, number> = {};
  for (const [category, count] of Object.entries(value)) {
    if (typeof category === "string" && category.trim()) {
      const numericCount = Number(count);
      normalized[category.trim()] = Number.isFinite(numericCount) && numericCount > 0 ? Math.floor(numericCount) : 0;
    }
  }
  return normalized;
};

export function withStatsDefaults(value: Partial<GroupingStats> = {}): GroupingStats {
  const source = isObject(value) ? value : {};
  const totalTabs =
    Number.isFinite(Number(source.totalTabs)) && Number(source.totalTabs) >= 0
      ? Math.floor(Number(source.totalTabs))
      : DEFAULT_STATS.totalTabs;

  const sessionsToday =
    Number.isFinite(Number(source.sessionsToday)) && Number(source.sessionsToday) >= 0
      ? Math.floor(Number(source.sessionsToday))
      : DEFAULT_STATS.sessionsToday;

  return {
    ...DEFAULT_STATS,
    ...source,
    totalTabs,
    sessionsToday,
    categoryCount: normalizeCategoryCount(source.categoryCount),
    lastReset:
      typeof source.lastReset === "string" && source.lastReset.trim() ? source.lastReset : DEFAULT_STATS.lastReset,
    version: STATS_VERSION
  };
}

export function isStats(value: unknown): value is GroupingStats {
  if (!isObject(value)) return false;
  const normalized = withStatsDefaults(value);
  return (
    typeof normalized.totalTabs === "number" &&
    typeof normalized.sessionsToday === "number" &&
    typeof normalized.lastReset === "string" &&
    isObject(normalized.categoryCount)
  );
}

export function migrateStatsV0ToV1(value: Partial<GroupingStats> = {}): GroupingStats {
  const source = isObject(value) ? value : {};
  const candidate = isObject((source as { groupingStats?: Partial<GroupingStats> }).groupingStats)
    ? (source as { groupingStats?: Partial<GroupingStats> }).groupingStats
    : source;
  const migrated = withStatsDefaults(candidate);
  return {
    ...migrated,
    version: STATS_VERSION
  };
}

export async function getStats(defaults: GroupingStats = DEFAULT_STATS): Promise<GroupingStats> {
  const mergedDefaults = withStatsDefaults(defaults);
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get({ groupingStats: mergedDefaults }, (result) => {
        if (chrome.runtime.lastError) {
          console.warn("stats:getStats falling back to defaults:", chrome.runtime.lastError.message);
          resolve(withStatsDefaults(mergedDefaults));
          return;
        }
        const payload = (result as { groupingStats?: Partial<GroupingStats> }).groupingStats;
        resolve(withStatsDefaults(payload));
      });
    } catch (error) {
      console.warn("stats:getStats caught error, using defaults:", (error as Error)?.message || error);
      resolve(withStatsDefaults(mergedDefaults));
    }
  });
}

export async function updateStats(
  update: Partial<GroupingStats> | ((stats: GroupingStats) => GroupingStats)
): Promise<GroupingStats> {
  const current = await getStats();
  const next =
    typeof update === "function"
      ? (update as (s: GroupingStats) => GroupingStats)({ ...current })
      : { ...current, ...update };

  const normalized = withStatsDefaults(next);

  return new Promise((resolve) => {
    try {
      chrome.storage.local.set({ groupingStats: normalized }, () => {
        if (chrome.runtime.lastError) {
          console.warn(
            "stats:updateStats failed to persist; will retry next session:",
            chrome.runtime.lastError.message
          );
        } else {
          resolve(normalized);
        }
      });
    } catch (error) {
      console.warn("stats:updateStats caught error; will retry next session:", (error as Error)?.message || error);
      resolve(normalized);
    }
  });
}

export async function resetStats(defaults: GroupingStats = DEFAULT_STATS): Promise<GroupingStats> {
  const normalized = withStatsDefaults(defaults);
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set({ groupingStats: normalized }, () => {
        if (chrome.runtime.lastError) {
          console.warn(
            "stats:resetStats failed to persist; will retry next session:",
            chrome.runtime.lastError.message
          );
        } else {
          resolve(normalized);
        }
      });
    } catch (error) {
      console.warn("stats:resetStats caught error; will retry next session:", (error as Error)?.message || error);
      resolve(normalized);
    }
  });
}

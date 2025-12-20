import type { GroupingStats } from "./types";

export const STATS_VERSION = 1;

export type StatsSnapshot = Readonly<GroupingStats>;
export type StatsUpdate = Partial<GroupingStats> | ((current: StatsSnapshot) => Partial<GroupingStats>);

export const DEFAULT_STATS: GroupingStats = {
  totalTabs: 0,
  categoryCount: {},
  groupingSuccesses: 0,
  groupingFailures: 0,
  totalGroupingDurationMs: 0,
  lastGroupingDurationMs: 0,
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

const mutationGuard: ProxyHandler<Record<string, unknown>> = {
  set(_target, property) {
    console.warn("stats: attempted to mutate snapshot directly; use StatsService methods", String(property));
    return false;
  },
  deleteProperty(_target, property) {
    console.warn("stats: attempted to delete snapshot property; use StatsService methods", String(property));
    return false;
  }
};

const createGuardedSnapshot = (stats: GroupingStats): StatsSnapshot => {
  const categoryCount = new Proxy(Object.freeze({ ...stats.categoryCount }), mutationGuard);
  return new Proxy(Object.freeze({ ...stats, categoryCount }), mutationGuard) as StatsSnapshot;
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

  const groupingSuccesses =
    Number.isFinite(Number(source.groupingSuccesses)) && Number(source.groupingSuccesses) >= 0
      ? Math.floor(Number(source.groupingSuccesses))
      : DEFAULT_STATS.groupingSuccesses;

  const groupingFailures =
    Number.isFinite(Number(source.groupingFailures)) && Number(source.groupingFailures) >= 0
      ? Math.floor(Number(source.groupingFailures))
      : DEFAULT_STATS.groupingFailures;

  const totalGroupingDurationMs =
    Number.isFinite(Number(source.totalGroupingDurationMs)) && Number(source.totalGroupingDurationMs) >= 0
      ? Math.floor(Number(source.totalGroupingDurationMs))
      : DEFAULT_STATS.totalGroupingDurationMs;

  const lastGroupingDurationMs =
    Number.isFinite(Number(source.lastGroupingDurationMs)) && Number(source.lastGroupingDurationMs) >= 0
      ? Math.floor(Number(source.lastGroupingDurationMs))
      : DEFAULT_STATS.lastGroupingDurationMs;

  return {
    ...DEFAULT_STATS,
    ...source,
    totalTabs,
    groupingSuccesses,
    groupingFailures,
    totalGroupingDurationMs,
    lastGroupingDurationMs,
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

export class StatsService {
  private snapshot: StatsSnapshot;
  private defaults: GroupingStats;
  private loaded = false;

  constructor(defaults: GroupingStats = DEFAULT_STATS) {
    this.defaults = withStatsDefaults(defaults);
    this.snapshot = createGuardedSnapshot(this.defaults);
  }

  getDefaults(): GroupingStats {
    return withStatsDefaults(this.defaults);
  }

  clearCache(): void {
    this.loaded = false;
    this.snapshot = createGuardedSnapshot(this.defaults);
  }

  getSnapshot(): StatsSnapshot {
    if (!this.loaded) {
      console.warn("stats:getSnapshot called before load; returning defaults snapshot");
    }
    return this.snapshot;
  }

  async load(defaults: GroupingStats = this.defaults): Promise<StatsSnapshot> {
    this.defaults = withStatsDefaults(defaults);
    const stored = await this.readFromStorage(this.defaults);
    this.loaded = true;
    return this.setSnapshot(stored);
  }

  async merge(update: StatsUpdate): Promise<StatsSnapshot> {
    return this.applyUpdate((current) => {
      const candidate = typeof update === "function" ? update(this.snapshot) : update;
      if (!isObject(candidate)) {
        console.warn("stats:merge ignored non-object update");
        return current;
      }

      const categoryCount = candidate.categoryCount ? normalizeCategoryCount(candidate.categoryCount) : undefined;
      return {
        ...current,
        ...candidate,
        categoryCount: categoryCount ? { ...current.categoryCount, ...categoryCount } : current.categoryCount,
        version: STATS_VERSION
      };
    });
  }

  async set(update: GroupingStats | StatsUpdate): Promise<StatsSnapshot> {
    const candidate = typeof update === "function" ? update(this.snapshot) : update;
    if (!isObject(candidate)) {
      console.warn("stats:set ignored non-object update");
      return this.getSnapshot();
    }

    const normalized = withStatsDefaults(candidate);
    this.loaded = true;
    this.setSnapshot(normalized);
    await this.persistSnapshot(normalized);
    return this.snapshot;
  }

  async increment(field: "totalTabs" | "sessionsToday", amount = 1): Promise<StatsSnapshot> {
    const incrementBy = Number.isFinite(amount) ? Math.floor(amount) : 0;
    return this.applyUpdate((current) => {
      const nextValue = Math.max(0, current[field] + incrementBy);
      return {
        ...current,
        [field]: nextValue
      } as GroupingStats;
    });
  }

  async incrementCategory(category: string, amount = 1): Promise<StatsSnapshot> {
    const categoryKey = typeof category === "string" ? category.trim() : "";
    if (!categoryKey) {
      console.warn("stats:incrementCategory called with empty category; ignoring");
      return this.getSnapshot();
    }
    const incrementBy = Number.isFinite(amount) ? Math.floor(amount) : 0;
    return this.applyUpdate((current) => {
      const nextCount = Math.max(0, (current.categoryCount[categoryKey] ?? 0) + incrementBy);
      return {
        ...current,
        categoryCount: {
          ...current.categoryCount,
          [categoryKey]: nextCount
        }
      };
    });
  }

  async recordGroupingResult({
    category,
    durationMs,
    success
  }: {
    category?: string;
    durationMs?: number;
    success: boolean;
  }): Promise<StatsSnapshot> {
    const categoryKey = typeof category === "string" ? category.trim() : "";
    const normalizedDuration =
      Number.isFinite(durationMs) && Number(durationMs) > 0 ? Math.floor(Number(durationMs)) : 0;

    return this.applyUpdate((current) => {
      const nextCategoryCount =
        success && categoryKey
          ? {
              ...current.categoryCount,
              [categoryKey]: Math.max(0, (current.categoryCount[categoryKey] ?? 0) + 1)
            }
          : current.categoryCount;

      return {
        ...current,
        totalTabs: success ? current.totalTabs + 1 : current.totalTabs,
        groupingSuccesses: current.groupingSuccesses + (success ? 1 : 0),
        groupingFailures: current.groupingFailures + (success ? 0 : 1),
        totalGroupingDurationMs: current.totalGroupingDurationMs + normalizedDuration,
        lastGroupingDurationMs: normalizedDuration,
        categoryCount: nextCategoryCount
      };
    });
  }

  async reset(defaults: GroupingStats = this.defaults): Promise<StatsSnapshot> {
    const normalized = withStatsDefaults(defaults);
    this.defaults = normalized;
    this.loaded = true;
    this.setSnapshot(normalized);
    await this.persistSnapshot(normalized);
    return this.snapshot;
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) {
      await this.load(this.defaults);
    }
  }

  private async applyUpdate(updater: (current: GroupingStats) => GroupingStats): Promise<StatsSnapshot> {
    await this.ensureLoaded();
    const base = withStatsDefaults({ ...this.snapshot });
    const next = withStatsDefaults(updater(base));
    const snapshot = this.setSnapshot(next);
    await this.persistSnapshot(next);
    return snapshot;
  }

  private async readFromStorage(defaults: GroupingStats): Promise<GroupingStats> {
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

  private setSnapshot(next: Partial<GroupingStats>): StatsSnapshot {
    const normalized = withStatsDefaults({ ...this.defaults, ...next });
    this.snapshot = createGuardedSnapshot(normalized);
    return this.snapshot;
  }

  private async persistSnapshot(next: GroupingStats): Promise<void> {
    const normalized = withStatsDefaults(next);
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ groupingStats: normalized }, () => {
          if (chrome.runtime.lastError) {
            console.warn(
              "stats:updateStats failed to persist; will retry next session:",
              chrome.runtime.lastError.message
            );
          }
          resolve();
        });
      } catch (error) {
        console.warn("stats:updateStats caught error; will retry next session:", (error as Error)?.message || error);
        resolve();
      }
    });
  }
}

export const statsService = new StatsService();

export async function getStats(defaults: GroupingStats = DEFAULT_STATS): Promise<StatsSnapshot> {
  return statsService.load(defaults);
}

export async function updateStats(update: StatsUpdate): Promise<StatsSnapshot> {
  return statsService.merge(update);
}

export async function resetStats(defaults: GroupingStats = DEFAULT_STATS): Promise<StatsSnapshot> {
  return statsService.reset(defaults);
}

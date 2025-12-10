import { DEFAULT_STATS, migrateStatsV0ToV1, withStatsDefaults } from "../constants";
import { getStats, resetStats, updateStats } from "../../shared/stats";
import type { GroupingStats } from "../../shared/types";

export class StatsRepository {
  private cache: GroupingStats | null = null;
  private defaults: GroupingStats;

  constructor(defaults: GroupingStats = DEFAULT_STATS) {
    this.defaults = defaults;
  }

  async get(): Promise<GroupingStats> {
    if (this.cache) return this.cache;
    const stats = await getStats(withStatsDefaults(this.defaults));
    const migrated = migrateStatsV0ToV1(stats);
    this.cache = migrated;
    return migrated;
  }

  async save(next: Partial<GroupingStats> | GroupingStats): Promise<GroupingStats> {
    const updated = await updateStats(next as GroupingStats);
    this.cache = updated;
    return updated;
  }

  async reset(defaults: GroupingStats = this.defaults): Promise<GroupingStats> {
    const normalized = withStatsDefaults(defaults);
    const resetValue = await resetStats(normalized);
    this.cache = resetValue;
    return resetValue;
  }

  clearCache() {
    this.cache = null;
  }

  getDefaults() {
    return withStatsDefaults(this.defaults);
  }
}

export const statsRepository = new StatsRepository();

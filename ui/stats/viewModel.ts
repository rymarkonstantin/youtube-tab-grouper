import type { StatsSnapshot } from "../../src/shared/stats.js";

interface CategoryBreakdown {
  category: string;
  count: number;
  percentage: number;
}

export interface StatsViewModel {
  totalTabs: number;
  totalCategories: number;
  topCategory: string;
  topCategoryCount: number;
  hasCategoryData: boolean;
  categoryBreakdown: CategoryBreakdown[];
}

const normalizeNumber = (value: unknown): number =>
  Number.isFinite(value) ? Math.max(0, Math.floor(Number(value))) : 0;

export function buildStatsViewModel(stats?: StatsSnapshot): StatsViewModel {
  const totalTabs = normalizeNumber(stats?.totalTabs);
  const categoryEntries =
    stats?.categoryCount && typeof stats.categoryCount === "object"
      ? Object.entries(stats.categoryCount).filter(([, count]) => normalizeNumber(count) > 0)
      : [];

  const sortedEntries = [...categoryEntries].sort(([, a], [, b]) => normalizeNumber(b) - normalizeNumber(a));
  const totalCategories = sortedEntries.length;
  const hasCategoryData = totalCategories > 0;
  const topCategoryCount = hasCategoryData ? normalizeNumber(sortedEntries[0][1]) : 0;
  const topCategory = hasCategoryData ? sortedEntries[0][0] : "-";
  const maxCount = topCategoryCount || 1;

  const categoryBreakdown: CategoryBreakdown[] = hasCategoryData
    ? sortedEntries.map(([category, count]) => ({
        category,
        count: normalizeNumber(count),
        percentage: (normalizeNumber(count) / maxCount) * 100
      }))
    : [];

  return {
    totalTabs,
    totalCategories,
    topCategory,
    topCategoryCount,
    hasCategoryData,
    categoryBreakdown
  };
}

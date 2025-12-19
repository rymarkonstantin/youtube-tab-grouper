import { normalizeVideoMetadata } from "../metadataSchema";
import { DEFAULT_SETTINGS, withSettingsDefaults } from "../settings";
import type { Metadata, Settings } from "../types";

export const FALLBACK_CATEGORY = "Other";

export const toCategory = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export interface ResolveCategoryInput {
  metadata?: Partial<Metadata>;
  settings?: Partial<Settings>;
  requestedCategory?: string;
  fallbackCategory?: string;
}

export interface StrategyContext {
  metadata: Metadata;
  settings: Settings;
  requestedCategory: string;
  fallbackCategory?: string;
}

export type CategoryStrategy = (context: StrategyContext) => string;

export const createStrategyContext = ({
  metadata: rawMetadata = {},
  settings: rawSettings = DEFAULT_SETTINGS,
  requestedCategory = "",
  fallbackCategory
}: ResolveCategoryInput): StrategyContext => ({
  metadata: normalizeVideoMetadata(rawMetadata),
  settings: withSettingsDefaults(rawSettings),
  requestedCategory,
  fallbackCategory
});

export const runCategoryPipeline = (
  context: StrategyContext,
  strategies: CategoryStrategy[]
): string => {
  for (const strategy of strategies) {
    const category = toCategory(strategy(context));
    if (category) {
      return category;
    }
  }

  return toCategory(context.fallbackCategory) || FALLBACK_CATEGORY;
};

export const resolveCategoryPipeline = (
  input: ResolveCategoryInput,
  strategies: CategoryStrategy[]
): string => {
  const context = createStrategyContext(input);
  return runCategoryPipeline(context, strategies);
};

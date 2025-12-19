import { normalizeResolveCategoryMetadata } from "./pipeline";
import type { ResolveCategoryInput, ResolveCategoryNormalizationOptions } from "./pipeline";
import type { Metadata, Settings } from "../types";

const toRequestedCategory = (value?: string) => (typeof value === "string" ? value.trim() : "");

export interface ResolveCategoryAdapterResult {
  input: ResolveCategoryInput & { metadata: Metadata };
  normalizeOptions: ResolveCategoryNormalizationOptions;
}

export interface BackgroundAdapterContext {
  tab?: chrome.tabs.Tab;
  settings?: Partial<Settings>;
  metadata?: Partial<Metadata>;
  requestedCategory?: string;
  fallbackMetadata?: Partial<Metadata>;
  fallbackCategory?: string;
}

export interface ContentAdapterContext {
  metadata?: Partial<Metadata>;
  requestedCategory?: string;
  fallbackMetadata?: Partial<Metadata>;
  fallbackCategory?: string;
}

const buildNormalizeOptions = (
  fallbackMetadata: Partial<Metadata> = {},
  fallbackTitle = "",
  fallbackDescription = ""
): ResolveCategoryNormalizationOptions => ({
  fallbackMetadata,
  fallbackTitle: fallbackTitle || fallbackMetadata.title || "",
  fallbackDescription: fallbackDescription || fallbackMetadata.description || ""
});

export const adaptBackgroundResolveCategoryInput = ({
  tab,
  settings,
  metadata = {},
  requestedCategory = "",
  fallbackMetadata,
  fallbackCategory
}: BackgroundAdapterContext): ResolveCategoryAdapterResult => {
  const fallback = fallbackMetadata ?? metadata ?? {};
  const normalizeOptions = buildNormalizeOptions(fallback, tab?.title || "", fallback.description || "");

  return {
    input: {
      metadata: normalizeResolveCategoryMetadata(metadata, normalizeOptions),
      settings,
      requestedCategory: toRequestedCategory(requestedCategory),
      fallbackCategory
    },
    normalizeOptions
  };
};

export const adaptContentResolveCategoryInput = ({
  metadata = {},
  requestedCategory = "",
  fallbackMetadata,
  fallbackCategory
}: ContentAdapterContext = {}): ResolveCategoryAdapterResult => {
  const fallback = fallbackMetadata ?? metadata ?? {};
  const normalizeOptions = buildNormalizeOptions(fallback, fallback.title || "", fallback.description || "");

  return {
    input: {
      metadata: normalizeResolveCategoryMetadata(metadata, normalizeOptions),
      requestedCategory: toRequestedCategory(requestedCategory),
      fallbackCategory
    },
    normalizeOptions
  };
};

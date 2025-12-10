import type { Metadata } from "../../shared/types";
import { normalizeVideoMetadata } from "../../shared/metadataSchema";
import { DEFAULT_SETTINGS } from "../constants";

type Strategy = (metadata: Metadata, context: CategoryContext) => string;

export interface CategoryResolverOptions {
  aiEnabled?: boolean;
  categoryKeywords?: Record<string, string[]>;
  channelMap?: Record<string, string>;
  fallbackCategory?: string;
  requestedCategory?: string;
  strategies?: Strategy[];
}

export interface CategoryContext {
  requestedCategory: string;
  aiEnabled: boolean;
  categoryKeywords: Record<string, string[]>;
  channelMap: Record<string, string>;
  fallbackCategory: string;
}

const FALLBACK_CATEGORY = "Other";

const toCategory = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const fromChannelMap: Strategy = (metadata, context) => {
  const channel = metadata.channel?.trim() || "";
  if (!channel) return "";
  return context.channelMap[channel] || "";
};

const fromOverride: Strategy = (_metadata, context) => toCategory(context.requestedCategory);

const fromKeywords: Strategy = (metadata, context) => {
  if (!context.aiEnabled) return "";

  const scores: Record<string, number> = {};
  const text = `${metadata.title} ${metadata.description} ${(metadata.keywords || []).join(" ")}`.toLowerCase();

  for (const [category, keywords] of Object.entries(context.categoryKeywords || {})) {
    const score = (keywords || []).reduce((sum, keyword) => {
      const regex = new RegExp(`\\b${keyword}\\b`, "gi");
      return sum + (text.match(regex) || []).length;
    }, 0);

    if (score > 0) {
      scores[category] = score;
    }
  }

  let bestCategory = "";
  let bestScore = 0;

  for (const [category, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestCategory = category;
      bestScore = score;
    }
  }

  return bestCategory;
};

export const mapYouTubeCategory = (youtubeCategory: string | number | null) => {
  if (!youtubeCategory) return "";

  const categoryMap: Record<string, string> = {
    Music: "Music",
    Gaming: "Gaming",
    Entertainment: "Entertainment",
    Sports: "Fitness",
    "News & Politics": "News",
    Education: "Education",
    Tech: "Tech",
    Cooking: "Cooking",
    "Howto & Style": "Education",
    "Travel & Events": "Entertainment",
    "People & Blogs": "Entertainment",
    Comedy: "Entertainment",
    "Film & Animation": "Entertainment",
    Autos: "Tech",
    "Pets & Animals": "Entertainment",
    "Nonprofits & Activism": "News"
  };

  return categoryMap[String(youtubeCategory)] || "";
};

const fromYouTubeCategory: Strategy = (metadata) => mapYouTubeCategory(metadata.youtubeCategory);

export class CategoryResolver {
  private strategies: Strategy[];
  private fallbackCategory: string;

  constructor(private defaults: CategoryResolverOptions = {}) {
    this.strategies =
      defaults.strategies || [fromChannelMap, fromOverride, fromKeywords, fromYouTubeCategory];
    this.fallbackCategory = defaults.fallbackCategory || FALLBACK_CATEGORY;
  }

  resolve(rawMetadata: Metadata, options: Partial<CategoryResolverOptions> = {}) {
    const metadata = normalizeVideoMetadata(rawMetadata);
    const context: CategoryContext = {
      requestedCategory: options?.requestedCategory ?? "",
      aiEnabled: options?.aiEnabled ?? true,
      categoryKeywords: options?.categoryKeywords || this.defaults.categoryKeywords || DEFAULT_SETTINGS.categoryKeywords,
      channelMap: options?.channelMap || this.defaults.channelMap || {},
      fallbackCategory: options?.fallbackCategory || this.defaults.fallbackCategory || FALLBACK_CATEGORY
    };

    for (const strategy of this.strategies) {
      const category = strategy(metadata, context);
      if (category) {
        return category;
      }
    }

    return context.fallbackCategory;
  }
}

export const categoryResolver = new CategoryResolver();

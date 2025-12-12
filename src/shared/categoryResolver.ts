import type { Metadata, Settings } from "./types";
import { normalizeVideoMetadata } from "./metadataSchema";
import { DEFAULT_SETTINGS, withSettingsDefaults } from "./settings";

const FALLBACK_CATEGORY = "Other";

const toCategory = (value: unknown) => (typeof value === "string" ? value.trim() : "");

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

export interface ResolveCategoryInput {
  metadata?: Partial<Metadata>;
  settings?: Partial<Settings>;
  requestedCategory?: string;
  fallbackCategory?: string;
}

interface StrategyContext {
  metadata: Metadata;
  settings: Settings;
  requestedCategory: string;
  fallbackCategory?: string;
}

export class CategoryResolver {
  resolve({
    metadata: rawMetadata = {},
    settings: rawSettings = DEFAULT_SETTINGS,
    requestedCategory = "",
    fallbackCategory
  }: ResolveCategoryInput): string {
    const context: StrategyContext = {
      metadata: normalizeVideoMetadata(rawMetadata),
      settings: withSettingsDefaults(rawSettings),
      requestedCategory,
      fallbackCategory
    };

    for (const strategy of this.getStrategies(context)) {
      const category = strategy();
      if (category) {
        return category;
      }
    }

    return toCategory(context.fallbackCategory) || FALLBACK_CATEGORY;
  }

  private getStrategies(context: StrategyContext): (() => string)[] {
    return [
      () => this.useRequestedCategory(context),
      () => this.useChannelCategory(context),
      () => this.useKeywordScores(context),
      () => this.useYouTubeCategory(context)
    ];
  }

  private useRequestedCategory({ requestedCategory }: StrategyContext): string {
    return toCategory(requestedCategory);
  }

  private useChannelCategory({ metadata, settings }: StrategyContext): string {
    const channel = metadata.channel?.trim();
    if (!channel) return "";

    return settings.channelCategoryMap[channel] || "";
  }

  private useKeywordScores({ metadata, settings }: StrategyContext): string {
    if (!settings.aiCategoryDetection) return "";

    const scores: Record<string, number> = {};
    const text = `${metadata.title} ${metadata.description} ${(metadata.keywords || []).join(" ")}`.toLowerCase();

    for (const [category, keywords] of Object.entries(settings.categoryKeywords || {})) {
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
  }

  private useYouTubeCategory({ metadata }: StrategyContext): string {
    return mapYouTubeCategory(metadata.youtubeCategory);
  }
}

export const categoryResolver = new CategoryResolver();


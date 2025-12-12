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

export type CategoryResolverConstructor = new (
  input: ResolveCategoryInput
) => CategoryResolver;

export class CategoryResolver {
  private readonly metadata: Metadata;

  private readonly settings: Settings;

  private readonly requestedCategory: string;

  private readonly fallbackCategory?: string;

  constructor({
    metadata: rawMetadata = {},
    settings: rawSettings = DEFAULT_SETTINGS,
    requestedCategory = "",
    fallbackCategory
  }: ResolveCategoryInput) {
    this.metadata = normalizeVideoMetadata(rawMetadata);
    this.settings = withSettingsDefaults(rawSettings);
    this.requestedCategory = requestedCategory;
    this.fallbackCategory = fallbackCategory;
  }

  resolve(): string {
    for (const strategy of this.getStrategies()) {
      const category = strategy();
      if (category) {
        return category;
      }
    }

    return toCategory(this.fallbackCategory) || FALLBACK_CATEGORY;
  }

  private getStrategies(): (() => string)[] {
    return [
      () => this.useRequestedCategory(),
      () => this.useChannelCategory(),
      () => this.useKeywordScores(),
      () => this.useYouTubeCategory()
    ];
  }

  private useRequestedCategory(): string {
    return toCategory(this.requestedCategory);
  }

  private useChannelCategory(): string {
    const channel = this.metadata.channel?.trim();
    if (!channel) return "";

    return this.settings.channelCategoryMap[channel] || "";
  }

  private useKeywordScores(): string {
    if (!this.settings.aiCategoryDetection) return "";

    const scores: Record<string, number> = {};
    const text = `${this.metadata.title} ${this.metadata.description} ${(this.metadata.keywords || []).join(" ")}`.toLowerCase();

    for (const [category, keywords] of Object.entries(this.settings.categoryKeywords || {})) {
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

  private useYouTubeCategory(): string {
    return mapYouTubeCategory(this.metadata.youtubeCategory);
  }
}


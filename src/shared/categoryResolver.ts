import { resolveCategoryPipeline, toCategory } from "./categoryResolver/pipeline";
import type {
  CategoryStrategy,
  ResolveCategoryInput,
  ResolveCategoryNormalizationOptions,
  StrategyContext
} from "./categoryResolver/pipeline";

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

export class CategoryResolver {
  resolve({
    metadata,
    settings,
    requestedCategory,
    fallbackCategory
  }: ResolveCategoryInput = {}, normalizeOptions: ResolveCategoryNormalizationOptions = {}): string {
    return resolveCategoryPipeline(
      {
        metadata,
        settings,
        requestedCategory,
        fallbackCategory
      },
      this.getStrategies(),
      normalizeOptions
    );
  }

  private getStrategies(): CategoryStrategy[] {
    return [
      (context) => this.useRequestedCategory(context),
      (context) => this.useChannelCategory(context),
      (context) => this.useKeywordScores(context),
      (context) => this.useYouTubeCategory(context)
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

export {
  createStrategyContext,
  resolveCategoryPipeline,
  runCategoryPipeline,
  toCategory,
  FALLBACK_CATEGORY,
  normalizeResolveCategoryMetadata
} from "./categoryResolver/pipeline";
export type {
  ResolveCategoryInput,
  ResolveCategoryNormalizationOptions,
  StrategyContext,
  CategoryStrategy
} from "./categoryResolver/pipeline";

import type { Metadata } from "./types.js";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const toTrimmedString = (value: unknown): string => (isString(value) ? value.trim() : "");

export const EMPTY_METADATA: Metadata = Object.freeze({
  title: "",
  channel: "",
  description: "",
  keywords: [],
  youtubeCategory: null
});

const normalizeKeywords = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map(toTrimmedString).filter(Boolean);
};

const normalizeCategory = (value: unknown): string | number | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
};

export function isVideoMetadata(value: unknown): value is Partial<Metadata> {
  if (!isObject(value)) return false;

  const { title, channel, description, keywords, youtubeCategory } = value;

  const stringsAreValid = [title, channel, description].every(
    (field) => field === undefined || isString(field)
  );

  const keywordsAreValid =
    keywords === undefined || (Array.isArray(keywords) && keywords.every(isString));

  const categoryIsValid =
    youtubeCategory === undefined ||
    youtubeCategory === null ||
    isString(youtubeCategory) ||
    typeof youtubeCategory === "number";

  return stringsAreValid && keywordsAreValid && categoryIsValid;
}

export function normalizeVideoMetadata(
  metadata: Partial<Metadata> = {},
  { fallbackTitle = "" }: { fallbackTitle?: string } = {}
): Metadata {
  const source = isObject(metadata) ? (metadata as Partial<Metadata>) : {};
  return {
    title: toTrimmedString(source.title) || toTrimmedString(fallbackTitle),
    channel: toTrimmedString(source.channel),
    description: toTrimmedString(source.description),
    keywords: normalizeKeywords(source.keywords),
    youtubeCategory: normalizeCategory(source.youtubeCategory)
  };
}

export function mergeMetadata(
  preferred: Partial<Metadata> = {},
  fallback: Partial<Metadata> = {}
): Metadata {
  const base = normalizeVideoMetadata(fallback);
  const prioritized = normalizeVideoMetadata(preferred);

  return {
    title: prioritized.title || base.title,
    channel: prioritized.channel || base.channel,
    description: prioritized.description || base.description,
    keywords: prioritized.keywords.length > 0 ? prioritized.keywords : base.keywords,
    youtubeCategory: prioritized.youtubeCategory ?? base.youtubeCategory ?? null
  };
}

export function hasMetadataContent(metadata: Partial<Metadata> = {}): boolean {
  const normalized = normalizeVideoMetadata(metadata);
  return Boolean(
    normalized.title ||
      normalized.channel ||
      normalized.description ||
      (normalized.keywords && normalized.keywords.length > 0) ||
      normalized.youtubeCategory !== null
  );
}

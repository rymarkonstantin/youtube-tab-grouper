import { mergeMetadata, normalizeVideoMetadata } from "../shared/metadataSchema";
import type { Metadata } from "../shared/types";
import { SELECTORS } from "./constants";

interface YtInitialData {
  contents?: {
    twoColumnWatchNextResults?: {
      results?: { results?: { contents?: unknown[] } };
    };
  };
}

declare global {
  interface Window {
    ytInitialData?: YtInitialData;
  }
}

const splitKeywords = (value: unknown = ""): string[] =>
  typeof value === "string" ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
const getDocumentTitle = () => document.title.replace("- YouTube", "").trim();

function readDomMetadata(): Partial<Metadata> {
  const title = document.querySelector<HTMLElement>(SELECTORS.title)?.innerText || "";

  const channel =
    document.querySelector<HTMLElement>(SELECTORS.channelName)?.innerText ||
    document.querySelector<HTMLElement>(SELECTORS.channelLink)?.innerText ||
    document.querySelector<HTMLElement>(SELECTORS.channelHandleLink)?.innerText ||
    "";

  const description = document.querySelector<HTMLMetaElement>(SELECTORS.descriptionMeta)?.content || "";

  const keywords = splitKeywords(document.querySelector<HTMLMetaElement>(SELECTORS.keywordsMeta)?.content || "");

  return {
    title,
    channel,
    description,
    keywords
  };
}

function extractJsonLdMetadata(): Partial<Metadata> {
  const script = document.querySelector<HTMLScriptElement>(SELECTORS.jsonLdScript);
  if (!script) return {};

  try {
    const data = JSON.parse(script.textContent || "{}") as { keywords?: unknown; description?: string };
    let keywords: string[] = [];
    if (Array.isArray(data.keywords)) {
      keywords = data.keywords.map((kw) => (typeof kw === "string" ? kw : String(kw))).filter(Boolean);
    } else {
      keywords = splitKeywords(data.keywords || "");
    }
    return {
      description: data.description,
      keywords
    };
  } catch (error) {
    console.warn("Failed to parse JSON-LD:", error);
    return {};
  }
}

function extractCategoryFromInitialData(): string | number | null {
  try {
    if (!window.ytInitialData) return null;
    const contents = window.ytInitialData?.contents?.twoColumnWatchNextResults?.results?.results?.contents;
    if (!Array.isArray(contents)) return null;

    for (const item of contents) {
      const categoryId = (item as { videoPrimaryInfoRenderer?: { categoryId?: string | number | null } })
        ?.videoPrimaryInfoRenderer?.categoryId;
      if (categoryId !== undefined && categoryId !== null) {
        return categoryId;
      }
    }
  } catch (error) {
    console.warn("Failed to extract YouTube category from ytInitialData:", error);
  }
  return null;
}

function extractCategoryFromMeta(): string | null {
  try {
    const genreMeta = document.querySelector<HTMLMetaElement>(SELECTORS.genreMeta);
    if (genreMeta?.content) {
      return genreMeta.content.trim();
    }
  } catch (error) {
    console.warn("Failed to extract category from meta tag:", error);
  }
  return null;
}

function detectYouTubeCategory(): string | number | null {
  return extractCategoryFromInitialData() ?? extractCategoryFromMeta();
}

/**
 * Extract basic metadata from the DOM.
 */
export function getVideoData(): Metadata {
  const base = readDomMetadata();
  return normalizeVideoMetadata(base, { fallbackTitle: getDocumentTitle() });
}

/**
 * Extract metadata from DOM + JSON-LD + meta tags, normalized.
 */
export function extractVideoMetadata(): Metadata {
  const base = getVideoData();
  const jsonLd = extractJsonLdMetadata();
  const youtubeCategory = detectYouTubeCategory();

  const merged = mergeMetadata({ ...jsonLd, youtubeCategory }, base);

  return normalizeVideoMetadata(merged, { fallbackTitle: base.title || getDocumentTitle() });
}

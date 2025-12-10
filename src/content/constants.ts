import type { Settings } from "../shared/types";
import { DEFAULT_SETTINGS } from "../shared/settings";

export const CONTENT_SETTINGS_DEFAULTS: Settings = {
  ...DEFAULT_SETTINGS
};

export const FALLBACK_GROUP = "Other";

export const SELECTORS = {
  title: "h1.title yt-formatted-string",
  channelName: "ytd-channel-name a",
  channelLink: "a.yt-simple-endpoint[href*='/channel/']",
  channelHandleLink: "a.yt-simple-endpoint[href*='/@']",
  descriptionMeta: "meta[name='description']",
  keywordsMeta: "meta[name='keywords']",
  jsonLdScript: 'script[type="application/ld+json"]',
  genreMeta: "meta[itemprop='genre']"
} as const;

export const BUTTON = {
  id: "yt-grouper-btn",
  label: "Group tab",
  title: "Group this tab (Ctrl+Shift+G)"
} as const;

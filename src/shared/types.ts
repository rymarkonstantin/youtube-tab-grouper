export interface Metadata {
  title: string;
  channel: string;
  description: string;
  keywords: string[];
  youtubeCategory: string | number | null;
}

export interface MessageEnvelope {
  action: string;
  version: number;
  requestId: string;
}

export interface GroupTabRequest {
  category?: string;
  metadata?: Metadata;
}

export interface GroupTabResponse {
  success: boolean;
  category?: string;
  color?: string;
  error?: string;
}

export interface SendMessageOptions {
  tabId?: number;
  timeoutMs?: number;
  requestId?: string;
  requireVersion?: boolean;
  validateResponsePayload?: boolean;
}

export interface HandleMessageOptions {
  requireVersion?: boolean;
  validateResponses?: boolean;
  onUnknown?: (action: string, msg: unknown, sender: unknown) => unknown;
}

export type ChannelCategoryMap = Record<string, string>;
export type CategoryKeywordsMap = Record<string, string[]>;

export interface Settings {
  autoGroupDelay: number;
  autoGroupDelayMs: number;
  autoCleanupGraceMs: number;
  allowedHashtags: string[];
  channelCategoryMap: ChannelCategoryMap;
  extensionEnabled: boolean;
  enabledColors: Record<string, boolean>;
  autoCleanupEnabled: boolean;
  aiCategoryDetection: boolean;
  categoryKeywords: CategoryKeywordsMap;
  debugLogging?: boolean;
  version?: number;
}

export interface GroupingStats {
  totalTabs: number;
  categoryCount: Record<string, number>;
  sessionsToday: number;
  lastReset: string;
  version?: number;
}

export interface GroupingState {
  groupColorMap: Record<string, string>;
  groupIdMap: Record<string, number>;
}

export type StoredSettings = Settings;
export type StoredStats = GroupingStats;

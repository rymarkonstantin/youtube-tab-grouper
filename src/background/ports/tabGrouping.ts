import type { GroupingState, GroupingStats, Metadata } from "../../shared/types";
import type { ResolveCategoryInput, ResolveCategoryNormalizationOptions } from "../../shared/categoryResolver";

/**
 * Ports required by TabGroupingService. Implementations should encapsulate side effects and persistence
 * concerns so the service can focus on orchestration.
 *
 * Expectations for consumers:
 * - Tabs passed into TabGroupingService methods must include both `id` and `windowId` so grouping
 *   operations can be executed safely.
 * - Chrome operations should reject on errors and return the latest tab/group data needed to keep
 *   group metadata in sync.
 * - Storage ports should persist values durably; caches should be kept consistent with saved values.
 * - Locking must serialize work per key to avoid race conditions when grouping the same category.
 */
export interface TabGroupingPorts {
  chrome: ChromeTabGroupingPort;
  metadata: MetadataFetcherPort;
  categoryResolver: CategoryResolverPort;
  colorAssigner: ColorAssignerPort;
  groupState: GroupStateCoordinatorPort;
  stats: StatsTrackerPort;
  lockManager: LockManagerPort;
  cleanupCoordinator: CleanupCoordinatorPort;
  defaultColors?: readonly string[];
}

export interface ChromeTabGroupingPort {
  queryTabs(query: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]>;
  queryGroups(query: chrome.tabGroups.QueryInfo): Promise<chrome.tabGroups.TabGroup[]>;
  getTabGroup(groupId: number): Promise<chrome.tabGroups.TabGroup>;
  groupTabs(tabIds: number | number[], groupId?: number): Promise<number>;
  updateTabGroup(groupId: number, props: chrome.tabGroups.UpdateProperties): Promise<chrome.tabGroups.TabGroup>;
  removeTabGroup(groupId: number): Promise<void>;
}

export type MetadataFetcherPort = (
  tabId: number,
  options?: {
    fallbackMetadata?: Partial<Metadata>;
    fallbackTitle?: string;
  } & Record<string, unknown>
) => Promise<Metadata>;

export interface CategoryResolverPort {
  resolve(input?: ResolveCategoryInput, normalizeOptions?: ResolveCategoryNormalizationOptions): string;
}

export interface ColorAssignerPort {
  assignColor(category: string, tabId: number, windowId: number, enabledColors?: string[]): Promise<string>;
  setCache(cache: Record<string, string>): void;
}

export interface GroupStateRepositoryPort {
  get(): Promise<GroupingState>;
  save(groupColorMap: Record<string, string>, groupIdMap: Record<string, number>): Promise<void>;
}

export interface GroupStateCoordinatorPort {
  initialize(): Promise<void>;
  persist(category: string, groupId: number, color: string): Promise<void>;
  pruneGroup(groupId: number): Promise<void>;
  applyGroupUpdate(group: chrome.tabGroups.TabGroup): Promise<void>;
}

export interface StatsRepositoryPort {
  get(): Promise<GroupingStats>;
  save(next: Partial<GroupingStats> | GroupingStats): Promise<GroupingStats>;
}

export interface StatsTrackerPort {
  recordGrouping(category: string): Promise<void>;
}

export interface LockManagerPort {
  runExclusive<T>(key: string, task: () => Promise<T>): Promise<T>;
}

export interface CleanupCoordinatorPort {
  markPending(groupId: number): number | undefined;
  clearPending(groupId: number): void;
  getTimestamp(groupId: number): number | undefined;
}

import type { GroupingState } from "../../shared/types";

const DEFAULT_STATE: GroupingState = {
  groupColorMap: {},
  groupIdMap: {}
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export class GroupStateRepository {
  private cache: GroupingState | null = null;

  async get(): Promise<GroupingState> {
    if (this.cache) return this.cache;

    const state = await new Promise<GroupingState>((resolve, reject) => {
      try {
        chrome.storage.local.get(DEFAULT_STATE, (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          const payload = isObject(result) ? result : DEFAULT_STATE;
          resolve({
            groupColorMap: (payload.groupColorMap as GroupingState["groupColorMap"]) || {},
            groupIdMap: (payload.groupIdMap as GroupingState["groupIdMap"]) || {}
          });
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });

    this.cache = {
      groupColorMap: { ...(state.groupColorMap || {}) },
      groupIdMap: { ...(state.groupIdMap || {}) }
    };
    return this.cache;
  }

  async save(groupColorMap: Record<string, string>, groupIdMap: Record<string, number>): Promise<void> {
    this.cache = {
      groupColorMap: { ...groupColorMap },
      groupIdMap: { ...groupIdMap }
    };
    await new Promise<void>((resolve, reject) => {
      try {
        chrome.storage.local.set({ groupColorMap, groupIdMap }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  clearCache() {
    this.cache = null;
  }
}

export const groupStateRepository = new GroupStateRepository();

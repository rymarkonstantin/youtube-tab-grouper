import type { GroupingState } from "../../shared/types";
import { toError } from "../../shared/utils/errorUtils";
import { writeChromeStorage } from "./repositoryUtils";

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

    // GroupStateRepository stores both keys at root level, not nested
    const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
      try {
        chrome.storage.local.get(DEFAULT_STATE, (data) => {
          if (chrome.runtime.lastError) {
            reject(toError(chrome.runtime.lastError.message, "storage.local.get"));
            return;
          }
          resolve(isObject(data) ? data : DEFAULT_STATE);
        });
      } catch (error) {
        reject(toError(error, "storage.local.get"));
      }
    });

    const payload = isObject(result) ? result : DEFAULT_STATE;
    const state: GroupingState = {
      groupColorMap: (payload.groupColorMap as GroupingState["groupColorMap"]) || {},
      groupIdMap: (payload.groupIdMap as GroupingState["groupIdMap"]) || {}
    };

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
    await writeChromeStorage("local", { groupColorMap, groupIdMap });
  }

  clearCache() {
    this.cache = null;
  }
}

export const groupStateRepository = new GroupStateRepository();

import { toErrorEnvelope, toErrorMessage } from "../../shared/utils/errorUtils";
import { logError } from "../logger";

type ChromePromise<T> = Promise<T>;

export class ChromeApiClient {
  async queryTabs(query: chrome.tabs.QueryInfo): ChromePromise<chrome.tabs.Tab[]> {
    const context = "tabs.query";
    return new Promise((resolve, reject) => {
      try {
        chrome.tabs.query(query, (tabs) => {
          if (chrome.runtime.lastError) {
            const wrapped = this.normalizeChromeError(context, chrome.runtime.lastError);
            reject(wrapped);
            return;
          }
          resolve(tabs);
        });
      } catch (error) {
        reject(this.wrapUnknown(context, error));
      }
    });
  }

  async queryGroups(query: chrome.tabGroups.QueryInfo): ChromePromise<chrome.tabGroups.TabGroup[]> {
    const context = "tabGroups.query";
    return new Promise((resolve, reject) => {
      try {
        chrome.tabGroups.query(query, (groups) => {
          if (chrome.runtime.lastError) {
            const wrapped = this.normalizeChromeError(context, chrome.runtime.lastError);
            reject(wrapped);
            return;
          }
          resolve(groups);
        });
      } catch (error) {
        reject(this.wrapUnknown(context, error));
      }
    });
  }

  async getTabGroup(groupId: number): ChromePromise<chrome.tabGroups.TabGroup> {
    const context = "tabGroups.get";
    return new Promise((resolve, reject) => {
      try {
        chrome.tabGroups.get(groupId, (group) => {
          if (chrome.runtime.lastError) {
            const wrapped = this.normalizeChromeError(context, chrome.runtime.lastError);
            reject(wrapped);
            return;
          }
          resolve(group);
        });
      } catch (error) {
        reject(this.wrapUnknown(context, error));
      }
    });
  }

  async groupTabs(tabIds: number | number[], groupId?: number): ChromePromise<number> {
    const context = "tabs.group";
    return new Promise((resolve, reject) => {
      try {
        chrome.tabs.group({ tabIds, groupId }, (result) => {
          if (chrome.runtime.lastError) {
            const wrapped = this.normalizeChromeError(context, chrome.runtime.lastError);
            reject(wrapped);
            return;
          }
          resolve(result);
        });
      } catch (error) {
        reject(this.wrapUnknown(context, error));
      }
    });
  }

  async updateTabGroup(
    groupId: number,
    props: chrome.tabGroups.UpdateProperties
  ): ChromePromise<chrome.tabGroups.TabGroup> {
    const context = "tabGroups.update";
    return new Promise((resolve, reject) => {
      try {
        chrome.tabGroups.update(groupId, props, (group) => {
          if (chrome.runtime.lastError) {
            const wrapped = this.normalizeChromeError(context, chrome.runtime.lastError);
            reject(wrapped);
            return;
          }
          resolve(group);
        });
      } catch (error) {
        reject(this.wrapUnknown(context, error));
      }
    });
  }

  async removeTabGroup(groupId: number): ChromePromise<void> {
    const context = "tabs.remove";
    const tabs = await this.queryTabs({ groupId });
    const tabIds = tabs.map((t) => t.id).filter((id): id is number => typeof id === "number");
    if (tabIds.length === 0) return;

    return new Promise<void>((resolve, reject) => {
      try {
        chrome.tabs.remove(tabIds, () => {
          if (chrome.runtime.lastError) {
            const wrapped = this.normalizeChromeError(context, chrome.runtime.lastError);
            reject(wrapped);
            return;
          }
          resolve();
        });
      } catch (error) {
        reject(this.wrapUnknown(context, error));
      }
    });
  }

  private normalizeChromeError(context: string, runtimeError: chrome.runtime.LastError) {
    const wrapped = toErrorEnvelope(runtimeError?.message || "Unknown Chrome runtime error", {
      message: `${context} failed`,
      domain: "tabs",
      details: { context }
    });
    logError(wrapped.message);
    return wrapped;
  }

  private wrapUnknown(context: string, error: unknown) {
    const message = toErrorMessage(error, context);
    const wrapped = toErrorEnvelope(error, { message, domain: "runtime", details: { context } });
    logError(message);
    return wrapped;
  }
}

export const chromeApiClient = new ChromeApiClient();

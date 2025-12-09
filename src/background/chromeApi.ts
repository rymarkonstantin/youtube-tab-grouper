import { logError, toErrorEnvelope } from "./logger";

function normalizeChromeError(context: string, runtimeError: chrome.runtime.LastError) {
  const message = runtimeError?.message || "Unknown Chrome runtime error";
  const error = new Error(`${context}: ${message}`);
  return toErrorEnvelope(error, error.message);
}

function handleCatch(context: string, reject: (reason?: unknown) => void) {
  return (error: unknown) => {
    const wrapped = toErrorEnvelope(error, `${context} failed`);
    logError(`${context} failed`, wrapped.message);
    reject(wrapped);
  };
}

export function queryTabs(query: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
  const context = "tabs.query";
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.query(query, (tabs) => {
        if (chrome.runtime.lastError) {
          const error = normalizeChromeError(context, chrome.runtime.lastError);
          logError(`${context} failed`, error.message);
          reject(error);
        } else {
          resolve(tabs);
        }
      });
    } catch (error) {
      handleCatch(context, reject)(error);
    }
  });
}

export function queryGroups(query: chrome.tabGroups.QueryInfo): Promise<chrome.tabGroups.TabGroup[]> {
  const context = "tabGroups.query";
  return new Promise((resolve, reject) => {
    try {
      chrome.tabGroups.query(query, (groups) => {
        if (chrome.runtime.lastError) {
          const error = normalizeChromeError(context, chrome.runtime.lastError);
          logError(`${context} failed`, error.message);
          reject(error);
        } else {
          resolve(groups);
        }
      });
    } catch (error) {
      handleCatch(context, reject)(error);
    }
  });
}

export function getTabGroup(groupId: number): Promise<chrome.tabGroups.TabGroup> {
  const context = "tabGroups.get";
  return new Promise((resolve, reject) => {
    try {
      chrome.tabGroups.get(groupId, (group) => {
        if (chrome.runtime.lastError) {
          const error = normalizeChromeError(context, chrome.runtime.lastError);
          logError(`${context} failed`, error.message);
          reject(error);
        } else {
          resolve(group);
        }
      });
    } catch (error) {
      handleCatch(context, reject)(error);
    }
  });
}

export function groupTabs(tabIds: number | number[], groupId?: number): Promise<number> {
  const context = "tabs.group";
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.group({ tabIds, groupId }, (result) => {
        if (chrome.runtime.lastError) {
          const error = normalizeChromeError(context, chrome.runtime.lastError);
          logError(`${context} failed`, error.message);
          reject(error);
        } else {
          resolve(result);
        }
      });
    } catch (error) {
      handleCatch(context, reject)(error);
    }
  });
}

export function updateTabGroup(
  groupId: number,
  props: chrome.tabGroups.UpdateProperties
): Promise<chrome.tabGroups.TabGroup> {
  const context = "tabGroups.update";
  return new Promise((resolve, reject) => {
    try {
      chrome.tabGroups.update(groupId, props, (group) => {
        if (chrome.runtime.lastError) {
          const error = normalizeChromeError(context, chrome.runtime.lastError);
          logError(`${context} failed`, error.message);
          reject(error);
        } else {
          resolve(group);
        }
      });
    } catch (error) {
      handleCatch(context, reject)(error);
    }
  });
}

export function removeTabGroup(groupId: number): Promise<void> {
  const context = "tabs.remove";
  return queryTabs({ groupId }).then((tabs) => {
    const tabIds = tabs.map((t) => t.id).filter((id): id is number => typeof id === "number");
    if (tabIds.length === 0) return;

    return new Promise<void>((resolve, reject) => {
      try {
        chrome.tabs.remove(tabIds, () => {
          if (chrome.runtime.lastError) {
            const error = normalizeChromeError(context, chrome.runtime.lastError);
            logError(`${context} failed`, error.message);
            reject(error);
          } else {
            resolve();
          }
        });
      } catch (error) {
        handleCatch(context, reject)(error);
      }
    });
  });
}

import { logError, toErrorEnvelope } from './logger.js';

function normalizeChromeError(context, runtimeError) {
    const message = runtimeError?.message || "Unknown Chrome runtime error";
    const error = new Error(`${context}: ${message}`);
    return toErrorEnvelope(error, error.message);
}

function handleCatch(context, reject) {
    return (error) => {
        const wrapped = toErrorEnvelope(error, `${context} failed`);
        logError(`${context} failed`, wrapped.message);
        reject(wrapped);
    };
}

export function queryTabs(query) {
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

export function queryGroups(query) {
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

export function getTabGroup(groupId) {
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

export function groupTabs(tabIds, groupId) {
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

export function updateTabGroup(groupId, props) {
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

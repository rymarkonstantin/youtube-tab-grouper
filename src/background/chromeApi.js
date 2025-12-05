export function queryTabs(query) {
    return new Promise((resolve, reject) => {
        try {
            chrome.tabs.query(query, (tabs) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(tabs);
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}

export function queryGroups(query) {
    return new Promise((resolve, reject) => {
        try {
            chrome.tabGroups.query(query, (groups) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(groups);
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}

export function getTabGroup(groupId) {
    return new Promise((resolve, reject) => {
        try {
            chrome.tabGroups.get(groupId, (group) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(group);
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}

export function groupTabs(tabIds, groupId) {
    return new Promise((resolve, reject) => {
        try {
            chrome.tabs.group({ tabIds, groupId }, (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(result);
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}

export function updateTabGroup(groupId, props) {
    return new Promise((resolve, reject) => {
        try {
            chrome.tabGroups.update(groupId, props, (group) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(group);
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}

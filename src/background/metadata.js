export async function getVideoMetadata(tabId) {
    return new Promise((resolve) => {
        try {
            chrome.tabs.sendMessage(
                tabId,
                { action: "getVideoMetadata" },
                (response) => {
                    if (chrome.runtime.lastError) {
                        resolve({
                            title: "",
                            channel: "",
                            description: "",
                            keywords: [],
                            youtubeCategory: null
                        });
                    } else {
                        resolve(response || {});
                    }
                }
            );
        } catch (error) {
            resolve({
                title: "",
                channel: "",
                description: "",
                keywords: [],
                youtubeCategory: null
            });
        }
    });
}

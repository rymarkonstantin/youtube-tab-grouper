(function () {
    'use strict';

    const FALLBACK_GROUP = "Other";
    let config = null;  // Will load from storage

    /**
     * Load settings from chrome.storage.sync
     */
    async function loadConfig() {
        return new Promise(resolve => {
            chrome.storage.sync.get({
                autoGroupDelay: 2500,
                allowedHashtags: ['tech', 'music', 'gaming', 'cooking', 'sports', 'education', 'news'],
                channelCategoryMap: {},
                extensionEnabled: true
            }, (settings) => {
                config = settings;
                console.log("Config loaded:", config);
                resolve();
            });
        });
    }

    // -------- EXTRACT VIDEO DATA --------
    function getVideoData() {
        const title =
            document.querySelector("h1.title")?.innerText ||
            document.title.replace("- YouTube", "").trim();

        const hashtags = [...document.querySelectorAll("a[href^='/hashtag/']")]
            .map(a => a.innerText.trim());

        const channelName = document.querySelector("ytd-channel-name a")?.innerText?.trim() || "";

        const categoryMeta = document.querySelector("meta[itemprop='genre']")?.content?.trim() || "";

        return { title, hashtags, channelName, categoryMeta };
    }

    // -------- HYBRID CATEGORY DETECTION --------
    async function getCategory(video) {
        // Check if extension is enabled
        if (!config?.extensionEnabled) return null;

        // 1. Channel Mapping (highest priority)
        if (config.channelCategoryMap[video.channel]) {
            return { name: config.channelCategoryMap[video.channel], source: "channel" };
        }

        // 2. Hashtags (dynamic whitelist from config)
        if (video.hashtags?.length > 0) {
            const validHashtag = video.hashtags.find(h =>
                config.allowedHashtags.includes(h.toLowerCase())
            );
            if (validHashtag) {
                return { name: validHashtag, source: "hashtag" };
            }
        }

        // 3. Genre metadata
        if (video.genre) {
            return { name: video.genre, source: "genre" };
        }

        // 4. Channel name
        if (video.channel) {
            return { name: video.channel, source: "channel_name" };
        }

        // 5. Title keywords
        if (video.title) {
            const firstWord = video.title.split(/[\s-]/)[0];
            if (firstWord && firstWord.length > 2) {
                return { name: firstWord, source: "title" };
            }
        }

        return { name: FALLBACK_GROUP, source: "fallback" };
    }

    // -------- CREATE UI --------
    function createUI() {
        const container = document.createElement("div");
        container.style = `
            position: fixed;
            top: 20px;
            left: 20px;
            background: rgba(0,0,0,0.7);
            color: #fff;
            padding: 10px;
            border-radius: 8px;
            z-index: 99999;
            font-size: 14px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            user-select: none;
        `;

        const groupButton = document.createElement("button");
        groupButton.textContent = "Group Now";
        Object.assign(groupButton.style, buttonStyle());
        container.append(groupButton);
        document.body.appendChild(container);

        // Hide button if current tab is already grouped
        chrome.runtime.sendMessage({ action: "isTabGrouped" }, (response) => {
            try {
                if (response?.grouped) {
                    groupButton.style.display = "none";
                }
            } catch (e) { }
        });

        groupButton.onclick = () => {
            const video = getVideoData();
            const categoryMeta = getCategory(video);
            const groupName = normalizeGroupName(categoryMeta.name);
            console.log("[Group Now] categoryMeta:", categoryMeta, "groupName:", groupName);
            chrome.runtime.sendMessage({ action: "groupTab", category: groupName });
            groupButton.style.display = "none"; // hide after grouping
        };
    }

    function buttonStyle() {
        return {
            padding: "6px 10px",
            borderRadius: "6px",
            border: "none",
            background: "#4285F4",
            color: "#fff",
            cursor: "pointer",
            fontSize: "13px"
        };
    }

    // -------- MAIN EXECUTION --------
    (async () => {
        await loadConfig();
        createUI();

        // Auto-group with configurable delay
        if (config.autoGroupDelay > 0) {
            setTimeout(async () => {
                const video = getVideoData();
                if (video) {
                    const category = await getCategory(video);
                    if (category) {
                        chrome.runtime.sendMessage({
                            action: "groupTab",
                            category: category.name
                        });
                    }
                }
            }, config.autoGroupDelay);
        }
    })();

})();

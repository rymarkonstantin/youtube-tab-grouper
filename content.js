(function () {
    'use strict';

    const FALLBACK_GROUP = "Other";

    const ALLOWED_HASHTAGS = [
        "tech",
        "music",
        "gaming",
        "cooking",
        "sports",
        "education",
        "news"
        // add more allowed hashtags here
    ];
    const ALLOWED_HASHTAGS_LOWER = ALLOWED_HASHTAGS.map(h => h.toLowerCase());

    // Predefined mapping: category -> array of channels
    const CHANNEL_CATEGORY_MAP = {
        "Fishing": ["Chanel1", "Chanel2"],
        "Gaming": ["Chanel3", "Chanel4"]
        // add more categories and channels here
    };

    //----------------------------------------------------
    //  SMALL FLOATING UI BUTTONS
    //----------------------------------------------------
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

    //----------------------------------------------------
    //  EXTRACT VIDEO DATA
    //----------------------------------------------------
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

    //----------------------------------------------------
    //  NORMALIZE / FORMAT GROUP NAME
    //----------------------------------------------------
    function normalizeGroupName(name) {
        if (!name || typeof name !== "string") return FALLBACK_GROUP;
        const trimmed = name.trim().replace(/\s+/g, ' ');
        const words = trimmed.split(' ');
        const titled = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        return titled || FALLBACK_GROUP;
    }

    //----------------------------------------------------
    //  HYBRID CATEGORY DETECTION
    //----------------------------------------------------
    function getCategory(video) {
        console.log("[getCategory] video.raw:", video);

        // 0️⃣ Check channel map first
        const channelLower = (video.channelName || "").toLowerCase();
        for (const [category, channels] of Object.entries(CHANNEL_CATEGORY_MAP)) {
            if (channels.some(ch => ch.toLowerCase() === channelLower)) {
                console.log("[getCategory] channel map hit:", category);
                return { name: category, source: "channel-map" };
            }
        }

        // 1️⃣ Check hashtags
        const normalizedHashtags = (video.hashtags || []).map(ht =>
            ht.toLowerCase().replace(/^#+/, '').trim()
        ).filter(Boolean);
        console.log("[getCategory] normalizedHashtags:", normalizedHashtags);

        const validHashtag = normalizedHashtags.find(ht =>
            /^[a-z0-9]+$/.test(ht) && ALLOWED_HASHTAGS_LOWER.includes(ht)
        );
        if (validHashtag) {
            console.log("[getCategory] validHashtag:", validHashtag);
            return { name: validHashtag, source: "hashtag" };
        }

        // 2️⃣ YouTube category meta
        if (video.categoryMeta && video.categoryMeta.trim()) {
            console.log("[getCategory] using categoryMeta:", video.categoryMeta);
            return { name: video.categoryMeta.trim(), source: "category" };
        }

        // 3️⃣ Channel name
        if (video.channelName && video.channelName.trim()) {
            console.log("[getCategory] using channelName:", video.channelName);
            return { name: video.channelName.trim(), source: "channel" };
        }

        // 4️⃣ Fallback to title keyword
        if (video.title && video.title.trim()) {
            const words = video.title.split(/\s+/)
                .map(w => w.replace(/[^a-z0-9]/gi,''))
                .filter(w => /^[a-z0-9]{3,}$/i.test(w));
            if (words.length > 0) return { name: words[0].toLowerCase(), source: "title" };
        }

        // 5️⃣ Final fallback
        return { name: FALLBACK_GROUP, source: "fallback" };
    }

    //----------------------------------------------------
    //  MAIN EXECUTION
    //----------------------------------------------------
    createUI();

    // Auto-group after 2.5s
    setTimeout(() => {
        const video = getVideoData();
        if (!video.title) return;
        const categoryMeta = getCategory(video);
        const groupName = normalizeGroupName(categoryMeta.name);
        console.log("[auto-group] categoryMeta:", categoryMeta, "groupName:", groupName);
        chrome.runtime.sendMessage({ action: "groupTab", category: groupName });
    }, 2500);

})();

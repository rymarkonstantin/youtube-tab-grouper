export const AVAILABLE_COLORS = [
    "grey", "blue", "red", "yellow",
    "green", "pink", "purple", "cyan"
];

export const CATEGORY_KEYWORDS = {
    "Gaming": ["gameplay", "gaming", "twitch", "esports", "fps", "rpg", "speedrun", "fortnite", "minecraft"],
    "Music": ["music", "song", "album", "artist", "concert", "cover", "remix", "lyrics"],
    "Tech": ["tech", "gadget", "review", "iphone", "laptop", "cpu", "gpu", "software", "coding"],
    "Cooking": ["recipe", "cooking", "food", "kitchen", "chef", "baking", "meal", "cuisine"],
    "Fitness": ["workout", "gym", "exercise", "fitness", "yoga", "training", "diet", "health"],
    "Education": ["tutorial", "course", "learn", "how to", "guide", "lesson", "education"],
    "News": ["news", "breaking", "current events", "politics", "world", "daily"],
    "Entertainment": ["movie", "series", "trailer", "reaction", "comedy", "funny", "meme"]
};

export const DEFAULT_SETTINGS = {
    autoGroupDelay: 2500,
    allowedHashtags: ['tech', 'music', 'gaming', 'cooking', 'sports', 'education', 'news'],
    channelCategoryMap: {},
    extensionEnabled: true,
    enabledColors: AVAILABLE_COLORS.reduce((obj, color) => {
        obj[color] = true;
        return obj;
    }, {}),
    autoCleanupEnabled: true,
    aiCategoryDetection: true,
    categoryKeywords: CATEGORY_KEYWORDS
};

export const DEFAULT_STATS = {
    totalTabs: 0,
    categoryCount: {},
    sessionsToday: 0,
    lastReset: new Date().toDateString()
};

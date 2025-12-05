import { DEFAULT_SETTINGS } from './constants.js';

export function predictCategory(metadata, aiEnabled, categoryKeywords = DEFAULT_SETTINGS.categoryKeywords, channelMap = {}) {
    if (metadata.channel && channelMap[metadata.channel]) {
        return channelMap[metadata.channel];
    }

    if (!aiEnabled) {
        return "Other";
    }

    const scores = {};
    const text = `${metadata.title} ${metadata.description} ${(metadata.keywords || []).join(' ')}`.toLowerCase();

    Object.entries(categoryKeywords || {}).forEach(([category, keywords]) => {
        const score = keywords.reduce((sum, keyword) => {
            const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
            return sum + (text.match(regex) || []).length;
        }, 0);
        if (score > 0) {
            scores[category] = score;
        }
    });

    const topCategory = Object.entries(scores).sort(([, a], [, b]) => b - a)[0];
    if (topCategory && topCategory[1] > 0) {
        return topCategory[0];
    }

    if (metadata.youtubeCategory) {
        return mapYouTubeCategory(metadata.youtubeCategory);
    }

    return "Other";
}

export function mapYouTubeCategory(youtubeCategory) {
    if (!youtubeCategory) return "Other";

    const categoryMap = {
        "Music": "Music",
        "Gaming": "Gaming",
        "Entertainment": "Entertainment",
        "Sports": "Fitness",
        "News & Politics": "News",
        "Education": "Education",
        "Tech": "Tech",
        "Cooking": "Cooking",
        "Howto & Style": "Education",
        "Travel & Events": "Entertainment",
        "People & Blogs": "Entertainment",
        "Comedy": "Entertainment",
        "Film & Animation": "Entertainment",
        "Autos": "Tech",
        "Pets & Animals": "Entertainment",
        "Nonprofits & Activism": "News"
    };

    return categoryMap[youtubeCategory] || "Other";
}

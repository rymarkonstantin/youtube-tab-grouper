# YouTube Tab Grouper - Architecture

This document explains the system design and how components interact.

---

## System Overview

- **Service worker** (`src/background/index.js`): coordinates grouping, color assignment, messaging, and cleanup jobs.
- **Content script** (`src/content.js`): injected on YouTube watch pages to read metadata, render the floating button, and trigger grouping.
- **UI pages** (`ui/popup`, `ui/options`, `ui/stats`): popup controls, settings, and stats dashboard.
- **Storage**: `chrome.storage.sync` for user settings, `chrome.storage.local` for runtime data such as groups, colors, and statistics.
- **Chrome features**: uses `tabs`, `tabGroups`, `storage`, `contextMenus`, and keyboard `commands`.

---

## Component Breakdown

### 1. Service Worker (`background/index.js`)
- **Purpose**: core orchestration.
- **Responsibilities**: handle grouping requests, assign colors, predict categories, manage storage, process context menu clicks, and commands.
- **Key functions**: `groupTab`, `batchGroupAllTabs`, `getColorForGroup`, `predictCategory`, `autoCleanupEmptyGroups`.
- **Storage**: reads/writes settings, group color map, group IDs, and statistics.

### 2. Content Script (`content.js`)
- **Purpose**: page integration on YouTube.
- **Responsibilities**: build the floating "Group" button, extract video metadata (title, channel, description, keywords), trigger auto-group after delay, and communicate with the service worker.
- **Key functions**: `getVideoData`, `extractVideoMetadata`, `createUI`, `initialize`.

### 3. Popup (`ui/popup/popup.js`)
- **Purpose**: quick actions from the toolbar.
- **Responsibilities**: group current tab, batch group all YouTube tabs, display status messages, and link to settings/stats.

### 4. Options Page (`ui/options/options.js`)
- **Purpose**: manage configuration.
- **Responsibilities**: load/save settings, manage hashtag whitelist, color preferences, category keywords, channel mappings, and import/export.

### 5. Statistics (`ui/stats/stats.js`)
- **Purpose**: show usage analytics.
- **Responsibilities**: read stored stats, render simple charts, and support reset.

---

## Message Flow

### Manual Grouping
1. User clicks "Group Current Tab" in the popup.
2. Popup sends `{ action: "groupTab", category }` to the service worker.
3. Service worker gets the active tab, resolves category (channel map -> AI -> fallback), assigns a color, and groups the tab.
4. Result `{ success, category, color }` is returned to the popup for display.

### Auto Grouping
1. Content script loads on a YouTube video and reads settings.
2. It renders the floating button and schedules an auto-group timer (respecting `autoGroupDelay`).
3. When triggered, it sends `{ action: "groupTab", category: "", metadata }` to the service worker.
4. Service worker groups the tab and responds; the button is removed after success.

---

## Color Assignment Algorithm

1. Check cache: if category already has a color, return it.
2. If assignment is locked, wait until the lock clears.
3. Collect neighbor colors from existing tab groups in the window.
4. Filter enabled colors that are not used by neighbors.
5. Choose a random available color (fallback to any enabled color if empty).
6. Cache the assignment and return the color.

---

## Category Detection Algorithm

1. If AI detection is disabled, return `Other`.
2. Combine text sources: title, description, keywords, and optional YouTube category metadata.
3. Score each category by counting keyword matches.
4. Pick the highest score (ties broken by order) and return that category, otherwise `Other`.

---

## Storage Schema

### `chrome.storage.sync` (user settings)
```javascript
{
  autoGroupDelay: 2500,
  allowedHashtags: ["tech", "music", ...],
  channelCategoryMap: { "MKBHD": "Tech", "Gordon Ramsay": "Cooking" },
  extensionEnabled: true,
  aiCategoryDetection: true,
  autoCleanupEnabled: true,
  enabledColors: { grey: true, blue: true, red: true, ... },
  categoryKeywords: { Tech: ["tech", "gadget", ...], ... }
}
```

### `chrome.storage.local` (runtime data)
```javascript
// Category -> color
{ "Tech": "blue", "Music": "red", "Gaming": "green" }

// Category -> group ID
{ "Tech": 42, "Music": 43, "Gaming": 44 }

// Usage statistics
{
  totalTabs: 150,
  categoryCount: { "Tech": 45, "Music": 30, "Gaming": 25, "Other": 50 },
  sessionsToday: 8,
  lastReset: "2024-01-15"
}
```

---

## API Interfaces

### Background responses sent to content script
```javascript
chrome.tabs.sendMessage(tabId, {
  action: "groupTab",
  category: "Tech" // optional override
});
// Response: { success: true, category: "Tech", color: "blue" }
```

### Content script requests sent to background
```javascript
chrome.runtime.sendMessage({
  action: "groupTab",
  category: "" // allow AI detection
});
// Response: { success: true, category: "Gaming", color: "green" }
```

---

## Performance Considerations

- Run grouping/color lookups in parallel where possible.
- Cache colors and group IDs to avoid recomputing.
- Lazy load statistics only when the stats page is opened.
- Auto-cleanup runs on an interval; avoid extra timers.
- Keep storage payloads small (<5MB total).

---

## Security Considerations

- Permissions: `tabs`, `tabGroups`, `storage`, `contextMenus`, and `scripting` are required for grouping and UI injection.
- No external network calls; all processing stays local.
- User data is stored only in Chrome storage (sync and local).

---

## Testing Strategy

- Future unit tests: `groupTab`, `predictCategory`, `getColorForGroup`, `getVideoData`, `createUI`.
- Future integration tests: full grouping flow, settings persistence, stats tracking, and color assignment conflicts.

---

## Scalability Roadmap

- Phase 1: YouTube-only, predefined categories, single browser profile.
- Phase 2: Add other platforms, custom categories, multi-device sync.
- Phase 3: Cross-browser support and smarter ML-driven categorization.

---

## Related Files

- README.md — user documentation
- CONTRIBUTING.md — development guide
- CHANGELOG.md — version history

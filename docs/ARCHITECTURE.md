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
3. Service worker gets the active tab, resolves category (channel map -> override -> keywords -> YouTube category -> fallback), assigns a color, and groups the tab.
4. Result `{ success, category, color }` is returned to the popup for display.

### Auto Grouping
1. Content script loads on a YouTube video and reads settings.
2. It renders the floating button and schedules an auto-group timer (respecting `autoGroupDelay`).
3. When triggered, it sends `{ action: "groupTab", category: "", metadata }` to the service worker.
4. Service worker groups the tab and responds; the button is removed after success.

Refer to `src/shared/messages.js` and `docs/MESSAGES.md` for the full message catalog, schemas, and response helpers.

---

## Color Assignment Algorithm

1. Require at least one enabled color (otherwise error).
2. Per-category mutex serializes assignment to avoid races.
3. Check cache: if category already has a color, return it.
4. Collect neighbor colors from existing tab groups in the window.
5. Filter enabled colors that are not used by neighbors.
6. Choose a random available color (fallback to any enabled color if empty) and cache it.

---

## Category Detection Algorithm

- Deterministic priority (shared by popup/manual/content auto-group/context menus/batch):
  1. Channel mapping (user-defined map by channel name)
  2. Supplied override (e.g., explicit category passed in a message)
  3. Keyword scoring (respecting `aiCategoryDetection`; title + description + keywords)
  4. YouTube category mapping (when provided by the page)
  5. Fallback to `Other`

---

## Storage Schema

### SettingsV1 (`chrome.storage.sync`)
- Purpose: user preferences shared across devices.
- Defaults: `src/background/constants.js#DEFAULT_SETTINGS` (mirrored in `src/content.js` and `ui/options/options.js`).
- Persisted fields:
  - `autoGroupDelay` (number, ms) default `2500`.
  - `autoCleanupGraceMs` (number, ms) default `300000` (delay before removing empty groups).
  - `allowedHashtags` (string[]) default `['tech','music','gaming','cooking','sports','education','news']`.
  - `channelCategoryMap` (record<channel, category>) default `{}`.
  - `extensionEnabled` (boolean) default `true`.
  - `aiCategoryDetection` (boolean) default `true`.
  - `autoCleanupEnabled` (boolean) default `true`.
  - `enabledColors` (record<color, boolean>) default all `AVAILABLE_COLORS` set to `true`.
  - `categoryKeywords` (record<category, string[]>) default `CATEGORY_KEYWORDS`.
- Derived/non-persisted: the enabled color list is derived per request via `getEnabledColors`; UI-only text states and timers are not stored.
- Versioning rules:
  - V1 has no explicit version field; shape is defined by `DEFAULT_SETTINGS`.
  - Additive changes must include defaults in `DEFAULT_SETTINGS`, inline content defaults, and options UI fallbacks.
  - Breaking changes require a new version key (e.g., `settingsVersion`) and a migration path in `runMigrations`.

### StatsV1 (`chrome.storage.local`)
- Purpose: usage counters; stays local to the profile.
- Defaults: `src/background/constants.js#DEFAULT_STATS`.
- Persisted fields:
  - `totalTabs` (number) default `0`.
  - `categoryCount` (record<category, number>) default `{}`.
  - `sessionsToday` (number) default `0` (reserved for future use).
  - `lastReset` (string, `Date#toDateString`) default `new Date().toDateString()`.
- Derived/non-persisted: top category and chart percentages are computed in `ui/stats/stats.js` from the stored counts.
- Versioning rules:
  - V1 has no explicit version field; shape is defined by `DEFAULT_STATS`.
  - Additive counters or metadata must ship with defaults in `DEFAULT_STATS` and be handled by `ui/stats` reset logic.
  - Breaking changes should introduce a new version key (e.g., `statsVersion`) plus a migration/reset strategy.

### Local runtime maps (`chrome.storage.local`)
- `groupColorMap` and `groupIdMap` store category -> color/id mappings for tab groups. Loaded via `loadState` and saved via `saveState`; pruned by cleanup handlers. These are legacy, stored alongside StatsV1 but not part of that schema.

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

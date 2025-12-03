# YouTube Tab Grouper - Architecture

This document explains the system design and how components interact.

---

## 🏗️ System Overview

```
┌─────────────────────────────────────────────────────┐
│              CHROME BROWSER                          │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────────┐         ┌──────────────────┐  │
│  │ BACKGROUND.JS    │◄────────┤ CONTENT.JS       │  │
│  │ (Service Worker) │         │ (Page Injection) │  │
│  │                  │         │                  │  │
│  │ • Tab grouping   │         │ • UI button      │  │
│  │ • Color assign   │         │ • Auto-group     │  │
│  │ • Messaging      │         │ • Data extract   │  │
│  │ • Statistics     │         │                  │  │
│  └────────┬─────────┘         └──────────────────┘  │
│           │                                          │
│  ┌────────┴──────────────────────────────────────┐  │
│  │ STORAGE (chrome.storage.*)                    │  │
│  │ • sync: Settings (user config)                │  │
│  │ • local: Groups, Colors, Stats                │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ UI PAGES (popup, options, stats)             │   │
│  │ • popup/popup.html - Extension popup         │   │
│  │ • options/options.html - Settings page       │   │
│  │ • stats/stats.html - Statistics dashboard    │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## 📊 Component Breakdown

### 1. **Service Worker (background.js)**

**Purpose**: Core extension logic

**Responsibilities**:
- Handle tab grouping requests
- Assign colors intelligently
- Predict categories using AI keywords
- Manage storage and state
- Process messages from content script
- Handle context menu clicks
- Execute keyboard shortcuts

**Key Functions**:
- `groupTab()` - Group single tab
- `batchGroupAllTabs()` - Group all YouTube tabs
- `getColorForGroup()` - Assign color
- `predictCategory()` - AI category detection
- `autoCleanupEmptyGroups()` - Remove empty groups

**Storage Used**:
- `chrome.storage.sync`: User settings
- `chrome.storage.local`: Group mappings, colors, stats

---

### 2. **Content Script (content.js)**

**Purpose**: Inject functionality into YouTube pages

**Responsibilities**:
- Create floating "Group" button
- Extract video metadata
- Auto-group after delay
- Communicate with background script

**Key Functions**:
- `getVideoData()` - Extract title, channel, description
- `createUI()` - Create floating button
- `initialize()` - Setup on page load

**Triggers**:
- Page load → Load config → Create UI
- Button click → Send grouping request
- Auto-delay timeout → Auto-group

---

### 3. **Popup (ui/popup/popup.js)**

**Purpose**: Quick access from extension icon

**Responsibilities**:
- Provide quick grouping buttons
- Show status messages
- Link to settings/stats

**Interactions**:
- Click "Group" button → Send message to background
- Click "Batch" button → Send batch message
- Click settings icon → Open options page

---

### 4. **Options Page (ui/options/options.js)**

**Purpose**: Settings management

**Responsibilities**:
- Load/save settings
- Provide UI for configuration
- Handle import/export
- Manage channel mappings

**Settings Stored**:
- Extension enabled/disabled
- Auto-group delay
- Enabled colors
- Channel mappings
- Hashtag whitelist
- AI detection toggle

---

### 5. **Statistics (ui/stats/stats.js)**

**Purpose**: Analytics dashboard

**Responsibilities**:
- Load and display stats
- Render chart visualization
- Allow stats reset

**Data Tracked**:
- Total grouped tabs
- Count by category
- Category breakdown

---

## 🔄 Message Flow

### Manual Grouping Flow

```
User clicks "Group" button (popup.html)
        │
        ▼
popup.js sends message to background
    { action: "groupTab", category: "" }
        │
        ▼
background.js receives message
        │
        ├─► Get active tab
        ├─► Predict category (if empty)
        ├─► Assign color
        ├─► Find/create group
        ├─► Add tab to group
        ├─► Save state
        └─► Update stats
        │
        ▼
Send response back to popup
    { success: true, category: "Tech", color: "blue" }
        │
        ▼
popup.js displays success message
```

---

### Auto-Grouping Flow

```
User opens YouTube video
        │
        ▼
content.js loads on page
        │
        ├─► Load user config
        ├─► Create "Group" button
        └─► Schedule auto-group timer
        │
        ▼
Timer fires after delay (default 2.5s)
        │
        ▼
Send grouping message to background
        │
        ▼
background.js processes grouping
        │
        ▼
Tab is grouped automatically
```

---

## 🎨 Color Assignment Algorithm

```
1. getColorForGroup(categoryName)
       │
       ├─► Check if color cached
       │   YES → Return cached color
       │   NO → Continue
       │
       ├─► Check if assignment locked
       │   YES → Wait for lock
       │   NO → Continue
       │
       └─► Start assignment process
           │
           ├─► Get neighbor colors
           │   (fetch all groups in window)
           │
           ├─► Filter available colors
           │   (enabled colors NOT used by neighbors)
           │
           ├─► Select random from available
           │   (or fallback to any color)
           │
           ├─► Cache assignment
           │   (save to groupColorMap)
           │
           └─► Return color
```

---

## 🤖 Category Detection Algorithm

```
1. predictCategory(metadata, aiEnabled)
       │
       ├─► Check if AI enabled
       │   NO → Return "Other"
       │   YES → Continue
       │
       ├─► Combine text sources
       │   title + description + keywords
       │
       ├─► Score each category
       │   Count keyword matches
       │
       ├─► Find highest score
       │   Sort by match count
       │
       └─► Return top category
           (or "Other" if no matches)
```

---

## 💾 Storage Schema

### chrome.storage.sync (User Settings)

```javascript
{
  autoGroupDelay: 2500,
  allowedHashtags: ['tech', 'music', ...],
  channelCategoryMap: {
    'MKBHD': 'Tech',
    'Gordon Ramsay': 'Cooking'
  },
  extensionEnabled: true,
  aiCategoryDetection: true,
  autoCleanupEnabled: true,
  enabledColors: {
    'grey': true,
    'blue': true,
    // ... more colors
  }
}
```

### chrome.storage.local (Runtime Data)

```javascript
// groupColorMap: Category → Color assignments
{
  'Tech': 'blue',
  'Music': 'red',
  'Gaming': 'green'
}

// groupIdMap: Category → Group ID
{
  'Tech': 42,
  'Music': 43,
  'Gaming': 44
}

// groupingStats: Usage statistics
{
  totalTabs: 150,
  categoryCount: {
    'Tech': 45,
    'Music': 30,
    'Gaming': 25,
    'Other': 50
  },
  sessionsToday: 8,
  lastReset: '2024-01-15'
}
```

---

## 🔌 API Interfaces

### Background → Content Script Messages

```javascript
// Sent TO content script (from popup)
chrome.tabs.sendMessage(tabId, {
  action: "groupTab",
  category: "Tech" // optional
})

// Response FROM background
{
  success: true,
  category: "Tech",
  color: "blue"
}
```

### Content Script → Background Messages

```javascript
// Sent TO background (from content script)
chrome.runtime.sendMessage({
  action: "groupTab",
  category: ""  // AI will detect
})

// Response FROM background
{
  success: true,
  category: "Gaming",
  color: "green"
}
```

---

## ⚡ Performance Considerations

### Optimization Strategies

1. **Parallel Requests**
   - Fetch all group details in parallel
   - Use `Promise.all()` for concurrent operations

2. **Caching**
   - Cache color assignments (avoid recalculation)
   - Cache group IDs (faster lookups)

3. **Lazy Loading**
   - Don't load stats unless requested
   - Load settings only when needed

4. **Debouncing**
   - Auto-cleanup runs once per minute
   - Group updates batched when possible

### Memory Usage

- **Cache maps**: < 1MB (even with 100+ groups)
- **Settings**: < 100KB
- **Statistics**: < 500KB
- **Total**: < 5MB per extension instance

---

## 🔐 Security Considerations

### Permissions Justification

- `tabs`: Needed to read tab URLs and group them
- `tabGroups`: Required for grouping functionality
- `storage`: Save user settings and mappings
- `contextMenus`: Provide right-click options
- `scripting`: Inject button on YouTube pages

### Privacy

- No external API calls
- All processing local
- No data collection or tracking
- Settings stored in user's browser only

---

## 🧪 Testing Strategy

### Unit Tests (Future)

```
src/
├── background.test.js
│   ├── groupTab()
│   ├── predictCategory()
│   └── getColorForGroup()
└── content.test.js
    ├── getVideoData()
    └── createUI()
```

### Integration Tests (Future)

```
- Full grouping flow
- Settings persistence
- Statistics tracking
- Color assignment conflicts
```

---

## 🚀 Scalability Roadmap

### Phase 1 (Current)
- Single extension instance
- YouTube only
- 8 predefined categories

### Phase 2 (Planned)
- Multiple platforms (Vimeo, Dailymotion)
- Custom categories
- Sync across devices

### Phase 3 (Future)
- Cross-browser support
- Community category sharing
- Machine learning improvements

---

## 📚 Related Files

- [README.md](../README.md) - User documentation
- [CONTRIBUTING.md](CONTRIBUTING.md) - Development guide
- [CHANGELOG.md](CHANGELOG.md) - Version history

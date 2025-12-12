# Module Responsibility Analysis

This document provides a comprehensive breakdown of all modules in the YouTube Tab Grouper extension, organized by their responsibilities and architectural layers.

---

## Table of Contents

1. [Background Layer](#background-layer)
2. [Content Layer](#content-layer)
3. [Shared Layer](#shared-layer)
4. [UI Layer](#ui-layer)
5. [Responsibility Summary](#responsibility-summary)

---

## Background Layer

The background layer runs as a service worker and handles all Chrome API interactions, event handling, and core extension logic.

### Entry Points

#### `src/background/index.ts`
**Responsibility:** Service worker entry point  
**Functions:**
- Initializes `BackgroundApp` instance
- Handles extension installation events
- Starts the background application on install

**Dependencies:** `BackgroundApp`

---

### Controllers

#### `src/background/controllers/backgroundApp.ts`
**Responsibility:** Main background application orchestrator  
**Functions:**
- Manages application lifecycle (start/stop)
- Registers Chrome event listeners (messages, context menus, commands)
- Routes incoming messages to appropriate handlers
- Coordinates all background services
- Handles context menu interactions
- Handles keyboard shortcuts (commands)
- Processes grouping requests from content scripts and UI
- Batches grouping operations for all YouTube tabs
- Manages settings retrieval and validation

**Key Methods:**
- `start()` - Initialize and register event handlers
- `stop()` - Cleanup and unregister handlers
- `handleMessage()` - Message routing
- `handleContextMenuClick()` - Context menu actions
- `handleCommand()` - Keyboard shortcut actions
- `resolveCategory()` - Delegates category resolution
- `batchGroupAllTabs()` - Groups all YouTube tabs in window

**Dependencies:** 
- Services: `TabGroupingService`, `CategoryResolver`, `CleanupScheduler`
- Repositories: `SettingsRepository`
- Infrastructure: `ChromeApiClient`, `MessageRouter`

---

### Services

#### `src/background/services/tabGroupingService.ts`
**Responsibility:** Core tab grouping orchestration  
**Functions:**
- Groups tabs into Chrome tab groups
- Manages group creation and updates
- Persists grouping state (category → group ID/color mappings)
- Tracks statistics for grouped tabs
- Handles empty group cleanup with grace periods
- Manages concurrent grouping operations (locking)
- Updates group state when groups are modified externally

**Key Methods:**
- `groupTab()` - Group a single tab into appropriate category group
- `autoCleanupEmptyGroups()` - Remove empty groups after grace period
- `handleGroupRemoved()` - Clean up state when group deleted
- `handleGroupUpdated()` - Sync state when group modified
- `initialize()` - Load persisted group state

**Dependencies:**
- `ChromeApiClient`, `ColorAssigner`, `GroupStateRepository`, `StatsRepository`

---

#### `src/background/services/categoryResolver.ts`
**Responsibility:** Category detection and resolution  
**Functions:**
- Resolves video category using multiple strategies (priority order)
- Applies channel-to-category mappings
- Performs keyword-based category detection
- Maps YouTube categories to extension categories
- Falls back to default category when no match found

**Strategies (in priority order):**
1. Channel map override (exact channel match)
2. Explicit category override (user-provided)
3. Keyword-based detection (AI category detection)
4. YouTube category mapping
5. Fallback to "Other"

**Key Methods:**
- `resolve()` - Determines category for given metadata

**Dependencies:** `MetadataSchema` (for normalization)

---

#### `src/background/services/colorAssigner.ts`
**Responsibility:** Tab group color assignment  
**Functions:**
- Assigns colors to tab groups based on category
- Avoids color conflicts with neighboring groups
- Caches color assignments per category
- Supports mutex locking for concurrent operations

**Key Methods:**
- `assignColor()` - Assign color for category, avoiding conflicts
- `getNeighborColors()` - Inspect colors used in same window
- `setCache()` / `getCache()` - Manage color cache

**Dependencies:** `ChromeApiClient`

---

#### `src/background/services/cleanupScheduler.ts`
**Responsibility:** Scheduled cleanup of empty tab groups  
**Functions:**
- Runs periodic cleanup of empty groups
- Listens to tab group removal/update events
- Applies grace period before cleanup
- Respects user settings for auto-cleanup

**Key Methods:**
- `start()` - Begin scheduled cleanup
- `stop()` - Stop cleanup scheduler
- `tick()` - Periodic cleanup execution

**Dependencies:** `TabGroupingService`, `SettingsRepository`

---

### Repositories

#### `src/background/repositories/settingsRepository.ts`
**Responsibility:** Settings persistence and caching  
**Functions:**
- Manages extension settings in `chrome.storage.sync`
- Provides in-memory cache for performance
- Applies defaults and migrations
- Normalizes settings data

**Key Methods:**
- `get()` - Retrieve settings (with caching)
- `save()` - Persist settings updates
- `reset()` - Reset to defaults
- `clearCache()` - Invalidate cache

**Dependencies:** `shared/settings` (for defaults and migrations)

---

#### `src/background/repositories/groupStateRepository.ts`
**Responsibility:** Group state persistence  
**Functions:**
- Manages group color and ID mappings in `chrome.storage.local`
- Persists category → groupId and category → color mappings
- Provides in-memory cache

**Key Methods:**
- `get()` - Load group state (color map, ID map)
- `save()` - Persist group state
- `clearCache()` - Invalidate cache

**Storage:** `chrome.storage.local`

---

#### `src/background/repositories/statsRepository.ts`
**Responsibility:** Statistics persistence  
**Functions:**
- Manages grouping statistics in `chrome.storage.local`
- Tracks total tabs grouped, category counts, sessions
- Applies migrations and defaults

**Key Methods:**
- `get()` - Retrieve statistics
- `save()` - Update statistics
- `reset()` - Reset stats to defaults

**Dependencies:** `shared/stats` (for defaults and migrations)

---

### Infrastructure

#### `src/background/infra/chromeApiClient.ts`
**Responsibility:** Chrome API abstraction layer  
**Functions:**
- Wraps Chrome APIs with Promise-based interface
- Normalizes Chrome runtime errors
- Provides type-safe Chrome API access

**APIs Wrapped:**
- `chrome.tabs` (query, group)
- `chrome.tabGroups` (query, get, update)
- Tab group removal operations

**Key Methods:**
- `queryTabs()` - Query tabs
- `queryGroups()` - Query tab groups
- `getTabGroup()` - Get group by ID
- `groupTabs()` - Create/update groups
- `updateTabGroup()` - Update group properties
- `removeTabGroup()` - Remove group (by removing tabs)

---

#### `src/background/infra/migrations.ts`
**Responsibility:** Data migration orchestration  
**Functions:**
- Runs storage migrations on extension startup
- Migrates settings and stats between versions
- Handles migration errors gracefully
- Clears caches after migration

**Key Functions:**
- `runMigrations()` - Execute all pending migrations

**Dependencies:** `SettingsRepository`, `StatsRepository`

---

#### `src/background/metadataFetcher.ts`
**Responsibility:** Video metadata retrieval from content scripts  
**Functions:**
- Requests metadata from content script via messages
- Implements retry logic with exponential backoff
- Merges content metadata with fallback data
- Validates metadata completeness

**Key Methods:**
- `getVideoMetadata()` - Fetch metadata with retries
- `MetadataService.getVideoMetadata()` - Service class implementation

**Dependencies:** `MessageClient`, `MetadataSchema`

---

#### `src/background/logger.ts`
**Responsibility:** Background logging utilities  
**Functions:**
- Provides structured logging (info, warn, error, debug)
- Supports debug logging toggle
- Normalizes errors into envelopes

**Exports:**
- `logInfo()`, `logWarn()`, `logError()`, `logDebug()`
- `setDebugLogging()` - Enable/disable debug logs
- `toErrorEnvelope()` - Convert errors to response format

---

#### `src/background/constants.ts`
**Responsibility:** Background constants re-export  
**Functions:**
- Re-exports shared constants for convenience
- Provides background-specific constant access

---

#### `src/background/tabGrouping.ts`
**Responsibility:** Legacy facade for tab grouping  
**Functions:**
- Provides backward-compatible exports
- Delegates to `TabGroupingService`
- **Note:** Marked as deprecated (TODO: remove)

---

## Content Layer

The content layer runs inside YouTube webpages and handles DOM interactions, metadata extraction, and UI injection.

### Entry Points

#### `src/content/index.ts`
**Responsibility:** Content script entry point  
**Functions:**
- Initializes `ContentApp` instance
- Starts the content application

**Dependencies:** `ContentApp`

---

### Application

#### `src/content/app/contentApp.ts`
**Responsibility:** Main content script orchestrator  
**Functions:**
- Manages content script lifecycle
- Initializes UI components (button, auto-group)
- Loads settings from background
- Coordinates metadata collection and grouping requests
- Handles manual and automatic grouping triggers
- Prevents duplicate grouping of same video

**Key Methods:**
- `start()` - Initialize content app
- `stop()` - Cleanup and remove UI
- `initialize()` - Load config and render UI
- `triggerAutoGroup()` - Auto-group after delay
- `handleManualGroup()` - Manual group button click

**Dependencies:**
- `AutoGroupController`, `GroupButtonView`, `MetadataCollector`
- `ContentMessagingBridge`, `MessageClient`

---

#### `src/content/app/autoGroupController.ts`
**Responsibility:** Automatic grouping timer management  
**Functions:**
- Schedules automatic grouping after configurable delay
- Cancels pending auto-group on page navigation
- Validates extension enabled state

**Key Methods:**
- `start()` - Schedule auto-group with delay
- `cancel()` - Cancel pending auto-group

---

#### `src/content/app/groupButtonView.ts`
**Responsibility:** Floating group button UI  
**Functions:**
- Renders floating "Group" button overlay
- Handles button removal
- Delegates click handling to controller

**Key Methods:**
- `render()` - Show button with click handler
- `remove()` - Hide button

**Dependencies:** `dom.ts` (DOM manipulation)

---

#### `src/content/app/metadataCollector.ts`
**Responsibility:** Metadata collection coordination  
**Functions:**
- Coordinates metadata extraction from page
- Normalizes extracted metadata
- Provides unified metadata interface

**Key Methods:**
- `collect()` - Extract and normalize metadata

**Dependencies:** `metadataExtractor.ts`, `metadataSchema.ts`

---

### DOM Manipulation

#### `src/content/dom.ts`
**Responsibility:** DOM manipulation utilities  
**Functions:**
- Creates and manages floating group button
- Injects styles into page
- Handles button rendering and removal

**Key Functions:**
- `renderGroupButton()` - Create and inject button
- `removeGroupButton()` - Remove button from DOM
- `ensureStyles()` - Inject CSS styles

---

### Metadata Extraction

#### `src/content/metadataExtractor.ts`
**Responsibility:** YouTube page metadata extraction  
**Functions:**
- Extracts video metadata from DOM
- Parses JSON-LD structured data
- Reads YouTube initial data (`ytInitialData`)
- Extracts category from meta tags
- Combines multiple metadata sources

**Extraction Sources:**
1. DOM selectors (title, channel, description)
2. Meta tags (keywords, description, genre)
3. JSON-LD script tags
4. `window.ytInitialData` (YouTube category)

**Key Functions:**
- `extractVideoMetadata()` - Comprehensive metadata extraction
- `getVideoData()` - Basic DOM extraction
- `readDomMetadata()` - DOM querying
- `extractJsonLdMetadata()` - JSON-LD parsing
- `detectYouTubeCategory()` - YouTube category detection

**Dependencies:** `constants.ts` (selectors)

---

### Messaging

#### `src/content/messageClient.ts`
**Responsibility:** Content-to-background messaging  
**Functions:**
- Sends grouping requests to background
- Retrieves settings from background
- Checks if tab is already grouped
- Handles message timeouts and errors

**Key Functions:**
- `sendGroupTab()` - Request tab grouping
- `sendGetSettings()` - Fetch settings
- `sendIsTabGrouped()` - Check grouping status

**Dependencies:** `MessageClient` (shared)

---

#### `src/content/messaging/contentMessagingBridge.ts`
**Responsibility:** Background-to-content message handling  
**Functions:**
- Receives metadata requests from background
- Routes messages to content handlers
- Provides metadata on demand
- Validates extension enabled state

**Key Methods:**
- `start()` - Register message listener
- `stop()` - Unregister listener
- `handleGetVideoMetadata()` - Respond to metadata requests

**Dependencies:** `MessageRouter` (shared), `MetadataCollector`

---

### Configuration

#### `src/content/config.ts`
**Responsibility:** Content script configuration  
**Functions:**
- Loads settings from background
- Normalizes settings with defaults
- Validates extension enabled state

**Key Functions:**
- `loadConfig()` - Fetch and normalize settings
- `isEnabled()` - Check if extension enabled
- `normalizeContentSettings()` - Apply defaults

**Dependencies:** `MessageClient`, `shared/settings`

---

#### `src/content/constants.ts`
**Responsibility:** Content script constants  
**Defines:**
- DOM selectors for YouTube page elements
- Button configuration (ID, label, title)
- Default settings
- Fallback category

---

## Shared Layer

The shared layer contains code used across multiple contexts (background, content, UI).

### Messaging

#### `src/shared/messaging/messageRouter.ts`
**Responsibility:** Message routing and validation  
**Functions:**
- Routes messages to registered handlers
- Validates message envelopes and payloads
- Handles unknown actions
- Manages message versioning

**Key Methods:**
- `listener()` - Message handler function for `chrome.runtime.onMessage`
- `withHandlers()` - Create router with new handlers

**Dependencies:** `messageContracts.ts`, `messageTransport.ts`

---

#### `src/shared/messaging/messageClient.ts`
**Responsibility:** Message sending client  
**Functions:**
- Sends messages to background/content scripts
- Validates requests and responses
- Handles timeouts and errors
- Supports tab-specific messaging

**Key Methods:**
- `sendMessage()` - Send message with validation

**Dependencies:** `messageContracts.ts`, `messageTransport.ts`

---

#### `src/shared/messageContracts.ts`
**Responsibility:** Message contract definitions  
**Functions:**
- Defines message action constants
- Provides message catalog documentation
- Validates request/response payloads
- Builds standard response objects

**Key Exports:**
- `MESSAGE_ACTIONS` - Action type constants
- `validateRequest()` / `validateResponse()` - Validation functions
- `buildErrorResponse()` / `buildSuccessResponse()` - Response builders
- Response builders for specific actions

---

#### `src/shared/messageTransport.ts`
**Responsibility:** Low-level message transport  
**Functions:**
- Creates message envelopes (version, requestId, action)
- Handles `chrome.runtime.onMessage` listener
- Implements message sending with timeouts
- Manages version checking

**Key Functions:**
- `handleMessage()` - Create message listener
- `sendMessageSafe()` - Send message with timeout
- `generateRequestId()` - Create unique request IDs
- `envelopeResponse()` - Wrap response in envelope

---

### Data Models

#### `src/shared/types.ts`
**Responsibility:** TypeScript type definitions  
**Defines:**
- `Metadata` - Video metadata structure
- `Settings` - Extension settings structure
- `GroupingStats` - Statistics structure
- `GroupingState` - Group state structure
- Message request/response types
- Message envelope structure

---

#### `src/shared/metadataSchema.ts`
**Responsibility:** Metadata normalization and validation  
**Functions:**
- Normalizes metadata fields (trim, validate)
- Validates metadata structure
- Merges multiple metadata sources
- Provides empty metadata defaults

**Key Functions:**
- `normalizeVideoMetadata()` - Normalize and validate metadata
- `isVideoMetadata()` - Type guard for metadata
- `mergeMetadata()` - Merge preferred + fallback metadata
- `hasMetadataContent()` - Check if metadata has useful data

---

#### `src/shared/settings.ts`
**Responsibility:** Settings normalization and persistence  
**Functions:**
- Defines default settings
- Normalizes settings with defaults
- Validates settings structure
- Provides Chrome storage access for settings
- Implements debounced sync writes
- Handles settings migrations

**Key Functions:**
- `withSettingsDefaults()` - Apply defaults
- `getSettings()` - Read from `chrome.storage.sync`
- `updateSettings()` - Update with debouncing
- `resetSettings()` - Reset to defaults
- `migrateSettingsV0ToV1()` - Migration logic

**Constants:**
- `AVAILABLE_COLORS` - Supported tab group colors
- `CATEGORY_KEYWORDS` - Default category keywords
- `DEFAULT_SETTINGS` - Default configuration

---

#### `src/shared/stats.ts`
**Responsibility:** Statistics normalization and persistence  
**Functions:**
- Defines default statistics
- Normalizes statistics with defaults
- Validates statistics structure
- Provides Chrome storage access for stats
- Handles statistics migrations

**Key Functions:**
- `withStatsDefaults()` - Apply defaults
- `getStats()` - Read from `chrome.storage.local`
- `updateStats()` - Update statistics
- `resetStats()` - Reset to defaults
- `migrateStatsV0ToV1()` - Migration logic

---

### Utilities

#### `src/shared/domain/result.ts`
**Responsibility:** Result/Option type utilities  
**Functions:**
- Provides Rust-style Result type
- Supports error handling without exceptions
- Provides mapping and unwrapping utilities

**Types:**
- `Result<T, E>` - Ok/Err discriminated union
- `Ok<T>`, `Err<E>` - Result variants

**Functions:**
- `ok()`, `err()` - Constructors
- `isOk()`, `isErr()` - Type guards
- `map()`, `mapError()` - Transformations
- `unwrapOr()` - Safe unwrapping

---

#### `src/shared/logging/logger.ts`
**Responsibility:** Structured logging utility  
**Functions:**
- Provides configurable logging levels
- Supports log prefixes and timestamps
- Creates child loggers
- Filters logs by level

**Key Methods:**
- `debug()`, `info()`, `warn()`, `error()` - Log methods
- `setLevel()` - Configure log level
- `child()` - Create child logger

**Note:** Currently unused; background uses simpler logger

---

#### `src/shared/di/container.ts`
**Responsibility:** Dependency injection container  
**Functions:**
- Registers services and factories
- Resolves dependencies
- Supports singleton and transient lifetimes
- Supports parent containers

**Key Methods:**
- `registerValue()` - Register value
- `registerFactory()` - Register factory
- `registerSingleton()` - Register singleton
- `resolve()` - Get instance
- `createChild()` - Create child container

**Note:** Available for future use; currently minimal usage

---

## UI Layer

The UI layer provides user interfaces for the extension (popup, options, stats).

### Popup UI

#### `ui/popup/popup.ts`
**Responsibility:** Popup entry point  
**Functions:**
- Initializes popup controller
- Starts popup application

**Dependencies:** `PopupController`

---

#### `ui/popup/PopupController.ts`
**Responsibility:** Popup business logic  
**Functions:**
- Handles user interactions (group, batch group)
- Validates inputs
- Sends messages to background
- Manages UI state (loading, errors)
- Displays notifications

**Key Methods:**
- `start()` - Initialize controller
- `handleGroup()` - Group current tab
- `handleBatch()` - Batch group all tabs
- `sendPopupMessage()` - Send message with validation

**Dependencies:** `PopupView`, `MessageClient`

---

#### `ui/popup/PopupView.ts`
**Responsibility:** Popup DOM manipulation  
**Functions:**
- Binds event handlers to UI elements
- Updates UI state (loading, notifications)
- Reads user input (category field)

**Key Methods:**
- `bindGroup()` / `bindBatch()` - Event binding
- `getCategory()` / `clearCategory()` - Input management
- `setLoading()` - Update loading state
- `showNotification()` - Display status messages

---

### Options UI

#### `ui/options/options.ts`
**Responsibility:** Settings page implementation  
**Functions:**
- Loads and displays current settings
- Provides UI for all settings categories:
  - General (enable/disable, delays, cleanup)
  - Color preferences (toggle enabled colors)
  - Category keywords (customize keywords per category)
  - Channel mappings (channel → category)
  - Hashtag whitelist
- Handles settings save/reset
- Provides import/export functionality
- Updates UI based on settings changes

**Key Functions:**
- `initializeSettings()` - Load and display settings
- `handleSaveSettings()` - Persist settings
- `handleResetSettings()` - Reset to defaults
- `handleExportSettings()` - Export JSON file
- `handleImportSettings()` - Import JSON file
- `displayColorToggles()` - Render color UI
- `displayCategoryKeywords()` - Render keywords editor
- `displayChannelMappings()` - Render channel mappings

**Dependencies:** `shared/settings`

---

### Stats UI

#### `ui/stats/stats.ts`
**Responsibility:** Statistics page implementation  
**Functions:**
- Loads and displays grouping statistics
- Shows total tabs grouped
- Displays category breakdown
- Renders category bar chart
- Provides reset statistics functionality

**Key Functions:**
- `loadAndDisplayStats()` - Load and render stats
- `displayChart()` - Render category chart
- `loadStats()` - Fetch statistics

**Dependencies:** `shared/stats`

---

## Responsibility Summary

### By Responsibility Category

#### **Chrome API Access**
- `ChromeApiClient` - All Chrome API interactions
- Background scripts only - Content scripts use messaging

#### **Data Persistence**
- `SettingsRepository` - Extension settings (`chrome.storage.sync`)
- `GroupStateRepository` - Group state (`chrome.storage.local`)
- `StatsRepository` - Statistics (`chrome.storage.local`)
- `shared/settings.ts` - Settings storage utilities
- `shared/stats.ts` - Stats storage utilities

#### **Message Handling**
- `MessageRouter` - Route messages to handlers
- `MessageClient` - Send messages with validation
- `messageContracts.ts` - Message definitions and validation
- `messageTransport.ts` - Low-level message transport
- `ContentMessagingBridge` - Content-side message handling

#### **Category Resolution**
- `CategoryResolver` - Multi-strategy category detection
- `metadataExtractor.ts` - Extract YouTube category from page

#### **Tab Grouping**
- `TabGroupingService` - Core grouping orchestration
- `ColorAssigner` - Color assignment logic
- `CleanupScheduler` - Empty group cleanup

#### **DOM Interaction**
- `dom.ts` - DOM manipulation utilities
- `metadataExtractor.ts` - DOM querying for metadata
- `GroupButtonView` - Button UI management
- All content scripts - Page DOM access

#### **Metadata Processing**
- `MetadataCollector` - Metadata collection coordination
- `metadataExtractor.ts` - Extract from DOM/JSON-LD
- `metadataSchema.ts` - Normalization and validation
- `metadataFetcher.ts` - Request metadata from content

#### **UI Management**
- `PopupView` / `PopupController` - Popup UI
- `options.ts` - Settings page UI
- `stats.ts` - Statistics page UI
- `GroupButtonView` - Floating button UI

#### **Configuration Management**
- `config.ts` - Content script config loading
- `shared/settings.ts` - Settings normalization
- `constants.ts` - Constant definitions

#### **Error Handling & Logging**
- `logger.ts` - Background logging
- `shared/logging/logger.ts` - Structured logging (unused)
- `shared/domain/result.ts` - Result types (unused)

---

## Module Dependencies Graph

```
Background Layer
├── BackgroundApp
│   ├── TabGroupingService
│   │   ├── ChromeApiClient
│   │   ├── ColorAssigner
│   │   ├── GroupStateRepository
│   │   └── StatsRepository
│   ├── CategoryResolver
│   ├── CleanupScheduler
│   ├── SettingsRepository
│   ├── MetadataFetcher (→ Content via MessageClient)
│   └── MessageRouter
│
Content Layer
├── ContentApp
│   ├── AutoGroupController
│   ├── GroupButtonView → dom.ts
│   ├── MetadataCollector → metadataExtractor.ts
│   ├── ContentMessagingBridge → MessageRouter
│   └── MessageClient → Background
│
Shared Layer
├── MessageRouter
├── MessageClient
├── messageContracts.ts
├── messageTransport.ts
├── metadataSchema.ts
├── settings.ts
└── stats.ts
```

---

## Notes

1. **Deprecated Modules:**
   - `src/background/tabGrouping.ts` - Legacy facade, should be removed

2. **Unused Modules:**
   - `src/shared/logging/logger.ts` - Structured logger (background uses simpler logger)
   - `src/shared/domain/result.ts` - Result types (available but not used)
   - `src/shared/di/container.ts` - DI container (minimal usage)

3. **Migration Path:**
   - `migrations.ts` handles settings and stats migrations
   - All repositories support versioning

4. **Storage Strategy:**
   - Settings: `chrome.storage.sync` (synced across devices)
   - Stats & Group State: `chrome.storage.local` (device-specific)

5. **Message Flow:**
   - Content → Background: Via `MessageClient.sendMessage()`
   - Background → Content: Via `chrome.tabs.sendMessage()`
   - All messages use versioned envelopes with request IDs

# Shared Layer Review

This document analyzes modules in the `src/shared` directory to identify modules that are only used by a single layer and should potentially be moved.

**Principle:** Modules should be in `shared/` only if they are used by **multiple layers** (background, content, or UI).

---

## Analysis Summary

| Module | Background | Content | UI | Verdict |
|--------|-----------|---------|----|---------|
| `types.ts` | ✅ | ✅ | ✅ | **KEEP** - Used by all 3 layers |
| `messageContracts.ts` | ✅ | ✅ | ✅ | **KEEP** - Used by all 3 layers |
| `messageTransport.ts` | ✅ | ✅ (via MessageClient) | ✅ (via MessageClient) | **KEEP** - Used by all 3 layers |
| `messaging/messageRouter.ts` | ✅ | ✅ | ❌ | **KEEP** - Used by 2 layers |
| `messaging/messageClient.ts` | ✅ | ✅ | ✅ | **KEEP** - Used by all 3 layers |
| `metadataSchema.ts` | ✅ | ✅ | ❌ | **KEEP** - Used by 2 layers |
| `settings.ts` | ✅ | ✅ | ✅ | **KEEP** - Used by all 3 layers |
| `stats.ts` | ✅ | ❌ | ✅ | **KEEP** - Used by 2 layers |
| `domain/result.ts` | ❌ | ❌ | ❌ | **❌ REMOVE** - Unused |
| `logging/logger.ts` | ❌ | ❌ | ❌ | **❌ REMOVE** - Unused |
| `di/container.ts` | ❌ | ❌ | ❌ | **❌ REMOVE** - Unused |

---

## Detailed Analysis

### ✅ Legitimately Shared Modules (Keep in `shared/`)

#### 1. `types.ts`
**Usage:**
- **Background:** 10+ imports (Settings, Metadata, GroupingStats, GroupingState, etc.)
- **Content:** 8+ imports (Settings, Metadata, GroupTabResponse, etc.)
- **UI:** 3 imports (Settings, GroupTabResponse, GroupingStats)

**Verdict:** ✅ **KEEP** - Core type definitions used across all layers

---

#### 2. `messageContracts.ts`
**Usage:**
- **Background:** Used in `backgroundApp.ts`, `metadataFetcher.ts`, `logger.ts`
- **Content:** Used in `messageClient.ts`, `contentMessagingBridge.ts`
- **UI:** Used in `PopupController.ts`

**Key Exports:**
- `MESSAGE_ACTIONS` constants
- `validateRequest()` / `validateResponse()`
- Response builders (`buildErrorResponse`, `buildGroupTabResponse`, etc.)

**Verdict:** ✅ **KEEP** - Message contracts shared across all layers

---

#### 3. `messageTransport.ts`
**Usage:**
- **Background:** Used in `backgroundApp.ts` (generates request IDs, imports MESSAGE_VERSION)
- **Content:** Used indirectly via `MessageClient` (which uses `sendMessageSafe`)
- **UI:** Used indirectly via `MessageClient`

**Note:** While not directly imported by content/UI, it's a core dependency of `MessageClient` which is used by all layers.

**Verdict:** ✅ **KEEP** - Core message transport infrastructure

---

#### 4. `messaging/messageRouter.ts`
**Usage:**
- **Background:** Used in `backgroundApp.ts`
- **Content:** Used in `contentMessagingBridge.ts`
- **UI:** ❌ Not used

**Verdict:** ✅ **KEEP** - Used by 2 layers (background + content), which is sufficient for shared status

---

#### 5. `messaging/messageClient.ts`
**Usage:**
- **Background:** Used in `metadataFetcher.ts`
- **Content:** Used in `messageClient.ts` (content-specific wrapper)
- **UI:** Used in `PopupController.ts`

**Verdict:** ✅ **KEEP** - Used by all 3 layers

---

#### 6. `metadataSchema.ts`
**Usage:**
- **Background:** Used in `categoryResolver.ts`, `metadataFetcher.ts`
- **Content:** Used in `metadataCollector.ts`, `metadataExtractor.ts`, `contentMessagingBridge.ts`
- **UI:** ❌ Not used

**Verdict:** ✅ **KEEP** - Used by 2 layers (background + content), which is sufficient

---

#### 7. `settings.ts`
**Usage:**
- **Background:** Used in `settingsRepository.ts`, `constants.ts` (re-exports)
- **Content:** Used in `config.ts`, `constants.ts`
- **UI:** Used in `options.ts`

**Functions:**
- `getSettings()`, `updateSettings()`, `resetSettings()`
- `withSettingsDefaults()`, `migrateSettingsV0ToV1()`
- Defaults and constants

**Verdict:** ✅ **KEEP** - Used by all 3 layers

---

#### 8. `stats.ts`
**Usage:**
- **Background:** Used in `statsRepository.ts`
- **Content:** ❌ Not used
- **UI:** Used in `stats.ts` (stats page)

**Note:** While not used by content layer, it's used by both background and UI. The UI stats page directly calls `getStats()` and `resetStats()` from `chrome.storage.local`.

**Verdict:** ✅ **KEEP** - Used by 2 layers (background + UI), which is sufficient

---

### ❌ Modules That Don't Belong in Shared

#### 1. `domain/result.ts` - **UNUSED**

**Analysis:**
- ❌ **No imports found** in background, content, or UI
- Provides Rust-style `Result<T, E>` type
- No references in codebase

**Recommendation:** 
- **Remove from codebase** (dead code)
- OR move to a utility folder if planning to use in future
- OR keep if planned for future refactoring (with TODO comment)

**Impact:** None (already unused)

---

#### 2. `logging/logger.ts` - **UNUSED**

**Analysis:**
- ❌ **No imports found** in background, content, or UI
- Provides structured `Logger` class with levels, prefixes, timestamps
- Background uses simpler logger in `src/background/logger.ts`
- This shared logger is more advanced but unused

**Recommendation:**
- **Remove from codebase** (dead code)
- OR consolidate with `src/background/logger.ts` if features needed
- OR keep if planning migration to structured logging

**Impact:** None (already unused)

---

#### 3. `di/container.ts` - **UNUSED**

**Analysis:**
- ❌ **No imports found** in background, content, or UI
- Provides dependency injection container
- Comment says "for wiring services during the refactor"
- `rootContainer` exported but never used

**Recommendation:**
- **Remove from codebase** (dead code)
- OR keep if DI refactoring is planned (with TODO/FIXME comment)
- Currently adds unnecessary complexity

**Impact:** None (already unused)

---

## Recommendations

### Immediate Actions

1. **Remove Unused Modules:**
   - Delete `src/shared/domain/result.ts`
   - Delete `src/shared/logging/logger.ts`
   - Delete `src/shared/di/container.ts`

   **Rationale:** Dead code increases maintenance burden and creates confusion about what's actually used.

2. **Alternative: Document as Future-Use**
   - If these modules are planned for future use, add clear TODO comments
   - Move to a `shared/unused` or `shared/future` directory
   - Document the intended usage and migration plan

### No Changes Needed

All other modules in `shared/` are correctly placed:
- **Multi-layer usage:** `types.ts`, `messageContracts.ts`, `settings.ts`, `messageClient.ts`
- **Two-layer usage:** `messageRouter.ts`, `metadataSchema.ts`, `stats.ts`
- All actively used and properly shared

---

## Usage Statistics

### Modules Used by All 3 Layers (4)
- `types.ts`
- `messageContracts.ts`
- `messageTransport.ts` (indirectly)
- `messageClient.ts`
- `settings.ts`

### Modules Used by 2 Layers (3)
- `messaging/messageRouter.ts` (background + content)
- `metadataSchema.ts` (background + content)
- `stats.ts` (background + UI)

### Modules Used by 0 Layers (3) ❌
- `domain/result.ts`
- `logging/logger.ts`
- `di/container.ts`

---

## Conclusion

**Overall Assessment:** ✅ **Well-organized shared layer**

- **8 out of 11 modules** are correctly placed and actively used
- **3 modules** are unused dead code and should be removed
- No modules are incorrectly placed in shared when they should be layer-specific

The shared layer follows good architectural principles with proper separation of concerns. The unused modules are leftovers from refactoring or planned features that were never implemented.

---

## Migration Plan (if removing unused modules)

```bash
# Remove unused modules
rm src/shared/domain/result.ts
rm src/shared/logging/logger.ts
rm src/shared/di/container.ts

# Verify no build errors
npm run build

# Verify tests pass
npm test
```

**Note:** Since these modules are unused, removal should have zero impact on functionality.

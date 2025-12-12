# Module Overlap and Generalization Analysis

This document identifies modules with overlapping functionality that could be unified or generalized to reduce duplication and improve maintainability.

---

## Summary of Findings

| Category | Overlap Found | Severity | Recommendation |
|----------|---------------|----------|----------------|
| Error Handling Utilities | 5+ duplicate functions | 🔴 **High** | Create shared error utilities |
| Message Response Handling | Similar patterns in 2 modules | 🟡 **Medium** | Generalize message response handlers |
| Repository Pattern | 3 repositories with similar structure | 🟡 **Medium** | Create base repository class |
| Message Client Wrappers | Duplicate validation logic | 🟡 **Medium** | Extract to shared utilities |

---

## 1. Error Handling Utilities (High Priority)

### Current State

Multiple modules implement similar error-to-string conversion functions:

#### `src/content/app/contentApp.ts`
```typescript
const toMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
};
```

#### `src/background/services/tabGroupingService.ts`
```typescript
const toErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
};
```

#### `src/background/infra/chromeApiClient.ts`
```typescript
const toErrorMessage = (context: string, error: unknown) => {
  if (error instanceof Error) return `${context}: ${error.message}`;
  if (typeof error === "string") return `${context}: ${error}`;
  try {
    return `${context}: ${JSON.stringify(error)}`;
  } catch {
    return `${context}: Unknown error`;
  }
};
```

#### `src/background/infra/migrations.ts`
```typescript
const toError = (reason: unknown) => {
  if (reason instanceof Error) return reason;
  if (typeof reason === "string") return new Error(reason);
  try {
    return new Error(JSON.stringify(reason));
  } catch {
    return new Error("Unknown error");
  }
};
```

#### `src/background/controllers/backgroundApp.ts`
```typescript
const toErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
};
```

### Recommendation

**Create: `src/shared/utils/errorUtils.ts`**

```typescript
/**
 * Convert any error value to a user-friendly error message string.
 */
export function toErrorMessage(error: unknown, context?: string): string {
  let message: string;
  
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "string") {
    message = error;
  } else {
    try {
      message = JSON.stringify(error);
    } catch {
      message = "Unknown error";
    }
  }
  
  return context ? `${context}: ${message}` : message;
}

/**
 * Convert any error value to an Error instance.
 */
export function toError(error: unknown, context?: string): Error {
  if (error instanceof Error) {
    return context ? new Error(`${context}: ${error.message}`) : error;
  }
  if (typeof error === "string") {
    return new Error(context ? `${context}: ${error}` : error);
  }
  try {
    const message = JSON.stringify(error);
    return new Error(context ? `${context}: ${message}` : message);
  } catch {
    return new Error(context ? `${context}: Unknown error` : "Unknown error");
  }
}
```

**Impact:**
- ✅ Remove 5+ duplicate functions
- ✅ Standardize error handling across codebase
- ✅ Single source of truth for error conversion
- ✅ Easy to enhance (e.g., add logging, structured errors)

**Files to Update:**
- `src/content/app/contentApp.ts`
- `src/background/services/tabGroupingService.ts`
- `src/background/infra/chromeApiClient.ts`
- `src/background/infra/migrations.ts`
- `src/background/controllers/backgroundApp.ts`

---

## 2. Message Response Handling (Medium Priority)

### Current State

Similar error handling patterns in message sending:

#### `src/content/messageClient.ts` (Lines 44-53)
```typescript
catch (error) {
  const message = (error as Error)?.message || "Unknown error";
  if (/disabled/i.test(message)) {
    return disabledResponse();
  }
  if (/timed out/i.test(message) && timeoutMs) {
    return timeoutResponse(timeoutMs);
  }
  return { success: false, error: message };
}
```

#### `ui/popup/PopupController.ts` (Lines 74-83)
```typescript
catch (error) {
  const message = (error as Error)?.message || "Unknown error";
  if (/disabled/i.test(message)) {
    return { success: false, error: "Extension is disabled" };
  }
  if (/timed out/i.test(message) && timeoutMs) {
    return { success: false, error: `Message timed out after ${timeoutMs}ms` };
  }
  return { success: false, error: message };
}
```

#### Both also have similar validation logic:
```typescript
const { valid, errors } = validateResponse(action, response || {});
if (!valid) {
  return { success: false, error: errors.join("; ") || "Invalid response" };
}
```

### Recommendation

**Create: `src/shared/messaging/messageResponseHandler.ts`**

```typescript
import { validateResponse, MESSAGE_ACTIONS, type MessageAction } from "../messageContracts";
import { toErrorMessage } from "../utils/errorUtils";

export interface MessageResponseOptions {
  timeoutMs?: number;
  validateResponse?: boolean;
}

/**
 * Handle message response with validation and error normalization.
 */
export function handleMessageResponse<T extends { success?: boolean; error?: string }>(
  action: MessageAction,
  response: unknown,
  error: unknown | null,
  options: MessageResponseOptions = {}
): T {
  const { timeoutMs, validateResponse: shouldValidate = true } = options;
  
  // Handle thrown errors
  if (error) {
    const message = toErrorMessage(error);
    
    if (/disabled/i.test(message)) {
      return { success: false, error: "Extension is disabled" } as T;
    }
    
    if (/timed out/i.test(message) && timeoutMs) {
      return { 
        success: false, 
        error: `Message timed out after ${timeoutMs}ms` 
      } as T;
    }
    
    return { success: false, error: message } as T;
  }
  
  // Validate response if enabled
  if (shouldValidate && response) {
    const validation = validateResponse(action, response);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join("; ") || "Invalid response"
      } as T;
    }
  }
  
  return response as T;
}
```

**Impact:**
- ✅ Reduces duplication in `content/messageClient.ts`
- ✅ Reduces duplication in `ui/popup/PopupController.ts`
- ✅ Standardizes error handling across message senders
- ✅ Easier to maintain and enhance

**Files to Update:**
- `src/content/messageClient.ts` - Use `handleMessageResponse` in `sendGroupTab` and `sendGetSettings`
- `ui/popup/PopupController.ts` - Use `handleMessageResponse` in `sendPopupMessage`

---

## 3. Repository Pattern (Medium Priority)

### Current State

Three repositories share very similar structure:

#### Pattern in `SettingsRepository`, `StatsRepository`, `GroupStateRepository`:

**Common Structure:**
1. `cache: T | null` - In-memory cache
2. `get(): Promise<T>` - Load with caching
3. `save(next): Promise<T>` - Persist and update cache
4. `clearCache(): void` - Invalidate cache
5. Similar error handling patterns

**Key Differences:**
- Storage location (`chrome.storage.sync` vs `chrome.storage.local`)
- Default values and migrations
- Save method signatures (some take `Partial<T>`, some take specific types)

### Recommendation

**Create: `src/background/repositories/baseRepository.ts`**

```typescript
import type { GroupingStats, Settings, GroupingState } from "../../shared/types";

type StorageArea = "sync" | "local";

export abstract class BaseRepository<T> {
  protected cache: T | null = null;
  protected abstract storageArea: StorageArea;
  protected abstract storageKey: string;
  protected abstract defaults: T;

  protected abstract migrate(data: unknown): T;
  protected abstract normalize(data: unknown): T;

  async get(): Promise<T> {
    if (this.cache) return this.cache;

    const data = await this.readFromStorage();
    const migrated = this.migrate(data);
    const normalized = this.normalize(migrated);
    
    this.cache = { ...normalized };
    return this.cache;
  }

  async save(next: Partial<T> | T): Promise<T> {
    const current = await this.get();
    const updated = { ...current, ...next };
    const normalized = this.normalize(updated);
    
    await this.writeToStorage(normalized);
    this.cache = normalized;
    return normalized;
  }

  clearCache(): void {
    this.cache = null;
  }

  protected abstract readFromStorage(): Promise<unknown>;
  protected abstract writeToStorage(data: T): Promise<void>;
}
```

**However, consider:**

⚠️ **Note:** The repositories have significant differences:
- `GroupStateRepository` has custom `save()` signature (takes `groupColorMap` and `groupIdMap` separately)
- Different migration strategies
- Different storage structures

**Alternative Recommendation:** 

Instead of full base class, create **shared repository utilities**:

**Create: `src/background/repositories/repositoryUtils.ts`**

```typescript
import { toError } from "../../shared/utils/errorUtils";

/**
 * Read from Chrome storage with error handling.
 */
export async function readChromeStorage(
  area: "sync" | "local",
  key: string,
  defaultValue: unknown
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    try {
      const storage = area === "sync" ? chrome.storage.sync : chrome.storage.local;
      storage.get({ [key]: defaultValue }, (result) => {
        if (chrome.runtime.lastError) {
          reject(toError(chrome.runtime.lastError.message, `storage.${area}.get`));
          return;
        }
        resolve(result[key] ?? defaultValue);
      });
    } catch (error) {
      reject(toError(error, `storage.${area}.get`));
    }
  });
}

/**
 * Write to Chrome storage with error handling.
 */
export async function writeChromeStorage(
  area: "sync" | "local",
  data: Record<string, unknown>
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const storage = area === "sync" ? chrome.storage.sync : chrome.storage.local;
      storage.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(toError(chrome.runtime.lastError.message, `storage.${area}.set`));
          return;
        }
        resolve();
      });
    } catch (error) {
      reject(toError(error, `storage.${area}.set`));
    }
  });
}
```

**Impact:**
- ✅ Reduces Chrome storage boilerplate
- ✅ Standardizes error handling for storage operations
- ✅ Less invasive than base class refactoring
- ⚠️ Doesn't unify the full repository pattern (may be too complex)

**Files to Update:**
- `src/background/repositories/settingsRepository.ts`
- `src/background/repositories/statsRepository.ts`
- `src/background/repositories/groupStateRepository.ts`

---

## 4. Message Client Wrapper Patterns (Low Priority)

### Current State

`content/messageClient.ts` and `PopupController.sendPopupMessage()` both:
1. Call `MessageClient.sendMessage()`
2. Validate response with `validateResponse()`
3. Handle disabled/timeout errors similarly
4. Return error responses on failure

### Recommendation

**Already addressed by #2 (Message Response Handling)**

Once we create `handleMessageResponse`, both modules can use it, reducing duplication.

---

## 5. Status/Notification Display (Low Priority)

### Current State

Similar notification patterns in UI:

#### `ui/popup/PopupView.ts` (Lines 34-44)
```typescript
showNotification(message: string, type: StatusType = "info") {
  if (!this.statusEl) return;
  this.statusEl.textContent = message;
  this.statusEl.className = `status ${type}`;
  setTimeout(() => {
    if (!this.statusEl) return;
    this.statusEl.textContent = "";
    this.statusEl.className = "status";
  }, 4000);
}
```

#### `ui/options/options.ts` (Lines 419-433)
```typescript
function showStatus(message: string, type: 'info' | 'success' | 'error' = 'info') {
  if (!statusEl) {
    console.warn("statusEl not found");
    return;
  }
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  setTimeout(() => {
    if (!statusEl) return;
    statusEl.textContent = "";
    statusEl.className = "status";
  }, 4000);
}
```

### Recommendation

**Create: `ui/utils/statusDisplay.ts`**

```typescript
export type StatusType = "info" | "success" | "error";

export interface StatusDisplayOptions {
  duration?: number;
  autoHide?: boolean;
}

/**
 * Show a status message in a status element.
 */
export function showStatus(
  element: HTMLElement | null,
  message: string,
  type: StatusType = "info",
  options: StatusDisplayOptions = {}
): void {
  if (!element) {
    console.warn("Status element not found");
    return;
  }

  const { duration = 4000, autoHide = true } = options;

  element.textContent = message;
  element.className = `status ${type}`;

  if (autoHide) {
    setTimeout(() => {
      if (element) {
        element.textContent = "";
        element.className = "status";
      }
    }, duration);
  }
}
```

**Impact:**
- ✅ Reduces UI notification duplication
- ✅ Standardizes notification behavior
- ✅ Easy to enhance (e.g., animations, persistent notifications)

**Files to Update:**
- `ui/popup/PopupView.ts`
- `ui/options/options.ts`

---

## Priority Recommendations

### High Priority ⚠️

1. **Create shared error utilities** (`src/shared/utils/errorUtils.ts`)
   - Highest duplication (5+ functions)
   - Easy to implement
   - High impact on consistency

### Medium Priority

2. **Create message response handler** (`src/shared/messaging/messageResponseHandler.ts`)
   - Reduces duplication in 2 modules
   - Standardizes message error handling
   - Medium effort, good impact

3. **Create repository storage utilities** (`src/background/repositories/repositoryUtils.ts`)
   - Reduces Chrome storage boilerplate
   - Standardizes storage error handling
   - Medium effort, good impact

### Low Priority

4. **Create status display utility** (`ui/utils/statusDisplay.ts`)
   - Small duplication
   - Nice-to-have for consistency
   - Low effort, low impact

---

## Implementation Plan

### Phase 1: Error Utilities (High Priority)
1. Create `src/shared/utils/errorUtils.ts`
2. Update all modules to use shared utilities
3. Remove duplicate error functions
4. Test and verify

### Phase 2: Message Response Handler (Medium Priority)
1. Create `src/shared/messaging/messageResponseHandler.ts`
2. Update `content/messageClient.ts`
3. Update `ui/popup/PopupController.ts`
4. Test message sending/error handling

### Phase 3: Repository Utilities (Medium Priority)
1. Create `src/background/repositories/repositoryUtils.ts`
2. Refactor repositories to use utilities
3. Test storage operations
4. Verify migrations still work

### Phase 4: UI Utilities (Low Priority)
1. Create `ui/utils/statusDisplay.ts`
2. Update UI modules
3. Test notification display

---

## Benefits Summary

- ✅ **Reduced Code Duplication:** ~150+ lines of duplicate code eliminated
- ✅ **Improved Consistency:** Standardized error handling and patterns
- ✅ **Easier Maintenance:** Single source of truth for common operations
- ✅ **Better Testing:** Shared utilities can be tested once
- ✅ **Enhanced Features:** Easy to add features (logging, analytics) to shared code

---

## Conclusion

Several opportunities exist for generalization:

1. **Error handling** has the most duplication and highest priority
2. **Message response handling** has clear patterns that can be unified
3. **Repository storage operations** have boilerplate that can be extracted
4. **UI status display** has minor duplication that can be unified

These refactorings will improve code quality, reduce maintenance burden, and make the codebase more consistent.

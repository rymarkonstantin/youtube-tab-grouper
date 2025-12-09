# Message Catalog

Canonical reference for runtime messages exchanged between the popup, content script, and background service worker. Code-level types and helpers live in `src/shared/messages.js` (envelopes/validation) and `src/shared/metadata.js` (metadata normalization utilities).

## Envelope

All messages and responses include:
- `version`: protocol version (`1`)
- `requestId`: per-message correlation ID

Helpers attach these automatically and enforce version matching.

## Quick Reference

| Action | From → To | Request payload | Response payload | Notes |
|--------|-----------|-----------------|------------------|-------|
| `groupTab` | Popup/Content → Background | `{ action, category?, metadata? }` | `{ success, category?, color?, error? }` | `metadata` mirrors YouTube video details when provided. |
| `batchGroup` | Popup → Background | `{ action }` | `{ success, count?, error? }` | Groups all YouTube tabs in the current window. |
| `getSettings` | Content → Background | `{ action }` | `{ success, settings?, error? }` | Settings are returned with defaults merged. |
| `isTabGrouped` | Any → Background | `{ action }` | `{ grouped, error? }` | Returns a simple grouped flag; no `success` field. |
| `getVideoMetadata` | Background → Content | `{ action }` | `{ title, channel, description, keywords[], youtubeCategory? }` | Sent from the background to pull structured metadata from the page. |

## Shared Helpers (`src/shared/messages.js`)

- `MESSAGE_ACTIONS`: frozen set of action string constants used across the extension.
- `MESSAGE_CATALOG`: human-readable descriptions of each request/response pair.
- `validateRequest(action, payload)`: guards incoming messages; returns `{ valid, errors }`.
- `validateResponse(action, payload)`: validates outgoing responses; used for tests or debugging.
- `normalizeVideoMetadata(metadata)`: trims and standardizes metadata payloads (re-exported from `src/shared/metadata.js`).
- Response builders: `buildSuccessResponse`, `buildErrorResponse`, `buildValidationErrorResponse`, `buildGroupTabResponse`, `buildBatchGroupResponse`, `buildSettingsResponse`, `buildIsGroupedResponse`, `buildMetadataResponse`.
- Messaging helpers (`src/shared/messaging.js`): `sendMessageSafe` wraps `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage` with requestId + version + validation; `handleMessage` centralizes listener routing/validation and stamps responses with metadata.

### Usage Example

```javascript
import {
  MESSAGE_ACTIONS,
  validateRequest,
  buildGroupTabResponse,
  buildValidationErrorResponse
} from '../shared/messages.js';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === MESSAGE_ACTIONS.GROUP_TAB) {
    const { valid, errors } = validateRequest(msg.action, msg);
    if (!valid) {
      sendResponse(buildValidationErrorResponse(msg.action, errors));
      return true;
    }

    // ...perform grouping work...
    sendResponse(buildGroupTabResponse({ category: "Tech", color: "blue" }));
    return true;
  }

  return false;
});
```

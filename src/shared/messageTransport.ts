import {
  MESSAGE_ACTIONS,
  MessageAction,
  buildErrorResponse,
  buildValidationErrorResponse,
  validateRequest,
  validateResponse
} from "./messageContracts";
import type { HandleMessageOptions, MessageEnvelope, SendMessageOptions } from "./types";

export const MESSAGE_VERSION = 1;
export const DEFAULT_MESSAGE_TIMEOUT_MS = 5000;

export function generateRequestId(prefix = "req") {
  const rand = Math.random().toString(36).slice(2, 8);
  const time = Date.now().toString(36);
  return `${prefix}_${time}_${rand}`;
}

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

type Handler = (msg: Record<string, unknown>, sender: chrome.runtime.MessageSender) => unknown;

function withEnvelope(payload: Record<string, unknown> = {}, requestId?: string): MessageEnvelope {
  return {
    ...payload,
    requestId: requestId ?? generateRequestId("resp"),
    version: MESSAGE_VERSION,
    action: (payload as { action?: string }).action ?? ""
  };
}

export function envelopeResponse(payload: Record<string, unknown> = {}, requestId?: string): MessageEnvelope {
  return withEnvelope(payload, requestId || generateRequestId("resp"));
}

function buildVersionError(expected: number, received: unknown, requestId?: string) {
  const receivedLabel =
    typeof received === "string" || typeof received === "number" ? String(received) : "unknown";
  const message =
    received === undefined
      ? "Message version is required"
      : `Unsupported message version ${receivedLabel}; expected ${expected}`;
  return withEnvelope(buildErrorResponse(message, { expectedVersion: expected }), requestId || generateRequestId("resp"));
}

export function handleMessage(
  handlers: Partial<Record<MessageAction, Handler>> = {},
  options: HandleMessageOptions = {}
) {
  const { requireVersion = true, validateResponses = true, onUnknown } = options;

  return (msg: unknown, sender: chrome.runtime.MessageSender, sendResponse: (value: unknown) => void) => {
    const payload = isPlainObject(msg) ? msg : {};
    const action = typeof payload.action === "string" ? (payload.action as MessageAction) : undefined;
    const requestId = typeof payload.requestId === "string" ? payload.requestId : generateRequestId("resp");

    if (!action || !(action in handlers)) {
      if (typeof onUnknown === "function") {
        Promise.resolve(onUnknown(action ?? "", payload, sender))
          .then((result) => {
            if (result === false) return;
            const fallback = buildErrorResponse(`Unknown action "${action}"`);
            sendResponse(envelopeResponse((result as Record<string, unknown>) ?? fallback, requestId));
          })
          .catch((error) => {
            const message = (error as Error)?.message ?? "Unknown error";
            sendResponse(envelopeResponse(buildErrorResponse(message), requestId));
          });
        return true;
      }
      return false;
    }

    const incomingVersion = payload.version;

    if (requireVersion && incomingVersion !== MESSAGE_VERSION) {
      sendResponse(buildVersionError(MESSAGE_VERSION, incomingVersion, requestId));
      return true;
    }

    const requestValidation = validateRequest(action, payload);
    if (!requestValidation.valid) {
      sendResponse(envelopeResponse(buildValidationErrorResponse(action, requestValidation.errors), requestId));
      return true;
    }

    const handler = handlers[action];
    if (!handler) {
      return false;
    }

    Promise.resolve()
      .then(() => handler(payload, sender))
      .then((result) => {
        const responsePayload = isPlainObject(result) ? result : buildErrorResponse("Empty handler response");

        if (validateResponses) {
          const responseValidation = validateResponse(action, responsePayload);
          if (!responseValidation.valid) {
            sendResponse(envelopeResponse(buildValidationErrorResponse(action, responseValidation.errors), requestId));
            return;
          }
        }

        sendResponse(envelopeResponse(responsePayload, requestId));
      })
      .catch((error) => {
        const message = (error as Error)?.message ?? "Unknown error";
        sendResponse(envelopeResponse(buildErrorResponse(message), requestId));
      });

    return true;
  };
}

export function sendMessageSafe(
  action: MessageAction,
  payload: Record<string, unknown> = {},
  options: SendMessageOptions = {}
) {
  const {
    tabId,
    timeoutMs = DEFAULT_MESSAGE_TIMEOUT_MS,
    requestId = generateRequestId(),
    requireVersion = true,
    validateResponsePayload = true
  } = options;

  if (!Object.values(MESSAGE_ACTIONS).includes(action)) {
    return Promise.reject(new Error(`Unknown action "${action}"`));
  }

  const requestValidation = validateRequest(action, payload);
  if (!requestValidation.valid) {
    return Promise.reject(new Error(requestValidation.errors.join("; ")));
  }

  const message = withEnvelope({ ...payload, action }, requestId);

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (isNumber(timeoutMs) && timeoutMs > 0) {
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`Message timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }

    const finalize = (fn: (value: unknown) => void, value: unknown) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      fn(value);
    };

    const callback = (response: unknown) => {
      if (chrome.runtime.lastError) {
        finalize(reject, new Error(chrome.runtime.lastError.message));
        return;
      }

      if (requireVersion && isPlainObject(response)) {
        const receivedVersion = response.version;
        if (receivedVersion !== MESSAGE_VERSION) {
          const receivedLabel =
            typeof receivedVersion === "number" || typeof receivedVersion === "string"
              ? String(receivedVersion)
              : "unknown";
          finalize(reject, new Error(`Message version mismatch: expected ${MESSAGE_VERSION}, got ${receivedLabel}`));
          return;
        }
      }

      if (validateResponsePayload) {
        const responsePayload = isPlainObject(response) ? response : {};
        const responseValidation = validateResponse(action, responsePayload);
        if (!responseValidation.valid) {
          finalize(reject, new Error(responseValidation.errors.join("; ")));
          return;
        }
      }

      finalize(resolve, response);
    };

    try {
      if (isNumber(tabId)) {
        chrome.tabs.sendMessage(tabId, message, callback);
      } else {
        chrome.runtime.sendMessage(message, callback);
      }
    } catch (error) {
      finalize(reject, error);
    }
  });
}

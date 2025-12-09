/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-function-type */
/* eslint-disable @typescript-eslint/no-base-to-string */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
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
const isFunction = (value: unknown): value is Function => typeof value === "function";
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function withEnvelope(payload: unknown = {}, requestId?: string): MessageEnvelope {
  const base = isPlainObject(payload) ? payload : {};
  return {
    ...base,
    requestId: requestId ?? generateRequestId("resp"),
    version: MESSAGE_VERSION,
    action: (base as any).action ?? ""
  };
}

export function envelopeResponse(payload: unknown = {}, requestId?: string): MessageEnvelope {
  return withEnvelope(payload, requestId || generateRequestId("resp"));
}

function buildVersionError(expected: number, received: unknown, requestId?: string) {
  const message =
    received === undefined ? "Message version is required" : `Unsupported message version ${received}; expected ${expected}`;
  return withEnvelope(buildErrorResponse(message, { expectedVersion: expected }), requestId || generateRequestId("resp"));
}

/**
 * Wrap chrome.runtime.onMessage handling with validation + envelopes.
 * @param {Record<string, Function>} handlers
 * @param {HandleMessageOptions} [options]
 * @returns {(msg:any,sender:any,sendResponse:Function)=>boolean}
 */
export function handleMessage(
  handlers: Partial<Record<MessageAction, Function>> = {},
  options: HandleMessageOptions = {}
) {
  const { requireVersion = true, validateResponses = true, onUnknown } = options;

  return (msg: any, sender: any, sendResponse: Function) => {
    const action = msg?.action as MessageAction | undefined;
    const requestId = msg?.requestId || generateRequestId("resp");

    if (!action || !(action in handlers)) {
      if (isFunction(onUnknown)) {
        Promise.resolve(onUnknown(action as string, msg, sender))
          .then((result) => {
            if (result === false) return;
            const payload = result ?? buildErrorResponse(`Unknown action "${action}"`);
            sendResponse(envelopeResponse(payload, requestId));
          })
          .catch((error: any) => {
            sendResponse(envelopeResponse(buildErrorResponse(error?.message || "Unknown error"), requestId));
          });
        return true;
      }
      return false;
    }

    const incomingVersion = msg?.version;

    if (requireVersion && incomingVersion !== MESSAGE_VERSION) {
      sendResponse(buildVersionError(MESSAGE_VERSION, incomingVersion, requestId));
      return true;
    }

    const payload = msg && typeof msg === "object" ? (msg as Record<string, unknown>) : {};
    const requestValidation = validateRequest(action, payload);
    if (!requestValidation.valid) {
      sendResponse(envelopeResponse(buildValidationErrorResponse(action, requestValidation.errors), requestId));
      return true;
    }

    const handler = handlers[action];

    Promise.resolve()
      .then(() => handler(msg, sender))
      .then((result: any) => {
        const payload = result ?? buildErrorResponse("Empty handler response");

        if (validateResponses) {
          const responseValidation = validateResponse(action, payload);
          if (!responseValidation.valid) {
            sendResponse(envelopeResponse(buildValidationErrorResponse(action, responseValidation.errors), requestId));
            return;
          }
        }

        sendResponse(envelopeResponse(payload, requestId));
      })
      .catch((error: any) => {
        sendResponse(envelopeResponse(buildErrorResponse(error?.message || "Unknown error"), requestId));
      });

    return true;
  };
}

/**
 * Send a message with envelope, validation, and timeout handling.
 */
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

    const requestValidation = validateRequest(action, payload as Record<string, unknown>);
  if (!requestValidation.valid) {
    return Promise.reject(new Error(requestValidation.errors.join("; ")));
  }

  const message = withEnvelope({ ...payload, action }, requestId);

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: any = null;

    if (isNumber(timeoutMs) && timeoutMs > 0) {
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`Message timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }

    const finalize = (fn: Function, value: any) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      fn(value);
    };

    const callback = (response: any) => {
      if (chrome.runtime.lastError) {
        finalize(reject, new Error(chrome.runtime.lastError.message));
        return;
      }

      if (requireVersion && response?.version !== MESSAGE_VERSION) {
        finalize(reject, new Error(`Message version mismatch: expected ${MESSAGE_VERSION}, got ${response?.version}`));
        return;
      }

      if (validateResponsePayload) {
        const responseValidation = validateResponse(action, response || {});
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

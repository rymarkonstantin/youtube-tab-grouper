import { MessageAction, buildErrorResponse } from "./messageContracts";
import { MESSAGE_VERSION } from "./messaging/constants";
import {
  isPlainObject,
  validateIncomingRequest,
  validateIncomingResponse,
  validateOutgoingRequest
} from "./messaging/validators";
import type { HandleMessageOptions, MessageEnvelope, SendMessageOptions } from "./types";

export const DEFAULT_MESSAGE_TIMEOUT_MS = 5000;
export { MESSAGE_VERSION } from "./messaging/constants";

export function generateRequestId(prefix = "req") {
  const rand = Math.random().toString(36).slice(2, 8);
  const time = Date.now().toString(36);
  return `${prefix}_${time}_${rand}`;
}

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

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

export function handleMessage(
  handlers: Partial<Record<MessageAction, Handler>> = {},
  options: HandleMessageOptions = {}
) {
  const { requireVersion = true, validateResponses = true, onUnknown } = options;

  return (msg: unknown, sender: chrome.runtime.MessageSender, sendResponse: (value: unknown) => void) => {
    const payload = isPlainObject(msg) ? msg : {};
    const requestValidation = validateIncomingRequest(payload, { requireVersion });
    const action = requestValidation.ok ? requestValidation.value.action : undefined;
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
      if (requestValidation.ok === false) {
        sendResponse(envelopeResponse(requestValidation.response, requestId));
        return true;
      }
      return false;
    }

    if (requestValidation.ok === false) {
      sendResponse(envelopeResponse(requestValidation.response, requestId));
      return true;
    }

    const handler = handlers[action];
    if (!handler) {
      return false;
    }

    Promise.resolve()
      .then(() => handler(requestValidation.value.payload, sender))
      .then((result) => {
        const responsePayload = isPlainObject(result) ? result : buildErrorResponse("Empty handler response");

        if (validateResponses) {
          const responseValidation = validateIncomingResponse(action, responsePayload, {
            requireVersion: false,
            validatePayload: true
          });
          if (responseValidation.ok === false) {
            sendResponse(envelopeResponse(responseValidation.response, requestId));
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
    validateResponsePayload: shouldValidateResponsePayload = true
  } = options;

  const requestValidation = validateOutgoingRequest(action, payload);
  if (requestValidation.ok === false) {
    return Promise.reject(requestValidation.error);
  }

  const message = withEnvelope(
    { ...requestValidation.value.payload, action: requestValidation.value.action },
    requestId
  );

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

      const responseValidation = validateIncomingResponse(requestValidation.value.action, response, {
        requireVersion,
        validatePayload: shouldValidateResponsePayload
      });
      if (responseValidation.ok === false) {
        finalize(reject, responseValidation.error);
        return;
      }

      finalize(resolve, isPlainObject(response) ? { ...responseValidation.value } : response);
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

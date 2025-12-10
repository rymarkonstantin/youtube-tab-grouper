import { MESSAGE_ACTIONS, validateRequest, validateResponse } from "../messageContracts";
import { envelopeResponse, generateRequestId, MESSAGE_VERSION } from "../messageTransport";
import type { SendMessageOptions } from "../types";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export interface MessageClientOptions {
  requireVersion?: boolean;
  validateResponsePayload?: boolean;
  defaultTimeoutMs?: number;
}

export class MessageClient {
  private requireVersion: boolean;
  private validateResponsePayload: boolean;
  private defaultTimeoutMs: number;

  constructor(options: MessageClientOptions = {}) {
    this.requireVersion = options.requireVersion ?? true;
    this.validateResponsePayload = options.validateResponsePayload ?? true;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 5000;
  }

  async sendMessage(
    action: (typeof MESSAGE_ACTIONS)[keyof typeof MESSAGE_ACTIONS],
    payload: Record<string, unknown> = {},
    options: SendMessageOptions = {}
  ) {
    const {
      tabId,
      timeoutMs = this.defaultTimeoutMs,
      requestId = generateRequestId(),
      requireVersion = this.requireVersion,
      validateResponsePayload = this.validateResponsePayload
    } = options;

    if (!Object.values(MESSAGE_ACTIONS).includes(action)) {
      return Promise.reject(new Error(`Unknown action "${action}"`));
    }

    const requestValidation = validateRequest(action, payload);
    if (!requestValidation.valid) {
      return Promise.reject(new Error(requestValidation.errors.join("; ")));
    }

    const message = envelopeResponse({ ...payload, action }, requestId);

    return new Promise((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      if (typeof timeoutMs === "number" && timeoutMs > 0) {
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
        if (typeof tabId === "number") {
          chrome.tabs.sendMessage(tabId, message, callback);
        } else {
          chrome.runtime.sendMessage(message, callback);
        }
      } catch (error) {
        finalize(reject, error);
      }
    });
  }
}

export const defaultMessageClient = new MessageClient();

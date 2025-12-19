import { MESSAGE_ACTIONS } from "../messageContracts";
import { envelopeResponse, generateRequestId } from "../messageTransport";
import { isPlainObject, validateIncomingResponse, validateOutgoingRequest } from "./validators";
import type { SendMessageOptions } from "../types";

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
      validateResponsePayload: shouldValidateResponsePayload = this.validateResponsePayload
    } = options;

    const outgoingValidation = validateOutgoingRequest(action, payload);
    if (outgoingValidation.ok === false) {
      return Promise.reject(outgoingValidation.error);
    }

    const message = envelopeResponse(
      { ...outgoingValidation.value.payload, action: outgoingValidation.value.action },
      requestId
    );

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

        const validation = validateIncomingResponse(outgoingValidation.value.action, response, {
          requireVersion,
          validatePayload: shouldValidateResponsePayload
        });

        if (validation.ok === false) {
          finalize(reject, validation.error);
          return;
        }

        finalize(resolve, isPlainObject(response) ? { ...validation.value } : response);
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

import {
  MESSAGE_ACTIONS,
  buildErrorResponse,
  buildValidationErrorResponse,
  validateRequest,
  validateResponse
} from "../messageContracts";
import { envelopeResponse, generateRequestId, MESSAGE_VERSION } from "../messageTransport";
import type { HandleMessageOptions, MessageEnvelope } from "../types";

type Handler = (msg: Record<string, unknown>, sender: chrome.runtime.MessageSender) => unknown;

interface RouterOptions extends HandleMessageOptions {
  requireVersion?: boolean;
  validateResponses?: boolean;
  onUnknown?: (action: string, msg: unknown, sender: unknown) => unknown;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export class MessageRouter {
  private handlers: Partial<Record<string, Handler>>;
  private options: RouterOptions;

  constructor(handlers: Partial<Record<string, Handler>> = {}, options: RouterOptions = {}) {
    this.handlers = handlers;
    this.options = {
      requireVersion: options.requireVersion ?? true,
      validateResponses: options.validateResponses ?? true,
      onUnknown: options.onUnknown
    };
  }

  withHandlers(handlers: Partial<Record<string, Handler>>) {
    return new MessageRouter(handlers, this.options);
  }

  listener = (msg: unknown, sender: chrome.runtime.MessageSender, sendResponse: (value: unknown) => void) => {
    const payload = isPlainObject(msg) ? msg : {};
    const action = typeof payload.action === "string" ? payload.action : undefined;
    const requestId = typeof payload.requestId === "string" ? payload.requestId : generateRequestId("resp");

    const handler = action ? this.handlers[action] : undefined;
    if (!handler) {
      const { onUnknown } = this.options;
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

    if (!action) {
      return false;
    }

    const { requireVersion = true, validateResponses = true } = this.options;
    const incomingVersion = (payload as unknown as MessageEnvelope)?.version;

    if (requireVersion && incomingVersion !== MESSAGE_VERSION) {
      sendResponse(
        envelopeResponse(
          buildErrorResponse(
            incomingVersion === undefined
              ? "Message version is required"
              : `Unsupported message version ${String(incomingVersion)}; expected ${MESSAGE_VERSION}`
          ),
          requestId
        )
      );
      return true;
    }

    const requestValidation = validateRequest(action as (typeof MESSAGE_ACTIONS)[keyof typeof MESSAGE_ACTIONS], payload);
    if (!requestValidation.valid) {
      sendResponse(envelopeResponse(buildValidationErrorResponse(action as never, requestValidation.errors), requestId));
      return true;
    }

    Promise.resolve()
      .then(() => handler(payload, sender))
      .then((result) => {
        const responsePayload = isPlainObject(result) ? result : buildErrorResponse("Empty handler response");

        if (validateResponses) {
          const responseValidation = validateResponse(
            action as (typeof MESSAGE_ACTIONS)[keyof typeof MESSAGE_ACTIONS],
            responsePayload
          );
          if (!responseValidation.valid) {
            sendResponse(
              envelopeResponse(buildValidationErrorResponse(action as never, responseValidation.errors), requestId)
            );
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

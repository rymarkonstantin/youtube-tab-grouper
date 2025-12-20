import { buildErrorResponse } from "../messageContracts";
import { envelopeResponse, generateRequestId } from "../messageTransport";
import { isPlainObject, validateIncomingRequest, validateIncomingResponse } from "./validators";
import { toErrorEnvelope } from "../utils/errorUtils";
import type { HandleMessageOptions } from "../types";

export interface HandlerContext {
  action: string;
  msg: Record<string, unknown>;
  sender: chrome.runtime.MessageSender;
  state: Record<string, unknown>;
}

export type RouterMiddleware = (context: HandlerContext, next: () => Promise<unknown>) => unknown;

type Handler = (msg: Record<string, unknown>, sender: chrome.runtime.MessageSender, context: HandlerContext) => unknown;

interface RouterOptions extends HandleMessageOptions {
  requireVersion?: boolean;
  validateResponses?: boolean;
  middleware?: RouterMiddleware[];
  onUnknown?: (action: string, msg: unknown, sender: unknown) => unknown;
}

export class MessageRouter {
  private handlers: Partial<Record<string, Handler>>;
  private options: RouterOptions;

  constructor(handlers: Partial<Record<string, Handler>> = {}, options: RouterOptions = {}) {
    this.handlers = handlers;
    this.options = {
      requireVersion: options.requireVersion ?? true,
      validateResponses: options.validateResponses ?? true,
      middleware: options.middleware ?? [],
      onUnknown: options.onUnknown
    };
  }

  withHandlers(handlers: Partial<Record<string, Handler>>) {
    return new MessageRouter(handlers, this.options);
  }

  listener = (msg: unknown, sender: chrome.runtime.MessageSender, sendResponse: (value: unknown) => void) => {
    const payload = isPlainObject(msg) ? msg : {};
    const requestId = typeof payload.requestId === "string" ? payload.requestId : generateRequestId("resp");

    const requestValidation = validateIncomingRequest(payload, {
      requireVersion: this.options.requireVersion
    });
    const action = requestValidation.ok ? requestValidation.value.action : undefined;
    const handler = action ? this.handlers[action] : undefined;

    const wrapErrorPayload = (response: Record<string, unknown>, fallbackMessage = "Unknown error") => {
      if ("errorEnvelope" in response) return response;
      const normalizedMessage =
        typeof response.error === "string" && response.error.trim() ? response.error : fallbackMessage;
      const wrapped = toErrorEnvelope(normalizedMessage, {
        domain: "messaging",
        message: normalizedMessage,
        details: { action, requestId }
      });
      return { ...response, errorEnvelope: wrapped.envelope };
    };

    const respondWithError = (error: unknown, fallbackMessage = "Unknown error") => {
      const wrapped = toErrorEnvelope(error, {
        domain: "messaging",
        message: fallbackMessage,
        details: { action, requestId }
      });
      sendResponse(
        envelopeResponse(buildErrorResponse(wrapped.envelope.message, { errorEnvelope: wrapped.envelope }), requestId)
      );
    };

    if (!handler) {
      const { onUnknown } = this.options;
      if (typeof onUnknown === "function") {
        Promise.resolve(onUnknown(action ?? "", payload, sender))
          .then((result) => {
            if (result === false) return;
            const fallback = buildErrorResponse(`Unknown action "${action}"`);
            const responsePayload = wrapErrorPayload((result as Record<string, unknown>) ?? fallback, fallback.error);
            sendResponse(envelopeResponse(responsePayload, requestId));
          })
          .catch((error) => respondWithError(error, `Unknown action "${action}"`));
        return true;
      }
      if (requestValidation.ok === false) {
        sendResponse(envelopeResponse(wrapErrorPayload(requestValidation.response), requestId));
        return true;
      }
      return false;
    }

    if (!action) {
      return false;
    }

    const { validateResponses = true, middleware = [] } = this.options;

    if (requestValidation.ok === false) {
      sendResponse(envelopeResponse(wrapErrorPayload(requestValidation.response), requestId));
      return true;
    }

    const context: HandlerContext = {
      action,
      msg: requestValidation.ok ? requestValidation.value.payload : payload,
      sender,
      state: {}
    };

    const runMiddleware = (index: number): Promise<unknown> => {
      if (index < middleware.length) {
        return Promise.resolve(middleware[index](context, () => runMiddleware(index + 1)));
      }
      return Promise.resolve(handler(context.msg, sender, context));
    };

    Promise.resolve()
      .then(() => runMiddleware(0))
      .then((result) => {
        const responsePayload = isPlainObject(result) ? result : buildErrorResponse("Empty handler response");

        if (validateResponses) {
          const responseValidation = validateIncomingResponse(action, responsePayload, {
            requireVersion: false,
            validatePayload: true
          });
          if (responseValidation.ok === false) {
            const wrapped = wrapErrorPayload(responseValidation.response);
            sendResponse(envelopeResponse(wrapped, requestId));
            return;
          }
        }

        sendResponse(envelopeResponse(responsePayload, requestId));
      })
      .catch((error) => respondWithError(error, "Message handler failed"));

    return true;
  };
}

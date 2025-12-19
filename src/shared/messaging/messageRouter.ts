import { buildErrorResponse } from "../messageContracts";
import { envelopeResponse, generateRequestId } from "../messageTransport";
import { isPlainObject, validateIncomingRequest, validateIncomingResponse } from "./validators";
import type { HandleMessageOptions } from "../types";

export interface HandlerContext {
  action: string;
  msg: Record<string, unknown>;
  sender: chrome.runtime.MessageSender;
  state: Record<string, unknown>;
}

export type RouterMiddleware = (
  context: HandlerContext,
  next: () => Promise<unknown>
) => unknown;

type Handler = (
  msg: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
  context: HandlerContext
) => unknown;

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

    if (requestValidation.ok === false) {
      sendResponse(envelopeResponse(requestValidation.response, requestId));
      return true;
    }

    const action = requestValidation.value.action;
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

    const { validateResponses = true, middleware = [] } = this.options;

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

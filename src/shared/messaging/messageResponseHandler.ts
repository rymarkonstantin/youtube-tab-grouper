import { type MessageAction } from "../messageContracts";
import { validateIncomingResponse } from "./validators";
import {
  ERROR_CODES,
  type ErrorEnvelope,
  toErrorEnvelope,
  toErrorMessage
} from "../utils/errorUtils";

export interface MessageResponseOptions {
  timeoutMs?: number;
  validateResponse?: boolean;
}

export type ErrorishResponse = {
  success?: boolean;
  error?: string;
  errorEnvelope?: ErrorEnvelope;
  errors?: string[];
};

/**
 * Handle message response with validation and error normalization.
 *
 * This function standardizes error handling for message responses across
 * content scripts and UI pages, handling validation errors, timeouts,
 * and disabled extension states consistently.
 *
 * @param action - The message action that was sent
 * @param response - The response received (or null if error occurred)
 * @param error - The error that occurred (if any)
 * @param options - Options for response handling
 * @returns A normalized response with success/error structure
 *
 * @example
 * try {
 *   const response = await client.sendMessage(MESSAGE_ACTIONS.GROUP_TAB, {});
 *   return handleMessageResponse(MESSAGE_ACTIONS.GROUP_TAB, response, null, { timeoutMs: 5000 });
 * } catch (error) {
 *   return handleMessageResponse(MESSAGE_ACTIONS.GROUP_TAB, null, error, { timeoutMs: 5000 });
 * }
 */
export function handleMessageResponse<T extends ErrorishResponse>(
  action: MessageAction,
  response: unknown,
  error?: unknown,
  options: MessageResponseOptions = {}
): T {
  const { timeoutMs, validateResponse: shouldValidate = true } = options;

  const buildErrorPayload = (message: string, envelope?: ErrorEnvelope, extras: Record<string, unknown> = {}) =>
    ({
      success: false,
      error: message,
      ...(envelope ? { errorEnvelope: envelope } : {}),
      ...extras
    } as T);

  // Handle thrown errors
  if (error) {
    const normalized = toErrorEnvelope(error, { domain: "messaging", message: toErrorMessage(error) });
    let envelopeMessage = normalized.envelope.message;
    let code = normalized.envelope.code;

    if (/disabled/i.test(envelopeMessage)) {
      envelopeMessage = "Extension is disabled";
    } else if (/timed out/i.test(envelopeMessage) && timeoutMs) {
      envelopeMessage = `Message timed out after ${timeoutMs}ms`;
      code = ERROR_CODES.TIMEOUT;
    }

    const envelope: ErrorEnvelope = { ...normalized.envelope, message: envelopeMessage, code };
    return buildErrorPayload(envelopeMessage, envelope);
  }

  if (shouldValidate && response) {
    const validation = validateIncomingResponse(action, response, {
      requireVersion: false,
      validatePayload: true
    });

    if (validation.ok === false) {
      const envelope = toErrorEnvelope(validation.error, {
        domain: "messaging",
        code: ERROR_CODES.VALIDATION,
        message: validation.error.message || "Invalid response",
        details: validation.response
      }).envelope;
      return buildErrorPayload(envelope.message, envelope, { errors: validation.response.errors });
    }
  }

  const normalizedResponse = response as ErrorishResponse;
  if (
    normalizedResponse &&
    typeof normalizedResponse === "object" &&
    normalizedResponse.success === false &&
    normalizedResponse.errorEnvelope &&
    !normalizedResponse.error
  ) {
    normalizedResponse.error = normalizedResponse.errorEnvelope.message;
  }

  return normalizedResponse as T;
}

import {
  MESSAGE_ACTIONS,
  MessageAction,
  buildErrorResponse,
  buildValidationErrorResponse,
  validateRequest,
  validateResponse
} from "../messageContracts";
import { MESSAGE_VERSION } from "./constants";

export interface ValidationError extends Error {
  response?: Record<string, unknown>;
}

export interface ValidationFailure {
  ok: false;
  response: Record<string, unknown>;
  error: ValidationError;
}

export interface ValidationSuccess<T> {
  ok: true;
  value: T;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function toValidationFailure(response: Record<string, unknown>): ValidationFailure {
  const errorMessage =
    typeof response.error === "string" && response.error.trim() ? response.error.trim() : "Validation failed";
  const error = new Error(errorMessage) as ValidationError;
  error.response = response;
  return { ok: false, response, error };
}

export function validateAction(action: unknown): ValidationResult<MessageAction> {
  if (typeof action === "string" && Object.values(MESSAGE_ACTIONS).includes(action as MessageAction)) {
    return { ok: true, value: action as MessageAction };
  }

  const label = typeof action === "string" || typeof action === "number" ? String(action) : "undefined";
  return toValidationFailure(buildErrorResponse(`Unknown action "${label}"`));
}

export function validateVersion(version: unknown, requireVersion = true): ValidationResult<number> {
  if (!requireVersion) {
    return { ok: true, value: MESSAGE_VERSION };
  }

  if (version === MESSAGE_VERSION) {
    return { ok: true, value: MESSAGE_VERSION };
  }

  const receivedLabel = typeof version === "string" || typeof version === "number" ? String(version) : "unknown";
  const message =
    version === undefined
      ? "Message version is required"
      : `Unsupported message version ${receivedLabel}; expected ${MESSAGE_VERSION}`;

  return toValidationFailure(buildErrorResponse(message, { expectedVersion: MESSAGE_VERSION }));
}

export function validateRequestPayload(
  action: MessageAction,
  payload: unknown = {}
): ValidationResult<Record<string, unknown>> {
  const validation = validateRequest(action, payload as Record<string, unknown>);

  if (validation.valid) {
    return { ok: true, value: isPlainObject(payload) ? payload : {} };
  }

  return toValidationFailure(buildValidationErrorResponse(action, validation.errors));
}

export function validateResponsePayload(
  action: MessageAction,
  payload: unknown = {}
): ValidationResult<Record<string, unknown>> {
  const validation = validateResponse(action, payload as Record<string, unknown>);

  if (validation.valid) {
    return { ok: true, value: isPlainObject(payload) ? payload : {} };
  }

  return toValidationFailure(buildValidationErrorResponse(action, validation.errors));
}

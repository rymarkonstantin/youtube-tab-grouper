import {
  ERROR_CODES,
  type ErrorCode,
  type ErrorEnvelope,
  toErrorEnvelope,
  toErrorMessage
} from "../../src/shared/utils/errorUtils";
import { type StatusDisplayOptions, type StatusType, showStatus } from "./statusDisplay";

export interface StatusLike {
  success?: boolean;
  error?: string;
  errorEnvelope?: ErrorEnvelope;
  errors?: string[];
}

export interface StatusResolution {
  message: string;
  type: StatusType;
}

export interface StatusRenderOptions extends StatusDisplayOptions {
  successMessage?: string;
  errorFallback?: string;
  type?: StatusType;
}

const DEFAULT_ERROR_MESSAGE = "Something went wrong. Please try again.";

const ERROR_CODE_MESSAGES: Partial<Record<ErrorCode, string>> = {
  [ERROR_CODES.BAD_REQUEST]: "The request was invalid. Please try again.",
  [ERROR_CODES.UNAUTHORIZED]: "You need permission to continue.",
  [ERROR_CODES.FORBIDDEN]: "You don't have permission to do that.",
  [ERROR_CODES.NOT_FOUND]: "We couldn't find what you were looking for.",
  [ERROR_CODES.CONFLICT]: "Another action is in progress. Please retry.",
  [ERROR_CODES.TIMEOUT]: "The request timed out. Please try again.",
  [ERROR_CODES.RATE_LIMITED]: "Too many requests. Please wait and retry.",
  [ERROR_CODES.UNAVAILABLE]: "Service is temporarily unavailable. Please try again later.",
  [ERROR_CODES.MESSAGING]: "Couldn't reach the background page. Please refresh and try again.",
  [ERROR_CODES.SETTINGS]: "Settings are unavailable right now. Please retry.",
  [ERROR_CODES.STORAGE]: "Storage is temporarily unavailable.",
  [ERROR_CODES.TABS]: "Tab actions are unavailable right now.",
  [ERROR_CODES.RUNTIME]: "Something went wrong. Please try again.",
  [ERROR_CODES.VALIDATION]: "Please fix the highlighted issues and try again.",
  [ERROR_CODES.INTERNAL]: "Unexpected error occurred. Please try again."
};

const toStatusLike = (value: unknown): StatusLike => {
  if (
    value &&
    typeof value === "object" &&
    ("success" in value || "error" in value || "errorEnvelope" in value || "errors" in value)
  ) {
    return value as StatusLike;
  }

  return {
    success: false,
    errorEnvelope: toErrorEnvelope(value, { domain: "unknown", message: toErrorMessage(value) }).envelope
  };
};

const resolveErrorMessage = (status: StatusLike, fallback: string) => {
  const { errorEnvelope } = status;
  const codeMessage = errorEnvelope?.code ? ERROR_CODE_MESSAGES[errorEnvelope.code] : undefined;
  const baseMessage = codeMessage || errorEnvelope?.message || status.error || "";
  const details = Array.isArray(status.errors) ? status.errors.filter(Boolean) : [];
  const detailMessage = details.length > 0 ? details.join("; ") : "";
  const trimmedBase = baseMessage.trim();

  if (detailMessage) {
    return trimmedBase ? `${trimmedBase}: ${detailMessage}` : detailMessage;
  }

  return trimmedBase || fallback;
};

export function resolveStatus(value: unknown, options: StatusRenderOptions = {}): StatusResolution {
  const status = toStatusLike(value);
  const fallback = options.errorFallback ?? DEFAULT_ERROR_MESSAGE;

  if (status.success === true) {
    return {
      message: options.successMessage ?? "Done",
      type: options.type ?? "success"
    };
  }

  const message = resolveErrorMessage(status, fallback);
  return {
    message,
    type: options.type ?? "error"
  };
}

export function createStatusRenderer(element: HTMLElement | null) {
  return {
    render(value: unknown, options: StatusRenderOptions = {}) {
      const status = resolveStatus(value, options);
      showStatus(element, status.message, status.type, options);
      return status;
    },
    show(message: string, type: StatusType = "info", options: StatusDisplayOptions = {}) {
      showStatus(element, message, type, options);
    }
  };
}

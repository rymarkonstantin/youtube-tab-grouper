import { buildErrorResponse } from '../shared/messageContracts';

const PREFIX = "[yt-grouper]";

let debugEnabled = false;

export function setDebugLogging(enabled: unknown) {
    debugEnabled = Boolean(enabled);
}

const emit = (method: "info" | "warn" | "error" | "debug", ...args: unknown[]) => {
  if (typeof console?.[method] === "function") {
    console[method](PREFIX, ...args);
  }
};

export const logInfo = (...args: unknown[]) => emit("info", ...args);
export const logWarn = (...args: unknown[]) => emit("warn", ...args);
export const logError = (...args: unknown[]) => emit("error", ...args);
export const logDebug = (...args: unknown[]) => {
  if (!debugEnabled) return;
  emit("debug", ...args);
};

type EnvelopedError = Error & { envelope?: ReturnType<typeof buildErrorResponse> };

export function toErrorEnvelope(error: unknown, fallbackMessage = "Unknown error"): EnvelopedError {
  const message =
    typeof fallbackMessage === "string" && fallbackMessage
      ? fallbackMessage
      : (error as Error | undefined)?.message || "Unknown error";

  const normalized: EnvelopedError = error instanceof Error ? error : new Error(message);
  normalized.envelope = buildErrorResponse(message);
  return normalized;
}

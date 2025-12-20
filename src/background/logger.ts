import { createLogger } from "../shared/logging/logger";
import { type EnvelopedError, toErrorEnvelope as createErrorEnvelope } from "../shared/utils/errors";

const PREFIX = "[yt-grouper]";
const logger = createLogger({ prefix: PREFIX });

let debugEnabled = false;

export function setDebugLogging(enabled: unknown) {
  debugEnabled = Boolean(enabled);
  logger.setLevel(debugEnabled ? "debug" : "info");
}

export const logInfo = (...args: unknown[]) => logger.info(...args);
export const logWarn = (...args: unknown[]) => logger.warn(...args);
export const logError = (...args: unknown[]) => logger.error(...args);
export const logDebug = (...args: unknown[]) => {
  if (!debugEnabled) return;
  logger.debug(...args);
};

export const toErrorEnvelope = (error: unknown, fallbackMessage = "Unknown error"): EnvelopedError =>
  createErrorEnvelope(error, { message: fallbackMessage, domain: "runtime" });

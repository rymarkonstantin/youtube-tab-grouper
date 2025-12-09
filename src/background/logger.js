import { buildErrorResponse } from '../shared/messageContracts.js';

const PREFIX = "[yt-grouper]";

let debugEnabled = false;

export function setDebugLogging(enabled) {
    debugEnabled = Boolean(enabled);
}

const emit = (method, ...args) => {
    if (typeof console?.[method] === "function") {
        console[method](PREFIX, ...args);
    }
};

export const logInfo = (...args) => emit("info", ...args);
export const logWarn = (...args) => emit("warn", ...args);
export const logError = (...args) => emit("error", ...args);
export const logDebug = (...args) => {
    if (!debugEnabled) return;
    emit("debug", ...args);
};

export function toErrorEnvelope(error, fallbackMessage = "Unknown error") {
    const message = typeof fallbackMessage === 'string' && fallbackMessage
        ? fallbackMessage
        : (error?.message || "Unknown error");

    const normalized = error instanceof Error
        ? error
        : new Error(message);

    normalized.envelope = buildErrorResponse(message);
    return normalized;
}

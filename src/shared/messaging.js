import {
    MESSAGE_ACTIONS,
    validateRequest,
    validateResponse,
    buildErrorResponse,
    buildValidationErrorResponse
} from './messages.js';

export const MESSAGE_VERSION = 1;
export const DEFAULT_MESSAGE_TIMEOUT_MS = 5000;

export function generateRequestId(prefix = "req") {
    const rand = Math.random().toString(36).slice(2, 8);
    const time = Date.now().toString(36);
    return `${prefix}_${time}_${rand}`;
}

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isFunction = (value) => typeof value === 'function';

function withEnvelope(payload = {}, requestId) {
    return {
        ...payload,
        requestId,
        version: MESSAGE_VERSION
    };
}

function buildVersionError(expected, received, requestId) {
    const message = received === undefined
        ? "Message version is required"
        : `Unsupported message version ${received}; expected ${expected}`;
    return withEnvelope(buildErrorResponse(message, { expectedVersion: expected }), requestId);
}

export function handleMessage(handlers = {}, options = {}) {
    const {
        requireVersion = true,
        validateResponses = true
    } = options;

    return (msg, sender, sendResponse) => {
        const action = msg?.action;
        if (!action || !handlers[action]) {
            return false;
        }

        const requestId = msg?.requestId || generateRequestId("resp");
        const incomingVersion = msg?.version;

        if (requireVersion && incomingVersion !== MESSAGE_VERSION) {
            sendResponse(buildVersionError(MESSAGE_VERSION, incomingVersion, requestId));
            return true;
        }

        const requestValidation = validateRequest(action, msg || {});
        if (!requestValidation.valid) {
            sendResponse(withEnvelope(buildValidationErrorResponse(action, requestValidation.errors), requestId));
            return true;
        }

        const handler = handlers[action];

        Promise.resolve()
            .then(() => handler(msg, sender))
            .then((result) => {
                const payload = result ?? buildErrorResponse("Empty handler response");

                if (validateResponses) {
                    const responseValidation = validateResponse(action, payload);
                    if (!responseValidation.valid) {
                        sendResponse(withEnvelope(
                            buildValidationErrorResponse(action, responseValidation.errors),
                            requestId
                        ));
                        return;
                    }
                }

                sendResponse(withEnvelope(payload, requestId));
            })
            .catch((error) => {
                sendResponse(withEnvelope(buildErrorResponse(error?.message || "Unknown error"), requestId));
            });

        return true;
    };
}

export function sendMessageSafe(action, payload = {}, options = {}) {
    const {
        tabId,
        timeoutMs = DEFAULT_MESSAGE_TIMEOUT_MS,
        requestId = generateRequestId(),
        requireVersion = true,
        validateResponsePayload = true
    } = options;

    if (!Object.values(MESSAGE_ACTIONS).includes(action)) {
        return Promise.reject(new Error(`Unknown action "${action}"`));
    }

    const requestValidation = validateRequest(action, payload || {});
    if (!requestValidation.valid) {
        return Promise.reject(new Error(requestValidation.errors.join("; ")));
    }

    const message = withEnvelope({ ...payload, action }, requestId);

    return new Promise((resolve, reject) => {
        let settled = false;
        let timer = null;

        if (isNumber(timeoutMs) && timeoutMs > 0) {
            timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new Error(`Message timed out after ${timeoutMs}ms`));
            }, timeoutMs);
        }

        const finalize = (fn, value) => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            fn(value);
        };

        const callback = (response) => {
            if (chrome.runtime.lastError) {
                finalize(reject, new Error(chrome.runtime.lastError.message));
                return;
            }

            if (requireVersion && response?.version !== MESSAGE_VERSION) {
                finalize(reject, new Error(`Message version mismatch: expected ${MESSAGE_VERSION}, got ${response?.version}`));
                return;
            }

            if (validateResponsePayload) {
                const responseValidation = validateResponse(action, response || {});
                if (!responseValidation.valid) {
                    finalize(reject, new Error(responseValidation.errors.join("; ")));
                    return;
                }
            }

            finalize(resolve, response);
        };

        try {
            if (isNumber(tabId)) {
                chrome.tabs.sendMessage(tabId, message, callback);
            } else {
                chrome.runtime.sendMessage(message, callback);
            }
        } catch (error) {
            finalize(reject, error);
        }
    });
}

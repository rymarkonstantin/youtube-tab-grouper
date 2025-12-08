const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value) => typeof value === 'string';
const toTrimmedString = (value) => isString(value) ? value.trim() : '';

export const MESSAGE_ACTIONS = Object.freeze({
    GROUP_TAB: "groupTab",
    BATCH_GROUP: "batchGroup",
    GET_SETTINGS: "getSettings",
    IS_TAB_GROUPED: "isTabGrouped",
    GET_VIDEO_METADATA: "getVideoMetadata"
});

export const MESSAGE_CATALOG = Object.freeze({
    [MESSAGE_ACTIONS.GROUP_TAB]: {
        description: "Request the background worker to group the active YouTube tab.",
        request: {
            category: "Optional string override for the category.",
            metadata: "Optional video metadata payload to aid prediction."
        },
        response: {
            success: "Boolean success flag.",
            category: "Resolved category name.",
            color: "Assigned tab group color.",
            error: "Error message when grouping fails."
        }
    },
    [MESSAGE_ACTIONS.BATCH_GROUP]: {
        description: "Group all YouTube tabs in the current window.",
        request: {},
        response: {
            success: "Boolean success flag.",
            count: "Number of tabs successfully grouped.",
            error: "Error message when grouping fails."
        }
    },
    [MESSAGE_ACTIONS.GET_SETTINGS]: {
        description: "Read current settings from the background worker.",
        request: {},
        response: {
            success: "Boolean success flag.",
            settings: "Settings object (with defaults merged).",
            error: "Error message when retrieval fails."
        }
    },
    [MESSAGE_ACTIONS.IS_TAB_GROUPED]: {
        description: "Check if the active tab is already part of a group.",
        request: {},
        response: {
            grouped: "Boolean grouped flag.",
            error: "Error message when the check fails."
        }
    },
    [MESSAGE_ACTIONS.GET_VIDEO_METADATA]: {
        description: "Ask the content script to return parsed YouTube metadata.",
        request: {},
        response: {
            title: "Video title.",
            channel: "Channel name.",
            description: "Video description text.",
            keywords: "Array of keyword strings.",
            youtubeCategory: "Optional YouTube category identifier."
        }
    }
});

const REQUEST_SCHEMAS = Object.freeze({
    [MESSAGE_ACTIONS.GROUP_TAB]: {
        category: { type: "string", required: false, allowEmpty: true },
        metadata: { type: "metadata", required: false }
    },
    [MESSAGE_ACTIONS.BATCH_GROUP]: {},
    [MESSAGE_ACTIONS.GET_SETTINGS]: {},
    [MESSAGE_ACTIONS.IS_TAB_GROUPED]: {},
    [MESSAGE_ACTIONS.GET_VIDEO_METADATA]: {}
});

const RESPONSE_SCHEMAS = Object.freeze({
    [MESSAGE_ACTIONS.GROUP_TAB]: {
        success: { type: "boolean", required: true },
        category: { type: "string", required: false, allowEmpty: false },
        color: { type: "string", required: false, allowEmpty: false },
        error: { type: "string", required: false, allowEmpty: true }
    },
    [MESSAGE_ACTIONS.BATCH_GROUP]: {
        success: { type: "boolean", required: true },
        count: { type: "number", required: false },
        error: { type: "string", required: false, allowEmpty: true }
    },
    [MESSAGE_ACTIONS.GET_SETTINGS]: {
        success: { type: "boolean", required: true },
        settings: { type: "object", required: false },
        error: { type: "string", required: false, allowEmpty: true }
    },
    [MESSAGE_ACTIONS.IS_TAB_GROUPED]: {
        grouped: { type: "boolean", required: true },
        error: { type: "string", required: false, allowEmpty: true }
    },
    [MESSAGE_ACTIONS.GET_VIDEO_METADATA]: {}
});

function isVideoMetadata(value) {
    if (!isObject(value)) return false;

    const { title, channel, description, keywords, youtubeCategory } = value;
    const stringsAreValid = [title, channel, description].every(
        (field) => field === undefined || isString(field)
    );

    const keywordsAreValid = keywords === undefined
        || (Array.isArray(keywords) && keywords.every(isString));

    const categoryIsValid = youtubeCategory === undefined
        || youtubeCategory === null
        || isString(youtubeCategory)
        || typeof youtubeCategory === "number";

    return stringsAreValid && keywordsAreValid && categoryIsValid;
}

function validateFields(payload, schema, pathPrefix = "message") {
    const errors = [];

    if (!isObject(payload)) {
        errors.push(`${pathPrefix} must be an object`);
        return errors;
    }

    for (const [key, rule] of Object.entries(schema)) {
        const value = payload[key];
        const label = `${pathPrefix}.${key}`;

        if ((value === undefined || value === null) && rule.required) {
            errors.push(`${label} is required`);
            continue;
        }
        if (value === undefined || value === null) continue;

        switch (rule.type) {
            case "string":
                if (!isString(value)) {
                    errors.push(`${label} must be a string`);
                } else if (!rule.allowEmpty && value.trim() === "") {
                    errors.push(`${label} must not be empty`);
                }
                break;
            case "boolean":
                if (typeof value !== "boolean") {
                    errors.push(`${label} must be a boolean`);
                }
                break;
            case "number":
                if (typeof value !== "number" || Number.isNaN(value)) {
                    errors.push(`${label} must be a number`);
                }
                break;
            case "object":
                if (!isObject(value)) {
                    errors.push(`${label} must be an object`);
                }
                break;
            case "string[]":
                if (!Array.isArray(value) || !value.every(isString)) {
                    errors.push(`${label} must be an array of strings`);
                }
                break;
            case "metadata":
                if (!isVideoMetadata(value)) {
                    errors.push(`${label} must be a valid metadata payload`);
                }
                break;
            default:
                break;
        }
    }

    return errors;
}

export function validateRequest(action, payload = {}) {
    const errors = [];
    if (!Object.values(MESSAGE_ACTIONS).includes(action)) {
        errors.push(`Unknown action "${action}"`);
        return { valid: false, errors };
    }

    const schema = REQUEST_SCHEMAS[action] || {};
    errors.push(...validateFields(payload, schema, "message"));

    return { valid: errors.length === 0, errors };
}

export function validateResponse(action, payload = {}) {
    const errors = [];
    if (!Object.values(MESSAGE_ACTIONS).includes(action)) {
        errors.push(`Unknown action "${action}"`);
        return { valid: false, errors };
    }

    if (action === MESSAGE_ACTIONS.GET_VIDEO_METADATA) {
        if (!isVideoMetadata(payload)) {
            errors.push("response must be a valid metadata payload");
        }
        return { valid: errors.length === 0, errors };
    }

    const schema = RESPONSE_SCHEMAS[action] || {};
    errors.push(...validateFields(payload, schema, "response"));

    return { valid: errors.length === 0, errors };
}

export function normalizeVideoMetadata(metadata = {}) {
    const source = isObject(metadata) ? metadata : {};

    return {
        title: toTrimmedString(source.title),
        channel: toTrimmedString(source.channel),
        description: toTrimmedString(source.description),
        keywords: Array.isArray(source.keywords)
            ? source.keywords
                .map((item) => toTrimmedString(item))
                .filter((item) => item.length > 0)
            : [],
        youtubeCategory: source.youtubeCategory ?? null
    };
}

export function buildSuccessResponse(payload = {}) {
    return { ...payload, success: true };
}

export function buildErrorResponse(message, extras = {}) {
    const error = toTrimmedString(message) || "Unknown error";
    return { ...extras, success: false, error };
}

export function buildValidationErrorResponse(action, errors = []) {
    return buildErrorResponse(`Invalid ${action} payload`, { code: "bad_request", errors });
}

export function buildGroupTabResponse(data = {}, extras = {}) {
    const payload = {
        ...extras,
        category: toTrimmedString(data.category),
        color: toTrimmedString(data.color)
    };
    return buildSuccessResponse(payload);
}

export function buildBatchGroupResponse(count = 0, extras = {}) {
    const numeric = Number.isFinite(Number(count)) ? Math.floor(Number(count)) : 0;
    const safeCount = numeric < 0 ? 0 : numeric;
    return buildSuccessResponse({ ...extras, count: safeCount });
}

export function buildSettingsResponse(settings = {}, extras = {}) {
    const payload = { ...extras, settings: isObject(settings) ? settings : {} };
    return buildSuccessResponse(payload);
}

export function buildIsGroupedResponse(grouped, error) {
    const response = { grouped: Boolean(grouped) };
    if (error) {
        response.error = toTrimmedString(error) || "Unknown error";
    }
    return response;
}

export function buildMetadataResponse(metadata = {}, extras = {}) {
    const normalized = normalizeVideoMetadata(metadata);
    return { ...extras, ...normalized };
}

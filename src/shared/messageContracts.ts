import { isVideoMetadata, normalizeVideoMetadata } from "./metadataSchema.js";
import type { Metadata, GroupTabRequest, GroupTabResponse } from "./types.js";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const toTrimmedString = (value: unknown): string => (isString(value) ? value.trim() : "");

export const MESSAGE_ACTIONS = {
  GROUP_TAB: "groupTab",
  BATCH_GROUP: "batchGroup",
  GET_SETTINGS: "getSettings",
  IS_TAB_GROUPED: "isTabGrouped",
  GET_VIDEO_METADATA: "getVideoMetadata"
} as const;

export type MessageAction = (typeof MESSAGE_ACTIONS)[keyof typeof MESSAGE_ACTIONS];

export type MessageCatalog = Record<
  MessageAction,
  {
    description: string;
    request: Record<string, string>;
    response: Record<string, string>;
  }
>;

export const MESSAGE_CATALOG: MessageCatalog = {
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
};

type FieldType = "string" | "boolean" | "number" | "object" | "string[]" | "metadata";

interface FieldRule {
  type: FieldType;
  required?: boolean;
  allowEmpty?: boolean;
}

type ValidationSchema = Record<string, FieldRule>;

const REQUEST_SCHEMAS: Record<MessageAction, ValidationSchema> = {
  [MESSAGE_ACTIONS.GROUP_TAB]: {
    category: { type: "string", required: false, allowEmpty: true },
    metadata: { type: "metadata", required: false }
  },
  [MESSAGE_ACTIONS.BATCH_GROUP]: {},
  [MESSAGE_ACTIONS.GET_SETTINGS]: {},
  [MESSAGE_ACTIONS.IS_TAB_GROUPED]: {},
  [MESSAGE_ACTIONS.GET_VIDEO_METADATA]: {}
};

const RESPONSE_SCHEMAS: Record<MessageAction, ValidationSchema> = {
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
};

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function validateFields(payload: unknown, schema: ValidationSchema, pathPrefix = "message"): string[] {
  const errors: string[] = [];

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

export function validateRequest(action: MessageAction, payload: Partial<GroupTabRequest> = {}): ValidationResult {
  const errors: string[] = [];
  if (!Object.values(MESSAGE_ACTIONS).includes(action)) {
    errors.push(`Unknown action "${action}"`);
    return { valid: false, errors };
  }

  const schema = REQUEST_SCHEMAS[action] || {};
  errors.push(...validateFields(payload, schema, "message"));

  return { valid: errors.length === 0, errors };
}

export function validateResponse(action: MessageAction, payload: unknown = {}): ValidationResult {
  const errors: string[] = [];
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

export function buildSuccessResponse<T extends Record<string, unknown>>(payload: T = {} as T) {
  return { ...payload, success: true };
}

export function buildErrorResponse(message: unknown, extras: Record<string, unknown> = {}) {
  const error = toTrimmedString(message) || "Unknown error";
  return { ...extras, success: false, error };
}

export function buildValidationErrorResponse(action: MessageAction, errors: string[] = []) {
  return buildErrorResponse(`Invalid ${action} payload`, { code: "bad_request", errors });
}

export function buildGroupTabResponse(data: Partial<GroupTabResponse> = {}, extras: Record<string, unknown> = {}) {
  const payload = {
    ...extras,
    category: toTrimmedString(data.category),
    color: toTrimmedString(data.color)
  };
  return buildSuccessResponse(payload) as GroupTabResponse;
}

export function buildBatchGroupResponse(count: number = 0, extras: Record<string, unknown> = {}) {
  const numeric = Number.isFinite(Number(count)) ? Math.floor(Number(count)) : 0;
  const safeCount = numeric < 0 ? 0 : numeric;
  return buildSuccessResponse({ ...extras, count: safeCount });
}

export function buildSettingsResponse(settings: Record<string, unknown> = {}, extras: Record<string, unknown> = {}) {
  const payload = { ...extras, settings: isObject(settings) ? settings : {} };
  return buildSuccessResponse(payload);
}

export function buildIsGroupedResponse(grouped: boolean, error?: unknown) {
  const response: { grouped: boolean; error?: string } = { grouped: Boolean(grouped) };
  if (error) {
    response.error = toTrimmedString(error) || "Unknown error";
  }
  return response;
}

export function buildMetadataResponse(metadata: Partial<Metadata> = {}, extras: Record<string, unknown> = {}) {
  const normalized = normalizeVideoMetadata(metadata as Metadata);
  return { ...extras, ...normalized } as Metadata & typeof extras;
}

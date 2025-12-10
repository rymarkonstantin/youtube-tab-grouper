import { MESSAGE_ACTIONS, validateResponse } from "../shared/messageContracts";
import { MessageClient, defaultMessageClient } from "../shared/messaging/messageClient";
import type { GroupTabResponse, Metadata, MessageEnvelope, Settings } from "../shared/types";

interface GroupTabPayload extends Record<string, unknown> {
  category?: string;
  metadata?: Metadata;
}

const toGroupTabPayload = (categoryOrPayload: string | GroupTabPayload, metadata?: Metadata): GroupTabPayload => {
  if (categoryOrPayload && typeof categoryOrPayload === "object" && !Array.isArray(categoryOrPayload)) {
    return {
      ...categoryOrPayload,
      metadata: metadata ?? categoryOrPayload.metadata
    };
  }
  return { category: categoryOrPayload as string, metadata };
};

const timeoutResponse = (timeoutMs: number) => ({ success: false, error: `Message timed out after ${timeoutMs}ms` });
const disabledResponse = () => ({ success: false, error: "Extension is disabled" });

/**
 * Send a groupTab request from the content script.
 */
export async function sendGroupTab(
  categoryOrPayload: string | GroupTabPayload,
  metadata?: Metadata,
  options: { timeoutMs?: number; client?: MessageClient } = {}
): Promise<GroupTabResponse> {
  const { timeoutMs, client = defaultMessageClient } = options;
  try {
    const response = (await client.sendMessage(
      MESSAGE_ACTIONS.GROUP_TAB,
      toGroupTabPayload(categoryOrPayload, metadata),
      { timeoutMs, validateResponsePayload: true }
    )) as GroupTabResponse;

    const { valid, errors } = validateResponse(MESSAGE_ACTIONS.GROUP_TAB, response || {});
    if (!valid) {
      return { success: false, error: errors.join("; ") || "Invalid response" };
    }
    return response;
  } catch (error) {
    const message = (error as Error)?.message || "Unknown error";
    if (/disabled/i.test(message)) {
      return disabledResponse();
    }
    if (/timed out/i.test(message) && timeoutMs) {
      return timeoutResponse(timeoutMs);
    }
    return { success: false, error: message };
  }
}

/**
 * Fetch settings from background.
 */
export async function sendGetSettings(
  options: { timeoutMs?: number; client?: MessageClient } = {}
): Promise<{ success: boolean; settings?: Settings; error?: string }> {
  const { timeoutMs, client = defaultMessageClient } = options;
  try {
    const response = (await client.sendMessage(
      MESSAGE_ACTIONS.GET_SETTINGS,
      {},
      { timeoutMs, validateResponsePayload: true }
    )) as { success: boolean; settings?: Settings; error?: string };
    const { valid, errors } = validateResponse(MESSAGE_ACTIONS.GET_SETTINGS, response || {});
    if (!valid) {
      return { success: false, error: errors.join("; ") || "Invalid response" };
    }
    return response;
  } catch (error) {
    const message = (error as Error)?.message || "Unknown error";
    if (/disabled/i.test(message)) {
      return disabledResponse();
    }
    if (/timed out/i.test(message) && timeoutMs) {
      return timeoutResponse(timeoutMs);
    }
    return { success: false, error: message };
  }
}

/**
 * Check if the active tab is already grouped.
 */
export async function sendIsTabGrouped(
  options: { timeoutMs?: number; client?: MessageClient } = {}
): Promise<{ grouped: boolean; error?: string } & Partial<MessageEnvelope>> {
  const { timeoutMs, client = defaultMessageClient } = options;
  return client.sendMessage(MESSAGE_ACTIONS.IS_TAB_GROUPED, {}, { timeoutMs, validateResponsePayload: true }) as Promise<
    { grouped: boolean; error?: string } & Partial<MessageEnvelope>
  >;
}

// Messaging bridge moved to src/content/messaging/contentMessagingBridge.ts

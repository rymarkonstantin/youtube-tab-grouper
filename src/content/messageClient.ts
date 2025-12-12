import { MESSAGE_ACTIONS } from "../shared/messageContracts";
import { MessageClient, defaultMessageClient } from "../shared/messaging/messageClient";
import { handleMessageResponse } from "../shared/messaging/messageResponseHandler";
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
    const response = await client.sendMessage(
      MESSAGE_ACTIONS.GROUP_TAB,
      toGroupTabPayload(categoryOrPayload, metadata),
      { timeoutMs, validateResponsePayload: true }
    );
    return handleMessageResponse<GroupTabResponse>(
      MESSAGE_ACTIONS.GROUP_TAB,
      response,
      null,
      { timeoutMs, validateResponse: true }
    );
  } catch (error) {
    return handleMessageResponse<GroupTabResponse>(
      MESSAGE_ACTIONS.GROUP_TAB,
      null,
      error,
      { timeoutMs, validateResponse: false }
    );
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
    const response = await client.sendMessage(
      MESSAGE_ACTIONS.GET_SETTINGS,
      {},
      { timeoutMs, validateResponsePayload: true }
    );
    return handleMessageResponse<{ success: boolean; settings?: Settings; error?: string }>(
      MESSAGE_ACTIONS.GET_SETTINGS,
      response,
      null,
      { timeoutMs, validateResponse: true }
    );
  } catch (error) {
    return handleMessageResponse<{ success: boolean; settings?: Settings; error?: string }>(
      MESSAGE_ACTIONS.GET_SETTINGS,
      null,
      error,
      { timeoutMs, validateResponse: false }
    );
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

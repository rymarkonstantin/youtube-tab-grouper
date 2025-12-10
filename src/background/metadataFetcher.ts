import type { Metadata } from "../shared/types";
import { hasMetadataContent, mergeMetadata, normalizeVideoMetadata } from "../shared/metadataSchema";
import { MESSAGE_ACTIONS } from "../shared/messageContracts";
import { defaultMessageClient } from "../shared/messaging/messageClient";
import { logWarn } from "./logger";

const CONTENT_METADATA_TIMEOUTS_MS = [1200, 2000, 3200];
const CONTENT_METADATA_BACKOFF_MS = [150, 350];

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function requestContentMetadata(tabId: number, timeoutMs: number, fallbackTitle: string): Promise<Metadata> {
  const response = await defaultMessageClient.sendMessage(
    MESSAGE_ACTIONS.GET_VIDEO_METADATA,
    {},
    { tabId, timeoutMs }
  );
  return normalizeVideoMetadata(response as Partial<Metadata>, { fallbackTitle });
}

interface MetadataOptions {
  fallbackMetadata?: Partial<Metadata>;
  fallbackTitle?: string;
}

/**
 * Fetch metadata from content script with retries and merge with fallbacks.
 */
export async function getVideoMetadata(tabId: number, options: MetadataOptions = {}): Promise<Metadata> {
  const { fallbackMetadata = {}, fallbackTitle = "" } = options;
  let lastError: unknown = null;
  let attempts = 0;

  const attemptCount = CONTENT_METADATA_TIMEOUTS_MS.length;

  for (const timeoutMs of CONTENT_METADATA_TIMEOUTS_MS) {
    attempts += 1;
    try {
      const contentMetadata = await requestContentMetadata(tabId, timeoutMs, fallbackTitle);
      const merged = mergeMetadata(contentMetadata, fallbackMetadata);
      if (hasMetadataContent(merged)) {
        return merged;
      }
    } catch (error) {
      lastError = error;
    }

    const isLastAttempt = attempts >= attemptCount;
    const backoff = CONTENT_METADATA_BACKOFF_MS[Math.min(attempts - 1, CONTENT_METADATA_BACKOFF_MS.length - 1)];
    if (!isLastAttempt && backoff) {
      await delay(backoff);
    }
  }

  if (lastError) {
    logWarn("metadata:getVideoMetadata exhausted retries; returning fallback metadata", (lastError as Error)?.message || lastError);
  } else {
    logWarn("metadata:getVideoMetadata returning fallback metadata after empty content response");
  }

  return normalizeVideoMetadata(fallbackMetadata, { fallbackTitle });
}

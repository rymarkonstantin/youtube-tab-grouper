// TODO: Rename file to metadataService.ts to match the exported class.
import type { Metadata } from "../shared/types";
import { buildNormalizedMetadata, hasMetadataContent } from "../shared/metadataSchema";
import { MESSAGE_ACTIONS } from "../shared/messageContracts";
import { MessageClient, defaultMessageClient } from "../shared/messaging/messageClient";
import { logWarn } from "./logger";

const DEFAULT_CONTENT_TIMEOUTS_MS = [1200, 2000, 3200];
const DEFAULT_CONTENT_BACKOFF_MS = [150, 350];

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface MetadataOptions {
  fallbackMetadata?: Partial<Metadata>;
  fallbackTitle?: string;
  timeoutsMs?: number[];
  backoffMs?: number[];
  client?: MessageClient;
}

export class MetadataService {
  private client: MessageClient;
  private timeoutsMs: number[];
  private backoffMs: number[];

  constructor({
    client = defaultMessageClient,
    timeoutsMs = DEFAULT_CONTENT_TIMEOUTS_MS,
    backoffMs = DEFAULT_CONTENT_BACKOFF_MS
  }: {
    client?: MessageClient;
    timeoutsMs?: number[];
    backoffMs?: number[];
  } = {}) {
    this.client = client;
    this.timeoutsMs = timeoutsMs;
    this.backoffMs = backoffMs;
  }

  async getVideoMetadata(tabId: number, options: MetadataOptions = {}): Promise<Metadata> {
    const {
      fallbackMetadata = {},
      fallbackTitle = "",
      timeoutsMs = this.timeoutsMs,
      backoffMs = this.backoffMs,
      client = this.client
    } = options;

    let lastError: unknown = null;
    let attempts = 0;
    const attemptCount = timeoutsMs.length;

    const fallbackBase = { ...fallbackMetadata, title: fallbackTitle || fallbackMetadata?.title || "" };

    for (const timeoutMs of timeoutsMs) {
      attempts += 1;
      try {
        const contentMetadata = await this.requestContentMetadata(client, tabId, timeoutMs, fallbackBase.title);
        const merged = buildNormalizedMetadata(contentMetadata, fallbackBase);
        if (hasMetadataContent(merged)) {
          return merged;
        }
      } catch (error) {
        lastError = error;
      }

      const isLastAttempt = attempts >= attemptCount;
      const backoff = backoffMs[Math.min(attempts - 1, backoffMs.length - 1)];
      if (!isLastAttempt && backoff) {
        await delay(backoff);
      }
    }

    if (lastError) {
      logWarn(
        "metadata:service exhausted retries; returning fallback metadata",
        (lastError as Error)?.message || lastError
      );
    } else {
      logWarn("metadata:service returning fallback metadata after empty content response");
    }

    return buildNormalizedMetadata(fallbackMetadata, fallbackBase);
  }

  private async requestContentMetadata(
    client: MessageClient,
    tabId: number,
    timeoutMs: number,
    fallbackTitle: string
  ): Promise<Metadata> {
    const response = await client.sendMessage(
      MESSAGE_ACTIONS.GET_VIDEO_METADATA,
      {},
      { tabId, timeoutMs }
    );
    return buildNormalizedMetadata(response as Partial<Metadata>, { title: fallbackTitle });
  }
}

export const metadataService = new MetadataService();

// Backward-compatible helper
// TODO: Remove this alias once all call sites use MetadataService directly.
export const getVideoMetadata = (tabId: number, options: MetadataOptions = {}) =>
  metadataService.getVideoMetadata(tabId, options);

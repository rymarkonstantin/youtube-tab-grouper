import type { Settings } from "../../shared/types";
import { settingsRepository } from "../repositories/settingsRepository";
import { tabGroupingService } from "../tabGrouping";
import { runWithErrorHandling } from "../utils/ErrorHandling";

interface CleanupSchedulerOptions {
  intervalMs?: number;
  graceMs?: number;
}

export class CleanupScheduler {
  private intervalMs: number;
  private graceMs?: number;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private started = false;

  constructor(options: CleanupSchedulerOptions = {}) {
    this.intervalMs = options.intervalMs ?? 60000;
    this.graceMs = options.graceMs;
  }

  start() {
    if (this.started) return;
    this.started = true;

    chrome.tabGroups.onRemoved.addListener(this.handleGroupRemoved);
    chrome.tabGroups.onUpdated.addListener(this.handleGroupUpdated);

    this.intervalId = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
  }

  stop() {
    if (!this.started) return;
    this.started = false;

    chrome.tabGroups.onRemoved.removeListener(this.handleGroupRemoved);
    chrome.tabGroups.onUpdated.removeListener(this.handleGroupUpdated);

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private handleGroupRemoved = (group: chrome.tabGroups.TabGroup | { id: number }) => {
    void tabGroupingService.handleGroupRemoved(group.id);
  };

  private handleGroupUpdated = (group: chrome.tabGroups.TabGroup) => {
    void runWithErrorHandling(
      "cleanupScheduler:handleGroupUpdated",
      () => tabGroupingService.handleGroupUpdated(group),
      {
        fallbackMessage: "Failed to handle cleanup scheduler group update",
        mapError: () => undefined
      }
    );
  };

  private async tick(): Promise<void> {
    return runWithErrorHandling<void>(
      "cleanupScheduler:tick",
      async () => {
        const settings: Settings = await settingsRepository.get();
        if (!settings.autoCleanupEnabled) return;

        const grace = typeof this.graceMs === "number" ? this.graceMs : settings.autoCleanupGraceMs;
        await tabGroupingService.autoCleanupEmptyGroups(grace);
      },
      { fallbackMessage: "Failed to perform cleanup scheduler tick", mapError: () => undefined }
    );
  }
}

export const cleanupScheduler = new CleanupScheduler();

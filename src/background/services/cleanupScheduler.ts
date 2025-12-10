import { tabGroupingService } from "./tabGroupingService";
import { settingsRepository } from "../repositories/settingsRepository";
import { logWarn } from "../logger";
import type { Settings } from "../../shared/types";

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
    void (async () => {
      try {
        await tabGroupingService.handleGroupUpdated(group);
      } catch (error) {
        logWarn("cleanupScheduler:handleGroupUpdated failed", (error as Error)?.message || error);
      }
    })();
  };

  private async tick() {
    try {
      const settings: Settings = await settingsRepository.get();
      if (!settings.autoCleanupEnabled) return;

      const grace = typeof this.graceMs === "number" ? this.graceMs : settings.autoCleanupGraceMs;
      await tabGroupingService.autoCleanupEmptyGroups(grace);
    } catch (error) {
      logWarn("cleanupScheduler:tick failed", (error as Error)?.message || error);
    }
  }
}

export const cleanupScheduler = new CleanupScheduler();

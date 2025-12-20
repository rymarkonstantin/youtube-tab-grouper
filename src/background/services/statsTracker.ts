import { logWarn } from "../logger";
import type { StatsTrackerPort } from "../ports/tabGrouping";
import type { StatsService } from "../../shared/stats";
import { toErrorMessage } from "../../shared/utils/errorUtils";

export class StatsTracker implements StatsTrackerPort {
  constructor(private service: StatsService) {}

  async recordGroupingSuccess(category: string, durationMs?: number) {
    try {
      await this.service.recordGroupingResult({ category, durationMs, success: true });
    } catch (error) {
      logWarn("grouping:recordGroupingSuccess failed to persist stats", toErrorMessage(error));
    }
  }

  async recordGroupingFailure(durationMs?: number) {
    try {
      await this.service.recordGroupingResult({ durationMs, success: false });
    } catch (error) {
      logWarn("grouping:recordGroupingFailure failed to persist stats", toErrorMessage(error));
    }
  }
}

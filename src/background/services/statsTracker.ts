import { logWarn } from "../logger";
import type { StatsRepositoryPort, StatsTrackerPort } from "../ports/tabGrouping";
import { toErrorMessage } from "../../shared/utils/errorUtils";

export class StatsTracker implements StatsTrackerPort {
  constructor(private repository: StatsRepositoryPort) {}

  async recordGrouping(category: string) {
    const stats = await this.repository.get();
    stats.totalTabs = (stats.totalTabs || 0) + 1;
    stats.categoryCount[category] = (stats.categoryCount[category] || 0) + 1;

    try {
      await this.repository.save(stats);
    } catch (error) {
      logWarn("grouping:recordGroupingStats failed to persist stats", toErrorMessage(error));
    }
  }
}

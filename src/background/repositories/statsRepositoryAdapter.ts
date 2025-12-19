import { statsRepository } from "./statsRepository";
import type { StatsRepositoryPort } from "../ports/tabGrouping";

export class StatsRepositoryAdapter implements StatsRepositoryPort {
  constructor(private readonly repository = statsRepository) {}

  get() {
    return this.repository.get();
  }

  save(next: Parameters<StatsRepositoryPort["save"]>[0]) {
    return this.repository.save(next);
  }
}

export const statsRepositoryAdapter = new StatsRepositoryAdapter();

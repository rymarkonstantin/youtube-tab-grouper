import { groupStateRepository } from "./groupStateRepository";
import type { GroupStateRepositoryPort } from "../ports/tabGrouping";

export class GroupStateRepositoryAdapter implements GroupStateRepositoryPort {
  constructor(private readonly repository = groupStateRepository) {}

  get() {
    return this.repository.get();
  }

  save(groupColorMap: Record<string, string>, groupIdMap: Record<string, number>) {
    return this.repository.save(groupColorMap, groupIdMap);
  }
}

export const groupStateRepositoryAdapter = new GroupStateRepositoryAdapter();

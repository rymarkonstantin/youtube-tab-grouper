import { toErrorMessage } from "../../shared/utils/errorUtils";
import { logWarn } from "../logger";
import type { ColorAssignerPort, GroupStateCoordinatorPort, GroupStateRepositoryPort } from "../ports/tabGrouping";

export class GroupStateCoordinator implements GroupStateCoordinatorPort {
  private groupColorMap: Record<string, string> = {};
  private groupIdMap: Record<string, number> = {};

  constructor(
    private repository: GroupStateRepositoryPort,
    private colorAssigner: ColorAssignerPort
  ) {}

  async initialize() {
    const { groupColorMap, groupIdMap } = await this.repository.get();
    this.groupColorMap = { ...(groupColorMap || {}) };
    this.groupIdMap = { ...(groupIdMap || {}) };
    this.colorAssigner.setCache(this.groupColorMap);
  }

  async persist(category: string, groupId: number, color: string) {
    this.groupIdMap[category] = groupId;
    this.groupColorMap[category] = color;

    try {
      await this.repository.save(this.groupColorMap, this.groupIdMap);
      this.colorAssigner.setCache(this.groupColorMap);
    } catch (error) {
      const err = new Error(`Failed to persist grouping state: ${toErrorMessage(error)}`);
      (err as { cause?: unknown }).cause = error;
      throw err;
    }
  }

  async pruneGroup(groupId: number) {
    let mutated = false;
    for (const [name, id] of Object.entries(this.groupIdMap)) {
      if (id === groupId) {
        delete this.groupIdMap[name];
        delete this.groupColorMap[name];
        mutated = true;
      }
    }

    if (!mutated) return;

    try {
      await this.repository.save(this.groupColorMap, this.groupIdMap);
      this.colorAssigner.setCache(this.groupColorMap);
    } catch (error) {
      logWarn("grouping:pruneGroupState failed to persist", toErrorMessage(error));
    }
  }

  async applyGroupUpdate(group: chrome.tabGroups.TabGroup) {
    try {
      for (const [name, id] of Object.entries(this.groupIdMap)) {
        if (id === group.id && group.title && group.title !== name) {
          delete this.groupIdMap[name];
          delete this.groupColorMap[name];
          this.groupIdMap[group.title] = group.id;
          if (group.color) this.groupColorMap[group.title] = group.color;
        }
      }

      await this.repository.save(this.groupColorMap, this.groupIdMap);
      this.colorAssigner.setCache(this.groupColorMap);
    } catch (error) {
      logWarn("grouping:handleGroupUpdated failed to persist update", toErrorMessage(error));
    }
  }
}

import type { CleanupCoordinatorPort } from "../ports/tabGrouping";

export class CleanupCoordinator implements CleanupCoordinatorPort {
  private pendingCleanup = new Map<number, number>();

  markPending(groupId: number) {
    if (!this.pendingCleanup.has(groupId)) {
      this.pendingCleanup.set(groupId, Date.now());
    }
    return this.pendingCleanup.get(groupId);
  }

  clearPending(groupId: number) {
    this.pendingCleanup.delete(groupId);
  }

  getTimestamp(groupId: number) {
    return this.pendingCleanup.get(groupId);
  }
}

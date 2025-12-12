import { showStatus, type StatusType } from "../utils/statusDisplay";

export class PopupView {
  private groupButton = document.getElementById("groupButton") as HTMLButtonElement | null;
  private batchButton = document.getElementById("batchButton") as HTMLButtonElement | null;
  private categoryInput = document.getElementById("categoryInput") as HTMLInputElement | null;
  private statusEl = document.getElementById("status");

  bindGroup(handler: () => Promise<void> | void) {
    this.groupButton?.addEventListener("click", () => {
      void handler();
    });
  }

  bindBatch(handler: () => Promise<void> | void) {
    this.batchButton?.addEventListener("click", () => {
      void handler();
    });
  }

  getCategory(): string {
    return (this.categoryInput?.value || "").trim();
  }

  clearCategory() {
    if (this.categoryInput) this.categoryInput.value = "";
  }

  setLoading(loading: boolean) {
    if (this.groupButton) this.groupButton.disabled = loading;
    if (this.batchButton) this.batchButton.disabled = loading;
  }

  showNotification(message: string, type: StatusType = "info") {
    showStatus(this.statusEl, message, type);
  }
}

type StatusType = "info" | "success" | "error";

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
    if (!this.statusEl) return;
    this.statusEl.textContent = message;
    this.statusEl.className = `status ${type}`;

    setTimeout(() => {
      if (!this.statusEl) return;
      this.statusEl.textContent = "";
      this.statusEl.className = "status";
    }, 4000);
  }
}

import { isEnabled } from "../config";
import type { Settings } from "../../shared/types";

const toDelay = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
};

export class AutoGroupController {
  private timer: ReturnType<typeof setTimeout> | null = null;

  start(config: Settings, onGroup: () => Promise<void>) {
    this.cancel();

    if (!config || !isEnabled(config)) return;

    const delay = toDelay(config.autoGroupDelay);
    if (delay <= 0 || typeof onGroup !== "function") return;

    this.timer = setTimeout(() => {
      this.timer = null;
      Promise.resolve(onGroup()).catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "Unknown error";
        console.warn("Auto-group handler failed:", message);
      });
    }, delay);
  }

  cancel() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

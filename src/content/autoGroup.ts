import { isEnabled } from "./config";
import type { Settings } from "../shared/types";

let autoGroupTimer: ReturnType<typeof setTimeout> | null = null;

const toDelay = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
};

export function cancelAutoGroup() {
  if (autoGroupTimer) {
    clearTimeout(autoGroupTimer);
    autoGroupTimer = null;
  }
}

export function startAutoGroup({
  config,
  onGroup
}: { config?: Settings; onGroup?: () => Promise<void> } = {}) {
  cancelAutoGroup();

  if (!config || !isEnabled(config)) return null;

  const delay = toDelay(config.autoGroupDelay);
  if (delay <= 0 || typeof onGroup !== "function") return null;

  autoGroupTimer = setTimeout(() => {
    autoGroupTimer = null;
    Promise.resolve(onGroup())
      .catch((error) => {
        console.warn("Auto-group handler failed:", (error as Error)?.message || error);
      });
  }, delay);

  return autoGroupTimer;
}

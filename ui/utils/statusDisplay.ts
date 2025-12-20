/**
 * Status display utilities for showing user notifications in extension pages.
 */

export type StatusType = "info" | "success" | "error";

export interface StatusDisplayOptions {
  duration?: number;
  autoHide?: boolean;
}

/**
 * Show a status message in a status element.
 *
 * @param element - The HTML element to display the status in
 * @param message - The message to display
 * @param type - The status type (affects CSS class)
 * @param options - Display options (duration, auto-hide)
 *
 * @example
 * const statusEl = document.getElementById("status");
 * showStatus(statusEl, "Settings saved!", "success");
 */
export function showStatus(
  element: HTMLElement | null,
  message: string,
  type: StatusType = "info",
  options: StatusDisplayOptions = {}
): void {
  if (!element) {
    console.warn("Status element not found");
    return;
  }

  const { duration = 4000, autoHide = true } = options;

  element.textContent = message;
  element.className = `status ${type}`;

  if (autoHide) {
    setTimeout(() => {
      if (element) {
        element.textContent = "";
        element.className = "status";
      }
    }, duration);
  }
}

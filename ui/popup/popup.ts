import { MESSAGE_ACTIONS, validateResponse } from "../../src/shared/messageContracts";
import { sendMessageSafe } from "../../src/shared/messageTransport";
import type { GroupTabResponse } from "../../src/shared/types";

/**
 * YouTube Tab Grouper - Popup Script
 *
 * Uses typed messaging helpers with version/envelope support and guard-aware UI handling.
 */

const groupButton = document.getElementById("groupButton");
const batchButton = document.getElementById("batchButton");
const categoryInput = document.getElementById("categoryInput");
const statusEl = document.getElementById("status");
const buttons = [groupButton, batchButton].filter(Boolean) as HTMLButtonElement[];

const isGuardDisabled = (error: unknown) => typeof error === "string" && /disabled/i.test(error);

async function sendPopupMessage(
  action: (typeof MESSAGE_ACTIONS)[keyof typeof MESSAGE_ACTIONS],
  payload: Record<string, unknown> = {},
  { timeoutMs }: { timeoutMs?: number } = {}
): Promise<GroupTabResponse & Record<string, unknown>> {
  try {
    const response = await sendMessageSafe(action, payload, { timeoutMs, validateResponsePayload: true });
    const { valid, errors } = validateResponse(action, response || {});
    if (!valid) {
      return { success: false, error: errors.join("; ") || "Invalid response" };
        }
        return response;
    } catch (error) {
    const message = (error as Error)?.message || "Unknown error";
    if (/disabled/i.test(message)) {
      return { success: false, error: "Extension is disabled" };
    }
    if (/timed out/i.test(message) && timeoutMs) {
      return { success: false, error: `Message timed out after ${timeoutMs}ms` };
        }
        return { success: false, error: message };
    }
}

function handleGuard(response: GroupTabResponse) {
  if (response?.success === false && isGuardDisabled(response.error)) {
    buttons.forEach((btn) => {
      btn.disabled = true;
    });
    showNotification(`Error: ${response.error}`, "error");
    return true;
  }
  return false;
}

function formatError(response: GroupTabResponse & { errors?: string[] }) {
  if (!response) return "Unknown error";
  const base = response.error || "Unknown error";
  if (Array.isArray(response.errors) && response.errors.length > 0) {
    return `${base} (${response.errors.join("; ")})`;
  }
  return base;
}

groupButton?.addEventListener("click", () => {
  void (async () => {
    groupButton.disabled = true;

    try {
      const category = (categoryInput as HTMLInputElement | null)?.value.trim() || "";
      const response = await sendPopupMessage(MESSAGE_ACTIONS.GROUP_TAB, { category });

    if (response?.success) {
      showNotification(`Grouped as "${response.category}"`, "success");
      if (categoryInput) categoryInput.value = "";
    } else if (!handleGuard(response)) {
      showNotification(`Error: ${formatError(response)}`, "error");
    }
  } catch (error) {
    showNotification(`Error: ${(error as Error).message}`, "error");
    } finally {
      groupButton.disabled = false;
    }
  })();
});

batchButton?.addEventListener("click", () => {
  void (async () => {
    batchButton.disabled = true;

    try {
      const response = await sendPopupMessage(MESSAGE_ACTIONS.BATCH_GROUP);

    if (response?.success) {
      const count = typeof response.count === "number" ? response.count : Number(response.count) || 0;
      showNotification(`Grouped ${count} tabs`, "success");
    } else if (!handleGuard(response)) {
      showNotification(`Error: ${formatError(response)}`, "error");
    }
  } catch (error) {
    showNotification(`Error: ${(error as Error).message}`, "error");
    } finally {
      batchButton.disabled = false;
    }
  })();
});

function showNotification(message: string, type: "info" | "success" | "error" = "info") {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;

  setTimeout(() => {
    if (!statusEl) return;
    statusEl.textContent = "";
    statusEl.className = "status";
  }, 4000);
}

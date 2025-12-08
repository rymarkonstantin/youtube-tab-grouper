import { MESSAGE_ACTIONS } from '../../src/shared/messages.js';
import { sendMessageSafe } from '../../src/shared/messaging.js';

/**
 * YouTube Tab Grouper - Popup Script
 *
 * Uses typed messaging helpers with version/envelope support and guard-aware UI handling.
 */

const groupButton = document.getElementById("groupButton");
const batchButton = document.getElementById("batchButton");
const categoryInput = document.getElementById("categoryInput");
const statusEl = document.getElementById("status");
const buttons = [groupButton, batchButton];

const isGuardDisabled = (error) => typeof error === "string" && /disabled/i.test(error);

async function sendPopupMessage(action, payload = {}) {
    try {
        // Allow error envelopes (success:false) to flow through for guard-aware handling.
        return await sendMessageSafe(action, payload, { validateResponsePayload: false });
    } catch (error) {
        return { success: false, error: error?.message || "Unknown error" };
    }
}

function handleGuard(response) {
    if (response?.success === false && isGuardDisabled(response.error)) {
        buttons.forEach((btn) => { if (btn) btn.disabled = true; });
        showNotification(`’'?O ${response.error}`, "error");
        return true;
    }
    return false;
}

function formatError(response) {
    if (!response) return "Unknown error";
    const base = response.error || "Unknown error";
    if (Array.isArray(response.errors) && response.errors.length > 0) {
        return `${base} (${response.errors.join("; ")})`;
    }
    return base;
}

groupButton?.addEventListener("click", async () => {
    groupButton.disabled = true;

    try {
        const category = categoryInput.value.trim();
        const response = await sendPopupMessage(MESSAGE_ACTIONS.GROUP_TAB, { category });

        if (response?.success) {
            showNotification(`’'o. Grouped as "${response.category}"`, "success");
            categoryInput.value = "";
        } else if (!handleGuard(response)) {
            showNotification(`’'?O ${formatError(response)}`, "error");
        }
    } catch (error) {
        showNotification(`’'?O Error: ${error.message}`, "error");
    } finally {
        groupButton.disabled = false;
    }
});

batchButton?.addEventListener("click", async () => {
    batchButton.disabled = true;

    try {
        const response = await sendPopupMessage(MESSAGE_ACTIONS.BATCH_GROUP);

        if (response?.success) {
            showNotification(`’'o. Grouped ${response.count} tabs`, "success");
        } else if (!handleGuard(response)) {
            showNotification(`’'?O ${formatError(response)}`, "error");
        }
    } catch (error) {
        showNotification(`’'?O Error: ${error.message}`, "error");
    } finally {
        batchButton.disabled = false;
    }
});

function showNotification(message, type = "info") {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;

    setTimeout(() => {
        statusEl.textContent = "";
        statusEl.className = "status";
    }, 4000);
}

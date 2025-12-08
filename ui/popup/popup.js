import { MESSAGE_ACTIONS } from '../../src/shared/messages.js';
import { sendMessageSafe } from '../../src/shared/messaging.js';

/**
 * YouTube Tab Grouper - Popup Script
 * 
 * Handles user interactions in the extension popup:
 * - Group current tab
 * - Batch group all tabs
 * - Display status messages
 */

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const groupButton = document.getElementById("groupButton");
const batchButton = document.getElementById("batchButton");
const categoryInput = document.getElementById("categoryInput");
const statusEl = document.getElementById("status");

// ============================================================================
// EVENT LISTENERS
// ============================================================================

/**
 * Group current tab when button is clicked
 */
groupButton.addEventListener("click", async () => {
    groupButton.disabled = true;
    
    try {
        const category = categoryInput.value.trim();
        const response = await sendMessageSafe(MESSAGE_ACTIONS.GROUP_TAB, { category });

        if (response?.success) {
            showNotification(`ƒo. Grouped as "${response.category}"`, "success");
            categoryInput.value = "";
        } else {
            showNotification(`ƒ?O ${response?.error || "Failed to group"}`, "error");
        }
    } catch (error) {
        showNotification(`ƒ?O Error: ${error.message}`, "error");
    } finally {
        groupButton.disabled = false;
    }
});

/**
 * Batch group all YouTube tabs when button is clicked
 */
batchButton.addEventListener("click", async () => {
    batchButton.disabled = true;
    
    try {
        const response = await sendMessageSafe(MESSAGE_ACTIONS.BATCH_GROUP, {});

        if (response?.success) {
            showNotification(`ƒo. Grouped ${response.count} tabs`, "success");
        } else {
            showNotification(`ƒ?O ${response?.error || "Failed"}`, "error");
        }
    } catch (error) {
        showNotification(`ƒ?O Error: ${error.message}`, "error");
    } finally {
        batchButton.disabled = false;
    }
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Show notification message
 * @param {string} message - Message to display
 * @param {string} type - Type: success, error, info
 */
function showNotification(message, type = "info") {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    
    // Auto-hide after 4 seconds
    setTimeout(() => {
        statusEl.textContent = "";
        statusEl.className = "status";
    }, 4000);
}

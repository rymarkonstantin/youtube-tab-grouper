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
        
        chrome.runtime.sendMessage(
            { action: "groupTab", category },
            (response) => {
                if (response?.success) {
                    showNotification(`✅ Grouped as "${response.category}"`, "success");
                    categoryInput.value = "";
                } else {
                    showNotification(`❌ ${response?.error || "Failed to group"}`, "error");
                }
                groupButton.disabled = false;
            }
        );
    } catch (error) {
        showNotification(`❌ Error: ${error.message}`, "error");
        groupButton.disabled = false;
    }
});

/**
 * Batch group all YouTube tabs when button is clicked
 */
batchButton.addEventListener("click", async () => {
    batchButton.disabled = true;
    
    try {
        chrome.runtime.sendMessage(
            { action: "batchGroup" },
            (response) => {
                if (response?.success) {
                    showNotification(`✅ Grouped ${response.count} tabs`, "success");
                } else {
                    showNotification(`❌ ${response?.error || "Failed"}`, "error");
                }
                batchButton.disabled = false;
            }
        );
    } catch (error) {
        showNotification(`❌ Error: ${error.message}`, "error");
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

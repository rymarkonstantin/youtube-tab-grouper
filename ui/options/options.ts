import { AVAILABLE_COLORS, COLOR_HEX } from "../../src/shared/domain/colors";
import { getSettings, resetSettings, updateSettings, withSettingsDefaults } from "../../src/shared/settings";
import type { Settings } from "../../src/shared/types";
import { showStatus } from "../utils/statusDisplay";

/**
 * YouTube Tab Grouper - Settings Page
 * 
 * Manages user preferences:
 * - General settings (enable/disable, delays)
 * - Color preferences
 * - Category keywords
 * - Hashtag whitelist
 * - Channel-to-category mappings
 * - Import/export functionality
 */

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const extensionEnabledCheckbox = document.getElementById("extensionEnabled");
const aiCategoryDetectionCheckbox = document.getElementById("aiCategoryDetection");
const autoCleanupEnabledCheckbox = document.getElementById("autoCleanupEnabled");
const autoGroupDelayInput = document.getElementById("autoGroupDelay");
const allowedHashtagsTextarea = document.getElementById("allowedHashtags");
const colorTogglesContainer = document.getElementById("colorToggles");
const keywordsEditorContainer = document.getElementById("keywordsEditor");
const channelMappingsContainer = document.getElementById("channelMappings");
const addMappingBtn = document.getElementById("addMappingBtn");
const saveBtn = document.getElementById("saveBtn");
const resetBtn = document.getElementById("resetBtn");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const statusEl = document.getElementById("status");

// ============================================================================
// EVENT LISTENERS
// ============================================================================

document.addEventListener("DOMContentLoaded", () => { void initializeSettings(); });
saveBtn?.addEventListener("click", () => { void handleSaveSettings(); });
resetBtn?.addEventListener("click", () => { void handleResetSettings(); });
exportBtn?.addEventListener("click", () => { void handleExportSettings(); });
importBtn?.addEventListener("click", () => { void handleImportSettings(); });
addMappingBtn?.addEventListener("click", addChannelMapping);

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Load and display current settings
 */
async function initializeSettings() {
  const settings = await getSettings();

    // Load general settings
  const enabledEl = extensionEnabledCheckbox as HTMLInputElement | null;
  const aiEl = aiCategoryDetectionCheckbox as HTMLInputElement | null;
  const cleanupEl = autoCleanupEnabledCheckbox as HTMLInputElement | null;
  const delayEl = autoGroupDelayInput as HTMLInputElement | null;

  if (enabledEl) enabledEl.checked = settings.extensionEnabled !== false;
  if (aiEl) aiEl.checked = settings.aiCategoryDetection !== false;
  if (cleanupEl) cleanupEl.checked = settings.autoCleanupEnabled !== false;
  if (delayEl) delayEl.value = String(settings.autoGroupDelay || 2500);

    // Load hashtags
  const hashtagsEl = allowedHashtagsTextarea as HTMLTextAreaElement | null;
  if (hashtagsEl) {
    hashtagsEl.value = (settings.allowedHashtags || []).join(", ");
  }

    // Load color toggles
  displayColorToggles(settings.enabledColors);

    // Load category keywords
  displayCategoryKeywords(settings.categoryKeywords);

    // Load channel mappings
  displayChannelMappings(settings.channelCategoryMap || {});
}

// ============================================================================
// COLOR SETTINGS
// ============================================================================

/**
 * Display color toggle checkboxes
 */
function displayColorToggles(enabledColors: Record<string, boolean>) {
  if (!colorTogglesContainer) {
    console.warn("colorTogglesContainer not found");
    return;
  }

  colorTogglesContainer.innerHTML = "";

  AVAILABLE_COLORS.forEach((color) => {
    const label = document.createElement("label");
    label.className = "color-toggle";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = color;
    checkbox.checked = enabledColors[color] !== false;

    const span = document.createElement("span");
    span.className = "color-box";
    span.style.backgroundColor = COLOR_HEX[color];
    span.title = color;

    label.appendChild(checkbox);
    label.appendChild(span);
    colorTogglesContainer.appendChild(label);
  });
}

/**
 * Collect enabled colors from UI
 */
function getEnabledColorsFromUI() {
  const enabledColors: Record<string, boolean> = {};
  document.querySelectorAll<HTMLInputElement>('.color-toggle input[type="checkbox"]').forEach((checkbox) => {
    enabledColors[checkbox.value] = checkbox.checked;
  });
  return enabledColors;
}

// ============================================================================
// CATEGORY KEYWORDS
// ============================================================================

/**
 * Display category keywords editor
 *  NEW: Allows users to customize keywords
 */
function displayCategoryKeywords(categoryKeywords: Record<string, string[]>) {
  if (!keywordsEditorContainer) {
    console.warn("keywordsEditorContainer not found");
    return;
  }

  keywordsEditorContainer.innerHTML = "";

  Object.entries(categoryKeywords).forEach(([category, keywords]) => {
    const section = document.createElement("div");
    section.className = "keyword-section";

    const label = document.createElement("label");
    label.className = "keyword-label";
    label.textContent = category;

    const textarea = document.createElement("textarea");
    textarea.className = "keyword-textarea";
    textarea.placeholder = "Enter keywords separated by commas";
    textarea.value = keywords.join(", ");
    textarea.dataset.category = category;

    section.appendChild(label);
    section.appendChild(textarea);
    keywordsEditorContainer.appendChild(section);
  });
}

/**
 * Collect category keywords from UI
 */
function getCategoryKeywordsFromUI() {
  const keywords: Record<string, string[]> = {};

  document.querySelectorAll<HTMLTextAreaElement>(".keyword-textarea").forEach((textarea) => {
    const category = textarea.dataset.category || "";
    keywords[category] = textarea.value
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
  });

  return keywords;
}

// ============================================================================
// CHANNEL MAPPING
// ============================================================================

/**
 * Display channel mappings
 */
function displayChannelMappings(channelMap: Record<string, string>) {
  if (!channelMappingsContainer) {
    console.warn("channelMappingsContainer not found");
    return;
  }

  channelMappingsContainer.innerHTML = "";

  Object.entries(channelMap).forEach(([channel, category]) => {
    const mappingEl = createMappingElement(channel, category);
    channelMappingsContainer.appendChild(mappingEl);
  });
}

/**
 * Create a single channel mapping element
 */
function createMappingElement(channel: string, category: string) {
  const div = document.createElement("div");
  div.className = "mapping-item";

  const channelInput = document.createElement("input");
  channelInput.type = "text";
  channelInput.className = "channel-input";
  channelInput.value = channel;
  channelInput.placeholder = "Channel name";

  const categorySelect = document.createElement("select");
  categorySelect.className = "category-select";
  const categories = ["Gaming", "Music", "Tech", "Cooking", "Fitness", "Education", "News", "Entertainment", "Other"];

  categories.forEach((cat) => {
    const option = document.createElement("option");
    option.value = cat;
    option.textContent = cat;
    option.selected = category === cat;
    categorySelect.appendChild(option);
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn-delete";
  deleteBtn.innerHTML = "";
  deleteBtn.title = "Delete";
  deleteBtn.type = "button";
  deleteBtn.addEventListener("click", () => div.remove());

  div.appendChild(channelInput);
  div.appendChild(categorySelect);
  div.appendChild(deleteBtn);

  return div;
}

/**
 * Add new channel mapping row
 */
function addChannelMapping() {
  const mappingEl = createMappingElement("", "Other");
  channelMappingsContainer?.appendChild(mappingEl);
}

/**
 * Collect all channel mappings from UI
 */
function getChannelMappingsFromUI() {
  const mappings: Record<string, string> = {};

  document.querySelectorAll(".mapping-item").forEach((item) => {
    const channelInput = item.querySelector<HTMLInputElement>(".channel-input");
    const categorySelect = item.querySelector<HTMLSelectElement>(".category-select");
    const channel = channelInput?.value.trim() || "";
    const category = categorySelect?.value || "";

    if (channel) {
      mappings[channel] = category;
    }
  });

  return mappings;
}

// ============================================================================
// SAVE & RESET
// ============================================================================

/**
 * Save all settings
 *  FIX: Now includes categoryKeywords
 */
async function handleSaveSettings() {
  if (!(saveBtn instanceof HTMLButtonElement)) return;
  try {
    saveBtn.disabled = true;

    const settings: Partial<Settings> = {
      extensionEnabled: (extensionEnabledCheckbox as HTMLInputElement | null)?.checked ?? true,
      aiCategoryDetection: (aiCategoryDetectionCheckbox as HTMLInputElement | null)?.checked ?? true,
      autoCleanupEnabled: (autoCleanupEnabledCheckbox as HTMLInputElement | null)?.checked ?? true,
      autoGroupDelay: Number((autoGroupDelayInput as HTMLInputElement | null)?.value) || 2500,
      allowedHashtags:
        ((allowedHashtagsTextarea as HTMLTextAreaElement | null)?.value || "")
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      enabledColors: getEnabledColorsFromUI(),
      categoryKeywords: getCategoryKeywordsFromUI(),
      channelCategoryMap: getChannelMappingsFromUI()
    };

    await updateSettings(settings);
    showStatus(statusEl, "Settings saved successfully!", "success");
    console.log("Saved settings:", settings);
  } catch (error) {
    console.error("Error saving settings:", error);
    showStatus(statusEl, "Failed to save settings", "error");
  } finally {
    saveBtn.disabled = false;
  }
}

/**
 * Reset all settings to defaults
 */
async function handleResetSettings() {
  if (!(resetBtn instanceof HTMLButtonElement)) return;
  if (!confirm("Are you sure you want to reset all settings to defaults?\n\nThis cannot be undone.")) {
    return;
  }

  try {
    resetBtn.disabled = true;

    await resetSettings();

    await initializeSettings();

    showStatus(statusEl, "Settings reset to defaults", "success");
    console.log("Reset to defaults");
  } catch (error) {
    console.error("Error resetting settings:", error);
    showStatus(statusEl, "Failed to reset settings", "error");
  } finally {
    resetBtn.disabled = false;
  }
}

// ============================================================================
// IMPORT & EXPORT
// ============================================================================

/**
 * Export settings as JSON file
 */
async function handleExportSettings() {
  try {
    const settings = await getSettings();
    const dataStr = JSON.stringify(settings, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `youtube-tab-grouper-settings-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showStatus(statusEl, "Settings exported", "success");
  } catch (error) {
    console.error("Export error:", error);
    showStatus(statusEl, "Failed to export settings", "error");
  }
}

/**
 * Import settings from JSON file
 */
function handleImportSettings() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";

  input.addEventListener("change", (e) => {
    const file = (e.target as HTMLInputElement | null)?.files?.[0];
    if (!file) return;

    file
      .text()
      .then((text) => {
        const importedSettings = JSON.parse(text) as unknown;
        if (typeof importedSettings !== "object") {
          throw new Error("Invalid settings file");
        }
        return withSettingsDefaults(importedSettings as Partial<Settings>);
      })
      .then(async (settings) => {
        await resetSettings(settings);
        await initializeSettings();
        showStatus(statusEl, "Settings imported successfully", "success");
        console.log("Imported settings");
      })
      .catch((error) => {
        console.error("Import error:", error);
        showStatus(statusEl, "Failed to import settings", "error");
      });
  });

  input.click();
}

// ============================================================================
// UI UTILITIES
// ============================================================================

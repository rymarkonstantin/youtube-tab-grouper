import {
    AVAILABLE_COLORS,
    withSettingsDefaults,
    getSettings,
    updateSettings,
    resetSettings
} from '../../src/shared/settings.js';

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

/** Hex color codes for display */
const COLOR_HEX = {
    grey: "#9aa0a6", blue: "#4285F4", red: "#ea4335", yellow: "#fbbc04",
    green: "#34a853", pink: "#f538a0", purple: "#a142f4", cyan: "#24c6eb"
};

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const extensionEnabledCheckbox = document.getElementById('extensionEnabled');
const aiCategoryDetectionCheckbox = document.getElementById('aiCategoryDetection');
const autoCleanupEnabledCheckbox = document.getElementById('autoCleanupEnabled');
const autoGroupDelayInput = document.getElementById('autoGroupDelay');
const allowedHashtagsTextarea = document.getElementById('allowedHashtags');
const colorTogglesContainer = document.getElementById('colorToggles');
const keywordsEditorContainer = document.getElementById('keywordsEditor');
const channelMappingsContainer = document.getElementById('channelMappings');
const addMappingBtn = document.getElementById('addMappingBtn');
const saveBtn = document.getElementById('saveBtn');
const resetBtn = document.getElementById('resetBtn');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const statusEl = document.getElementById('status');

// ============================================================================
// EVENT LISTENERS
// ============================================================================

document.addEventListener('DOMContentLoaded', initializeSettings);
saveBtn.addEventListener('click', handleSaveSettings);
resetBtn.addEventListener('click', handleResetSettings);
exportBtn.addEventListener('click', handleExportSettings);
importBtn.addEventListener('click', handleImportSettings);
addMappingBtn.addEventListener('click', addChannelMapping);

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Load and display current settings
 */
async function initializeSettings() {
    const settings = await getSettings();

    // Load general settings
    extensionEnabledCheckbox.checked = settings.extensionEnabled !== false;
    aiCategoryDetectionCheckbox.checked = settings.aiCategoryDetection !== false;
    autoCleanupEnabledCheckbox.checked = settings.autoCleanupEnabled !== false;
    autoGroupDelayInput.value = settings.autoGroupDelay || 2500;

    // Load hashtags
    allowedHashtagsTextarea.value = (settings.allowedHashtags || []).join(', ');

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
function displayColorToggles(enabledColors) {
    if (!colorTogglesContainer) {
        console.warn(" colorTogglesContainer not found");
        return;
    }

    colorTogglesContainer.innerHTML = '';

    AVAILABLE_COLORS.forEach(color => {
        const label = document.createElement('label');
        label.className = 'color-toggle';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = color;
        checkbox.checked = enabledColors[color] !== false;
        
        const span = document.createElement('span');
        span.className = 'color-box';
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
    const enabledColors = {};
    document.querySelectorAll('.color-toggle input[type="checkbox"]').forEach(checkbox => {
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
function displayCategoryKeywords(categoryKeywords) {
    if (!keywordsEditorContainer) {
        console.warn(" keywordsEditorContainer not found");
        return;
    }

    keywordsEditorContainer.innerHTML = '';

    Object.entries(categoryKeywords).forEach(([category, keywords]) => {
        const section = document.createElement('div');
        section.className = 'keyword-section';

        const label = document.createElement('label');
        label.className = 'keyword-label';
        label.textContent = category;

        const textarea = document.createElement('textarea');
        textarea.className = 'keyword-textarea';
        textarea.placeholder = 'Enter keywords separated by commas';
        textarea.value = keywords.join(', ');
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
    const keywords = {};

    document.querySelectorAll('.keyword-textarea').forEach(textarea => {
        const category = textarea.dataset.category;
        keywords[category] = textarea.value
            .split(',')
            .map(k => k.trim())
            .filter(k => k.length > 0);
    });

    return keywords;
}

// ============================================================================
// CHANNEL MAPPING
// ============================================================================

/**
 * Display channel mappings
 */
function displayChannelMappings(channelMap) {
    if (!channelMappingsContainer) {
        console.warn(" channelMappingsContainer not found");
        return;
    }

    channelMappingsContainer.innerHTML = '';

    Object.entries(channelMap).forEach(([channel, category]) => {
        const mappingEl = createMappingElement(channel, category);
        channelMappingsContainer.appendChild(mappingEl);
    });
}

/**
 * Create a single channel mapping element
 */
function createMappingElement(channel, category) {
    const div = document.createElement('div');
    div.className = 'mapping-item';
    
    const channelInput = document.createElement('input');
    channelInput.type = 'text';
    channelInput.className = 'channel-input';
    channelInput.value = channel;
    channelInput.placeholder = 'Channel name';

    const categorySelect = document.createElement('select');
    categorySelect.className = 'category-select';
    const categories = ['Gaming', 'Music', 'Tech', 'Cooking', 'Fitness', 'Education', 'News', 'Entertainment', 'Other'];
    
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        option.selected = category === cat;
        categorySelect.appendChild(option);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.innerHTML = '';
    deleteBtn.title = 'Delete';
    deleteBtn.type = 'button';
    deleteBtn.addEventListener('click', () => div.remove());

    div.appendChild(channelInput);
    div.appendChild(categorySelect);
    div.appendChild(deleteBtn);

    return div;
}

/**
 * Add new channel mapping row
 */
function addChannelMapping() {
    const mappingEl = createMappingElement('', 'Other');
    channelMappingsContainer.appendChild(mappingEl);
}

/**
 * Collect all channel mappings from UI
 */
function getChannelMappingsFromUI() {
    const mappings = {};

    document.querySelectorAll('.mapping-item').forEach(item => {
        const channel = item.querySelector('.channel-input').value.trim();
        const category = item.querySelector('.category-select').value;

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
    try {
        saveBtn.disabled = true;

        const settings = {
            extensionEnabled: extensionEnabledCheckbox.checked,
            aiCategoryDetection: aiCategoryDetectionCheckbox.checked,
            autoCleanupEnabled: autoCleanupEnabledCheckbox.checked,
            autoGroupDelay: parseInt(autoGroupDelayInput.value) || 2500,
            allowedHashtags: allowedHashtagsTextarea.value
                .split(',')
                .map(tag => tag.trim())
                .filter(tag => tag.length > 0),
            enabledColors: getEnabledColorsFromUI(),
            categoryKeywords: getCategoryKeywordsFromUI(),
            channelCategoryMap: getChannelMappingsFromUI()
        };

        await saveSettings(settings);
        showStatus(' Settings saved successfully!', 'success');
        console.log(' Saved settings:', settings);

    } catch (error) {
        console.error(' Error saving settings:', error);
        showStatus(' Failed to save settings', 'error');
    } finally {
        saveBtn.disabled = false;
    }
}

/**
 * Reset all settings to defaults
 */
async function handleResetSettings() {
    if (!confirm(' Are you sure you want to reset all settings to defaults?\n\nThis cannot be undone.')) {
        return;
    }

    try {
        resetBtn.disabled = true;

        await resetSettings();

        // Reload UI with defaults
        await initializeSettings();

        showStatus(' Settings reset to defaults', 'success');
        console.log(' Reset to defaults');

    } catch (error) {
        console.error(' Error resetting settings:', error);
        showStatus(' Failed to reset settings', 'error');
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
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `youtube-tab-grouper-settings-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showStatus(' Settings exported', 'success');
    } catch (error) {
        console.error(' Export error:', error);
        showStatus(' Failed to export settings', 'error');
    }
}

/**
 * Import settings from JSON file
 */
async function handleImportSettings() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.addEventListener('change', async (e) => {
        try {
            const file = e.target.files[0];
            if (!file) return;

            const text = await file.text();
            const importedSettings = JSON.parse(text);

            // Validate imported settings
            if (typeof importedSettings !== 'object') {
                throw new Error('Invalid settings file');
            }

            // Merge with defaults to ensure all fields exist
            const settings = withSettingsDefaults(importedSettings);

            await saveSettings(settings);
            await initializeSettings();

            showStatus(' Settings imported successfully', 'success');
            console.log(' Imported settings');
        } catch (error) {
            console.error(' Import error:', error);
            showStatus(' Failed to import settings', 'error');
        }
    });

    input.click();
}

// ============================================================================
// UI UTILITIES
// ============================================================================

/**
 * Show status message
 */
function showStatus(message, type = 'info') {
    if (!statusEl) {
        console.warn(" statusEl not found");
        return;
    }

    statusEl.textContent = message;
    statusEl.className = `status ${type}`;

    setTimeout(() => {
        statusEl.textContent = '';
        statusEl.className = 'status';
    }, 4000);
}

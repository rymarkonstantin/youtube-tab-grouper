/**
 * YouTube Tab Grouper - Settings Page
 * 
 * Manages user preferences:
 * - General settings (enable/disable, delays)
 * - Color preferences
 * - Hashtag whitelist
 * - Channel-to-category mappings
 * - Import/export functionality
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default application settings
 * Used as fallback if storage is empty
 */
const DEFAULT_SETTINGS = {
    autoGroupDelay: 2500,
    allowedHashtags: ['tech', 'music', 'gaming', 'cooking', 'sports', 'education', 'news'],
    channelCategoryMap: {},
    extensionEnabled: true,
    aiCategoryDetection: true,
    autoCleanupEnabled: true,
    enabledColors: {
        grey: true, blue: true, red: true, yellow: true,
        green: true, pink: true, purple: true, cyan: true
    }
};

/** Available colors for tab groups */
const AVAILABLE_COLORS = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan"];

/** Hex color codes for display */
const COLOR_HEX = {
    grey: "#9aa0a6", blue: "#4285F4", red: "#ea4335", yellow: "#fbbc04",
    green: "#34a853", pink: "#f538a0", purple: "#a142f4", cyan: "#24c6eb"
};

// ============================================================================
// STORAGE UTILITIES
// ============================================================================

/**
 * Load user settings from chrome.storage.sync
 * @async
 * @returns {Promise<Object>} User settings
 */
async function loadSettings() {
    return new Promise(resolve => {
        chrome.storage.sync.get(DEFAULT_SETTINGS, resolve);
    });
}

/**
 * Save user settings to chrome.storage.sync
 * @async
 * @param {Object} settings - Settings to save
 * @returns {Promise<void>}
 */
async function saveSettings(settings) {
    return new Promise(resolve => {
        chrome.storage.sync.set(settings, resolve);
    });
}

// ============================================================================
// UI POPULATION FUNCTIONS
// ============================================================================

/**
 * Load settings and populate form with current values
 * Called on page load
 */
document.addEventListener('DOMContentLoaded', async () => {
    const settings = await loadSettings();
    populateForm(settings);
    populateColorToggles(settings.enabledColors);
    loadChannelMappings();
});

/**
 * Fill form inputs with current settings
 * @param {Object} settings - User settings
 */
function populateForm(settings) {
    // Basic settings
    document.getElementById('autoGroupDelay').value = settings.autoGroupDelay;
    document.getElementById('allowedHashtags').value = settings.allowedHashtags.join(', ');
    document.getElementById('extensionEnabled').checked = settings.extensionEnabled;
    document.getElementById('aiCategoryDetection').checked = settings.aiCategoryDetection;
    document.getElementById('autoCleanupEnabled').checked = settings.autoCleanupEnabled;
}

/**
 * Create color toggle switches
 * @param {Object} enabledColors - Color enabled state
 */
function populateColorToggles(enabledColors) {
    const container = document.getElementById('colorToggles');
    container.innerHTML = '';

    AVAILABLE_COLORS.forEach(color => {
        const label = document.createElement('label');
        label.className = 'color-toggle';
        label.innerHTML = `
            <input type="checkbox" class="color-checkbox" value="${color}" 
                ${enabledColors[color] ? 'checked' : ''}>
            <span class="color-swatch" 
                style="background-color: ${COLOR_HEX[color]}"></span>
            <span class="color-name">${color}</span>
        `;
        container.appendChild(label);
    });
}

/**
 * Load and display channel mappings
 */
async function loadChannelMappings() {
    const settings = await loadSettings();
    const mappings = settings.channelCategoryMap || {};
    const container = document.getElementById('channelMappings');
    
    container.innerHTML = '';
    
    Object.entries(mappings).forEach(([channel, category]) => {
        const mappingEl = createMappingElement(channel, category);
        container.appendChild(mappingEl);
    });
}

/**
 * Create a single channel mapping element
 */
function createMappingElement(channel, category) {
    const div = document.createElement('div');
    div.className = 'mapping-item';
    div.innerHTML = `
        <input type="text" class="channel-input" value="${channel}" placeholder="Channel name">
        <select class="category-select">
            <option value="Gaming" ${category === 'Gaming' ? 'selected' : ''}>Gaming</option>
            <option value="Music" ${category === 'Music' ? 'selected' : ''}>Music</option>
            <option value="Tech" ${category === 'Tech' ? 'selected' : ''}>Tech</option>
            <option value="Cooking" ${category === 'Cooking' ? 'selected' : ''}>Cooking</option>
            <option value="Fitness" ${category === 'Fitness' ? 'selected' : ''}>Fitness</option>
            <option value="Education" ${category === 'Education' ? 'selected' : ''}>Education</option>
            <option value="News" ${category === 'News' ? 'selected' : ''}>News</option>
            <option value="Entertainment" ${category === 'Entertainment' ? 'selected' : ''}>Entertainment</option>
            <option value="Other" ${category === 'Other' ? 'selected' : ''}>Other</option>
        </select>
        <button class="btn-delete" title="Delete">🗑️</button>
    `;
    
    // Delete handler
    div.querySelector('.btn-delete').addEventListener('click', () => {
        div.remove();
    });
    
    return div;
}

// ============================================================================
// EVENT LISTENERS - ACTION BUTTONS
// ============================================================================

/**
 * Save button: Collect form data and persist to storage
 */
document.getElementById('saveBtn').addEventListener('click', async () => {
    const settings = {
        autoGroupDelay: parseInt(document.getElementById('autoGroupDelay').value),
        allowedHashtags: document.getElementById('allowedHashtags').value
            .split(',')
            .map(h => h.trim().toLowerCase())
            .filter(Boolean),
        extensionEnabled: document.getElementById('extensionEnabled').checked,
        aiCategoryDetection: document.getElementById('aiCategoryDetection').checked,
        autoCleanupEnabled: document.getElementById('autoCleanupEnabled').checked,
        enabledColors: {},
        channelCategoryMap: {}
    };

    // Collect enabled colors
    document.querySelectorAll('.color-checkbox').forEach(checkbox => {
        settings.enabledColors[checkbox.value] = checkbox.checked;
    });

    // Collect channel mappings
    document.querySelectorAll('.mapping-item').forEach(item => {
        const channel = item.querySelector('.channel-input').value.trim();
        const category = item.querySelector('.category-select').value;
        if (channel) {
            settings.channelCategoryMap[channel] = category;
        }
    });

    await saveSettings(settings);
    showStatus('✓ Settings saved successfully!', 'success');
});

/**
 * Reset button: Restore default settings
 */
document.getElementById('resetBtn').addEventListener('click', async () => {
    if (confirm('⚠️ Reset to default settings? This cannot be undone.')) {
        await saveSettings(DEFAULT_SETTINGS);
        populateForm(DEFAULT_SETTINGS);
        populateColorToggles(DEFAULT_SETTINGS.enabledColors);
        loadChannelMappings();
        showStatus('✓ Settings reset to default!', 'success');
    }
});

/**
 * Add mapping button: Add new channel→category row
 */
document.getElementById('addMappingBtn').addEventListener('click', () => {
    const container = document.getElementById('channelMappings');
    const mappingEl = createMappingElement('', 'Other');
    container.appendChild(mappingEl);
});

/**
 * Export button: Download settings as JSON file
 */
document.getElementById('exportBtn').addEventListener('click', async () => {
    const settings = await loadSettings();
    const json = JSON.stringify(settings, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `youtube-grouper-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    showStatus('✓ Settings exported!', 'success');
});

/**
 * Import button: Load settings from JSON file
 */
document.getElementById('importBtn').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        try {
            const file = e.target.files[0];
            const text = await file.text();
            const settings = JSON.parse(text);
            await saveSettings(settings);
            populateForm(settings);
            populateColorToggles(settings.enabledColors);
            loadChannelMappings();
            showStatus('✓ Settings imported successfully!', 'success');
        } catch (error) {
            showStatus('✗ Failed to import: ' + error.message, 'error');
        }
    };
    input.click();
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Show status message to user
 * @param {string} msg - Message text
 * @param {string} [type='info'] - Message type (success/error/info)
 */
function showStatus(msg, type = 'info') {
    const el = document.getElementById('status');
    el.textContent = msg;
    el.className = `status ${type}`;
    setTimeout(() => el.textContent = '', 4000);
}
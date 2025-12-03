// Default settings
const DEFAULT_SETTINGS = {
    autoGroupDelay: 2500,
    allowedHashtags: ['tech', 'music', 'gaming', 'cooking', 'sports', 'education', 'news'],
    channelCategoryMap: {
        "Gordon Ramsay": "Cooking",
        "MKBHD": "Tech",
        "PewDiePie": "Gaming"
    },
    extensionEnabled: true
};

// Load settings on page load
document.addEventListener('DOMContentLoaded', async () => {
    const settings = await loadSettings();
    populateForm(settings);
});

/**
 * Load settings from storage
 */
async function loadSettings() {
    return new Promise(resolve => {
        chrome.storage.sync.get(DEFAULT_SETTINGS, resolve);
    });
}

/**
 * Save settings to storage
 */
async function saveSettings(settings) {
    return new Promise(resolve => {
        chrome.storage.sync.set(settings, resolve);
    });
}

/**
 * Populate form with current settings
 */
function populateForm(settings) {
    document.getElementById('autoGroupDelay').value = settings.autoGroupDelay;
    document.getElementById('allowedHashtags').value = settings.allowedHashtags.join(', ');
    document.getElementById('extensionEnabled').checked = settings.extensionEnabled;

    // Populate channel mappings
    const container = document.getElementById('channelMappings');
    container.innerHTML = '';
    Object.entries(settings.channelCategoryMap).forEach(([channel, category]) => {
        addMappingRow(channel, category, container);
    });
}

/**
 * Add a channel→category mapping row
 */
function addMappingRow(channel = '', category = '', container = null) {
    container = container || document.getElementById('channelMappings');
    const row = document.createElement('div');
    row.className = 'mapping-row';
    row.innerHTML = `
        <input type="text" class="channel-input" placeholder="Channel name" value="${channel}">
        <span>→</span>
        <input type="text" class="category-input" placeholder="Category" value="${category}">
        <button class="remove-btn">✕</button>
    `;
    row.querySelector('.remove-btn').addEventListener('click', () => row.remove());
    container.appendChild(row);
}

// Save button
document.getElementById('saveBtn').addEventListener('click', async () => {
    const settings = {
        autoGroupDelay: parseInt(document.getElementById('autoGroupDelay').value),
        allowedHashtags: document.getElementById('allowedHashtags').value
            .split(',')
            .map(h => h.trim().toLowerCase())
            .filter(Boolean),
        channelCategoryMap: {},
        extensionEnabled: document.getElementById('extensionEnabled').checked
    };

    // Collect channel mappings
    document.querySelectorAll('.mapping-row').forEach(row => {
        const channel = row.querySelector('.channel-input').value.trim();
        const category = row.querySelector('.category-input').value.trim();
        if (channel && category) {
            settings.channelCategoryMap[channel] = category;
        }
    });

    await saveSettings(settings);
    showStatus('✓ Settings saved!', 'success');
});

// Reset button
document.getElementById('resetBtn').addEventListener('click', async () => {
    if (confirm('Reset to default settings?')) {
        await saveSettings(DEFAULT_SETTINGS);
        populateForm(DEFAULT_SETTINGS);
        showStatus('✓ Settings reset!', 'success');
    }
});

// Add mapping button
document.getElementById('addMappingBtn').addEventListener('click', () => {
    addMappingRow();
});

// Status message
function showStatus(msg, type = 'info') {
    const el = document.getElementById('status');
    el.textContent = msg;
    el.className = `status ${type}`;
    setTimeout(() => el.textContent = '', 3000);
}
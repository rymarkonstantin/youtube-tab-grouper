import { isEnabled } from './config.js';

let autoGroupTimer = null;

const toDelay = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
};

export function cancelAutoGroup() {
    if (autoGroupTimer) {
        clearTimeout(autoGroupTimer);
        autoGroupTimer = null;
    }
}

export function startAutoGroup({ config, onGroup } = {}) {
    cancelAutoGroup();

    if (!config || !isEnabled(config)) return null;

    const delay = toDelay(config.autoGroupDelay);
    if (delay <= 0 || typeof onGroup !== 'function') return null;

    autoGroupTimer = setTimeout(async () => {
        autoGroupTimer = null;
        try {
            await onGroup();
        } catch (error) {
            console.warn("Auto-group handler failed:", error?.message || error);
        }
    }, delay);

    return autoGroupTimer;
}

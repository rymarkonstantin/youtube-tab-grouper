import { isEnabled } from './config.js';

/**
 * Category inference now lives in the background script to avoid duplication.
 * Content-side handlers defer by returning null when enabled.
 */
export function resolveCategory(_video = {}, settings = {}) {
    if (!isEnabled(settings)) return null;
    return null;
}

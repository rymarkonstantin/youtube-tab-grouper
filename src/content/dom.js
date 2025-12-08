import { BUTTON } from './constants.js';

const STYLE_ID = 'yt-grouper-style';

const buildStyles = () => `
#${BUTTON.id} {
    position: fixed;
    top: 16px;
    left: 16px;
    z-index: 9999;
    padding: 8px 12px;
    background: #4285F4;
    color: white;
    border: none;
    border-radius: 20px;
    font-weight: 600;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
    box-shadow: 0 2px 8px rgba(66, 133, 244, 0.3);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

#${BUTTON.id}:hover {
    background: #3367d6;
    box-shadow: 0 4px 12px rgba(66, 133, 244, 0.5);
}
`;

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const styleTag = document.createElement('style');
    styleTag.id = STYLE_ID;
    styleTag.textContent = buildStyles();
    document.head.appendChild(styleTag);
}

export function removeGroupButton() {
    const existing = document.getElementById(BUTTON.id);
    if (existing) existing.remove();
}

export function renderGroupButton({ onClick } = {}) {
    ensureStyles();

    const existing = document.getElementById(BUTTON.id);
    if (existing) {
        existing.onclick = onClick || null;
        return existing;
    }

    const button = document.createElement('button');
    button.id = BUTTON.id;
    button.textContent = BUTTON.label;
    button.setAttribute('title', BUTTON.title);
    button.onclick = onClick || null;

    document.body.appendChild(button);
    return button;
}

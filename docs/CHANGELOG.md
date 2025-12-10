# Changelog

All notable changes to YouTube Tab Grouper will be documented in this file.

---

## [Unreleased]

_No unreleased changes yet._

---

## [2.1] - 2025-12-10

### Added
- TypeScript build pipeline across background, content, and UI entries with esbuild outputs under `dist/`
- Type-safe content, popup, options, and stats scripts consuming shared message/settings contracts
- Smoke script (`npm run smoke`) covering message validation and migration helpers
- CI workflow running lint, typecheck, smoke checks, and build on push/PR

### Changed
- README/ARCHITECTURE updated with TS sources, `npm run build` / `npm run build:watch`, and loading `dist` in Chrome
- Manifest paths verified against emitted bundle locations; build docs clarified

### Fixed
- Hardened popup/options DOM typing to eliminate runtime/TS errors on inputs/buttons
- Chrome tab group color handling aligned with MV3 typings; messaging payload guards tightened

---

## [2.0] - 2024-01-15

### Added
- AI-powered category detection with keyword matching
- 8 predefined categories (Gaming, Music, Tech, Cooking, Fitness, Education, News, Entertainment)
- Smart color assignment algorithm (avoids neighbor colors)
- Keyboard shortcuts (Ctrl+Shift+G, B, T)
- Batch grouping for all YouTube tabs
- Context menu integration
- Channel-to-category mapping
- Statistics dashboard with Chart.js
- Settings import/export functionality
- Auto-cleanup for empty groups
- Extension enable/disable toggle

### UI Improvements
- Redesigned popup interface with custom category input
- Settings page with color toggles and channel mappings
- Statistics dashboard with visual chart
- Hover effects and smooth animations
- Icon updates and better styling

### Technical
- Reorganized file structure with `src/`, `ui/`, `images/`, `docs/` folders
- Comprehensive JSDoc documentation for all functions
- Improved error handling and logging
- Race condition prevention with color assignment locking
- Optimized performance with parallel API calls

### Documentation
- Complete README.md with features and troubleshooting
- CONTRIBUTING.md for developers
- ARCHITECTURE.md explaining system design
- Inline code comments explaining complex logic

---

## [1.0] - 2024-01-01

### Added
- Initial release
- Basic tab grouping functionality
- Manual grouping via popup button
- Auto-grouping after configurable delay
- Color assignment for groups
- Storage of settings

### Technical
- Service worker for tab management
- Content script for page injection
- Popup UI
- Basic settings page

---

## Version History

| Version | Date | Status |
|---------|------|--------|
| 2.1 | 2025-12-10 | Current |
| 2.0 | 2024-01-15 | Archived |
| 1.0 | 2024-01-01 | Archived |

---

## How to Update

### Auto-Update
Extension updates automatically from Chrome Web Store

### Manual Update
1. Download latest version
2. Go to `chrome://extensions/`
3. Enable Developer mode
4. Click "Update" or reload the extension

---

## Support

- Found a bug? [Report an issue](../../issues)
- Have a feature request? [Create a discussion](../../discussions)
- Want to contribute? Check [CONTRIBUTING.md](CONTRIBUTING.md)

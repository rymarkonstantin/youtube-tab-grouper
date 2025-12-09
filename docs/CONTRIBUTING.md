# Contributing to YouTube Tab Grouper

Thank you for your interest in contributing! This guide will help you get started.

---

## 🐛 Found a Bug?

1. **Check existing issues** to see if it's already reported
2. **Create a new issue** with:
   - Clear description of the problem
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable
   - Your environment (OS, Chrome version)

---

## 💡 Feature Requests

1. **Check existing issues** for similar requests
2. **Open a discussion** explaining:
   - What feature you want
   - Why it would be useful
   - How it should work

---

## 🛠️ Development Setup

### Prerequisites
- Chrome 88+
- Basic JavaScript knowledge
- Git

### Setup Steps

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/youtube-tab-grouper.git
cd youtube-tab-grouper
```

2. **Load in Chrome**
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the project folder

3. **Make changes**
   - Edit files in `src/`, `ui/`, etc.
   - Chrome will auto-reload changes

### Project Structure
See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed structure explanation

---

## 📝 Code Style

- Use **clear, descriptive variable names**
- Add **JSDoc comments** for functions
- Keep **functions small and focused**
- Use **async/await** instead of callbacks
- Add **error handling** for all promises

Example:
```javascript
/**
 * Group a tab into a category
 * @async
 * @param {Object} tab - Tab object
 * @param {string} category - Category name
 * @returns {Promise<Object>} {groupId, color}
 */
async function groupTab(tab, category) {
    // implementation
}
```

---

## 🧪 Testing

Before submitting:

1. **Test all grouping methods**
   - Manual (button click)
   - Auto (wait for delay)
   - Batch (Ctrl+Shift+B)
   - Context menu

2. **Test settings**
   - Save/load settings
   - Export/import settings
   - Reset to default

3. **Test categories**
   - Check AI detection works
   - Test channel mapping
   - Verify color assignment

4. **Check console** for errors
   - Open DevTools (F12)
   - Check for console errors
   - Fix any warnings

---

## 📋 Commit Guidelines

- Use **clear, descriptive commit messages**
- Reference related issues: `Fix #123`
- Group related changes together

Examples:
```
✨ Add statistics dashboard
🐛 Fix color assignment race condition
📝 Update documentation
♻️ Refactor grouping logic
```

---

## 🎯 Pull Request Process

1. **Create a feature branch**
```bash
git checkout -b feature/your-feature-name
```

2. **Make your changes**
   - Keep commits clean and logical
   - Add comments where needed
   - Update documentation if needed

3. **Test thoroughly**
   - Test all scenarios
   - Check for regressions
   - Verify browser console

4. **Push and create PR**
```bash
git push origin feature/your-feature-name
```

5. **Describe your changes**
   - What does it do?
   - Why is it needed?
   - Any breaking changes?

---

## 📚 File Locations

| Type | Location |
|------|----------|
| Core logic | `src/` |
| UI pages | `ui/popup/`, `ui/options/`, `ui/stats/` |
| Styles | `ui/styles/common.css` |
| Icons | `images/` |
| Configuration | `manifest.json` |

---

## 🔍 Key Files to Know

- **src/background/index.ts**: Main grouping logic, color assignment, messaging
- **src/content/index.js**: Page injection, UI button, auto-grouping
- **ui/popup/popup.js**: Popup interactions
- **ui/options/options.js**: Settings management
- **ui/stats/stats.js**: Statistics tracking

---

## ❓ Questions?

- Check the [README](../README.md)
- Review [ARCHITECTURE.md](ARCHITECTURE.md)
- Open an issue for discussions

---

## 📄 Code of Conduct

- Be respectful to others
- Provide constructive feedback
- Focus on the code, not the person
- Help others learn

---

Thank you for contributing! 🙏

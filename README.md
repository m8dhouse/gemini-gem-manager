# 💎 Gem Manager - Chrome Extension

A simple Chrome extension to help you manage and distribute Gemini AI gem instructions efficiently.

## ✨ Features

- **📋 Gem Library**: Pre-configured gem templates with instructions and file requirements
- **🔄 Version Control**: Check for gem updates and upgrade existing gems
- **📁 File Validation**: Automatically verify required files are uploaded
- **🎯 Smart Detection**: Distinguishes between new gems and updates
- **🔗 One-Click Navigation**: Clickable links to Gemini pages

## 🚀 Quick Start

1. **Install**: Load the extension in Chrome Developer Mode
2. **Navigate**: Go to [gemini.google.com](https://gemini.google.com)
3. **Open Sidebar**: Click the extension icon to open the sidebar
4. **Check Gems**: Click "Version check Existing Gems" to see what's available
5. **Add/Update**: Select a gem from the dropdown and follow the instructions

## 📖 How to Use

### Check Existing Gems
- Click **"Version check Existing Gems"** to scan your current gems
- See which gems can be updated to newer versions
- Click **"Update to [version]"** to upgrade specific gems

### Add New Gems
1. Select a gem from the **"Select a gem to add..."** dropdown
2. Read the file upload instructions
3. Click **"Fill Form"** to auto-fill the gem details
4. Upload the required files as instructed
5. Click **"Save Gem"** when all files are uploaded

## 🛠 Technical Details

- **Manifest V3** Chrome Extension
- **Side Panel** interface for easy access
- **Content Script** integration with Gemini pages
- **Local JSON** gem library (CDB integration ready)

## 🔧 Development

```bash
# Load in Chrome
1. Open chrome://extensions/
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the extension folder
```

## 📁 File Structure

```
gems/
├── manifest.json          # Extension configuration
├── sidebar.html           # Main UI
├── sidebar.js             # UI logic
├── content.js             # Page interaction
├── background.js          # Service worker
├── gems_data.json         # Gem library
└── icons/                 # Extension icons
```

## 🌐 CDB Integration

Ready for cloud database integration! See `CDB_INTEGRATION_GUIDE.md` for details on connecting to:
- Firebase
- Supabase  
- MongoDB Atlas
- Custom APIs

## 📝 License

GPL-3.0 license

---

**Made by m8dhouse for efficient Gemini AI gem management** 🚀 
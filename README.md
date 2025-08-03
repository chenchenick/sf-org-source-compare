# Salesforce Org Source Compare

![VSCode Extension](https://img.shields.io/badge/VSCode-Extension-blue.svg)
![Version](https://img.shields.io/badge/version-0.0.5-green.svg)

**Effortlessly compare source code and metadata between multiple Salesforce organizations directly in VS Code.**

Stop switching between browser tabs and complex tools. Get instant access to your Salesforce source code with smart caching, configurable metadata retrieval, and lightning-fast comparisons—all within your favorite editor.

## 🚀 Quick Start

### 1. Install from VS Code Marketplace
Search for "Salesforce Org Source Compare" in the Extensions view or [install directly](vscode:extension/chenology.sf-org-source-compare).

### 2. Prerequisites
- **Salesforce CLI v2**: Install from [developer.salesforce.com](https://developer.salesforce.com/tools/salesforcecli)
- **Authenticated Orgs**: Connect your orgs with `sf org login web --alias my-org`

### 3. Start Comparing
1. Click the Salesforce icon in the Activity Bar
2. Add your authenticated orgs with the **+** button
3. Expand orgs to browse source files
4. Right-click files to select for comparison
5. Click the **diff** icon to compare side-by-side

## ✨ Key Features

### 🏢 Multi-Org Management Made Simple
- **One-Click Access**: Add any authenticated Salesforce org instantly
- **Smart Caching**: Files load instantly from cache, refresh only when needed
- **Live Progress**: Real-time indicators for all operations
- **Inline Config**: Configure metadata types with the gear button next to each org

### 🗂️ Powerful Metadata Control
- **25+ Metadata Types**: ApexClass, LWC, Flows, CustomObjects, TestSuites, and more
- **Per-Org Configuration**: Customize what to retrieve for each organization
- **Category Organization**: Metadata grouped by Apex, Components, Security, Analytics, etc.
- **Quick Presets**: Enable All Types, Core Only, or Reset to Defaults

### ⚡ Lightning-Fast Comparisons
- **Instant Diff**: Compare files using VS Code's native diff editor
- **No Network Delays**: All comparisons use locally cached files
- **Smart Selection**: Click to open, right-click to select for comparison
- **Visual Indicators**: Selected files show numbered badges [1] and [2]

### 🎯 Native Salesforce Structure
- **Real SFDX Layout**: Browse actual `force-app/main/default/` directory structure
- **Complete Coverage**: Classes, triggers, LWC, Aura, objects, flows, test suites
- **Click to Edit**: Open any file directly in VS Code with full syntax highlighting
- **State Preservation**: Folder expansion remembered across sessions

## 🎮 Core Functions

### File Comparison
Compare files between different Salesforce orgs:
1. **Select Files**: Right-click any file and choose "Select File" - first file gets blue [1] badge, second gets red [2] badge
2. **Start Comparison**: Click the **diff icon** (⚡) in the toolbar or use the "Compare Selected Files" command
3. **View Results**: Files open side-by-side in VS Code's built-in diff editor with syntax highlighting
4. **Clear Selection**: Click the clear icon (🗑️) to reset file selection

### File Search (Ctrl+F)
Search and compare files across all organizations:
1. **Open Search**: Press `Ctrl+F` when focused on the extension panel or click the search icon (🔍)
2. **Search Files**: Type to filter files across all your connected orgs
3. **Select Multiple**: Choose 1 or 2 files from the search results
4. **Auto-Compare**: Selecting 2 files automatically starts the comparison

### Metadata Configuration
Configure which metadata types to retrieve for each org:
1. **Open Config**: Click the gear icon (⚙️) next to any org name
2. **Select Types**: Choose from 25+ metadata types organized by categories (Apex, Components, Security, etc.)
3. **Quick Presets**: Use "Enable All Types", "Core Types Only", or "Reset to Default" buttons
4. **Preview**: Click "Preview Manifest" to see the generated package.xml
5. **Save**: Changes are automatically saved when you make selections

### Refresh Organizations
Keep your org data up-to-date:
1. **Refresh All**: Click the main refresh button (🔄) to update all expanded orgs from Salesforce
2. **Refresh Single Org**: Right-click an org and select "Refresh Organization" or click the refresh icon next to the org name
3. **Smart Caching**: Files load instantly from cache between refreshes - refresh only when you need the latest changes
4. **Timestamp Display**: See exactly when each org was last refreshed (e.g., "Today, 2:30 PM", "Yesterday, 4:15 PM")

## 🛠️ Settings & Configuration

Configure the extension through VS Code settings or the manifest configuration interface:

- **API Version**: Choose Salesforce API version (58.0-61.0) in VS Code settings
- **Timeouts**: Adjust operation timeouts for large orgs
- **Cache Settings**: Control cache duration and cleanup behavior
- **Metadata Types**: Default metadata types for new orgs
- **Logging**: Set log level for troubleshooting (error, warn, info, debug, trace)

## 🆘 Common Issues

**"No organizations found"**
- Run `sf org list` to check authenticated orgs
- Re-authenticate: `sf org login web --alias my-org`

**"Files not loading"**
- Click the refresh button to reload from Salesforce
- Check org permissions and network connectivity

**"TestSuites not showing"**
- Ensure ApexTestSuite is enabled in manifest configuration
- Check if your org has test suites created

**Extension not responding**
- Reload VS Code window: `Ctrl+Shift+P` → "Developer: Reload Window"
- Check Output panel → "SF Org Source Compare" for logs

## 🔧 Pro Tips

- **Smart Caching**: Files display instantly from cache. Use refresh only when you need latest changes from Salesforce
- **Keyboard Shortcuts**: Use `Ctrl+Shift+P` and search "SF Org Compare" for all available commands
- **Multiple Comparisons**: You can have multiple diff editors open simultaneously
- **Custom Metadata**: Configure different metadata types per org based on your needs
- **Progress Tracking**: Long operations show detailed progress with cancellation options

## 🤝 Contributing

We welcome contributions! See our [Development Guide](DEVELOPMENT.md) for technical details.

### Quick Contribution Steps
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Run tests: `npm test`
5. Submit a pull request

For detailed development setup, architecture overview, and testing guidelines, see [DEVELOPMENT.md](DEVELOPMENT.md).

## 📞 Support & Feedback

- **Issues**: [GitHub Issues](https://github.com/chenchenick/sf-org-source-compare/issues)
- **Feature Requests**: [GitHub Discussions](https://github.com/chenchenick/sf-org-source-compare/discussions)
- **Email**: chen@chenology.com

---

**Transform your Salesforce development workflow. Install now and start comparing!**

Made with ❤️ for the Salesforce Developer Community
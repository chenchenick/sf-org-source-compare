# Salesforce Org Source Compare

![VSCode Extension](https://img.shields.io/badge/VSCode-Extension-blue.svg)
![Version](https://img.shields.io/badge/version-0.0.1-green.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

A powerful VSCode extension that enables seamless comparison of source code and metadata between different Salesforce organizations using an intuitive dual-editor interface.

## ✨ Features

### 🏢 Multi-Org Management
- **Easy Org Authentication**: Connect to multiple Salesforce orgs using existing SFDX/SF CLI credentials
- **Organization Browser**: View all authenticated orgs in a clean tree structure
- **Quick Access**: Expand orgs to browse metadata without switching contexts

### 📂 Comprehensive Metadata Support
- **ApexClass**: View and compare Apex class implementations
- **ApexTrigger**: Compare trigger logic across orgs
- **CustomObject**: Detailed XML metadata with fields, validation rules, and relationships
- **Flow**: Process builder and flow definitions
- **Layout**: Page layout configurations
- **PermissionSet**: Security and access permissions

### 🔄 Intelligent File Selection
- **Visual Indicators**: Selected files marked with `[1]` and `[2]` badges
- **Color-Coded Icons**: Blue for first selection, red for second selection
- **Toggle Selection**: Click to select, click again to unselect
- **Smart Replacement**: Selecting a third file automatically replaces the oldest selection

### ⚡ Performance Optimized
- **Smart Caching**: Metadata loaded once per org session
- **No Unnecessary API Calls**: File selection doesn't trigger org requests
- **Responsive Interface**: Instant visual feedback for all interactions

### 🔍 Advanced Comparison
- **Native VSCode Diff**: Leverage VSCode's powerful built-in diff editor
- **Side-by-Side View**: Compare files from different orgs simultaneously
- **Meaningful File Names**: Temporary files named `FileName_OrgName` for clarity
- **Syntax Highlighting**: Proper language detection for Apex, XML, and other formats

## 🚀 Getting Started

### Prerequisites

1. **VS Code**: Version 1.102.0 or higher
2. **Salesforce CLI**: Install the latest [Salesforce CLI v2](https://developer.salesforce.com/tools/salesforcecli)
3. **Authenticated Orgs**: At least one Salesforce org authenticated via `sf org login`

### Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/chenchenick/sf-org-source-compare.git
   cd sf-org-source-compare
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Compile the Extension**:
   ```bash
   npm run compile
   ```

4. **Run in Development**:
   - Press `F5` to open a new VS Code window with the extension loaded
   - Or use the VS Code debugger with the provided launch configuration

### Quick Setup

1. **Authenticate with Salesforce**:
   ```bash
   sf org login web --alias my-dev-org
   sf org login web --alias my-prod-org
   ```

2. **Open the Extension**:
   - Click the Salesforce icon in the Activity Bar
   - Or use `Ctrl+Shift+P` and search for "SF Org Compare"

3. **Add Organizations**:
   - Click "Add Organization" or the "+" icon
   - Select from your authenticated orgs

## 🎯 Usage

### Comparing Files

1. **Expand Organizations**: Click the arrow or org name to load metadata
2. **Browse Metadata**: Navigate through organized folders (Apex Classes, Custom Objects, etc.)
3. **Select Files**: Click files to select them (up to 2 files)
4. **Compare**: Click the compare button or use `Ctrl+Shift+P` → "Compare Selected Files"

### Managing Organizations

- **Add Org**: Use the "+" button in the extension panel
- **Remove Org**: Right-click on an org and select "Delete Organization"
- **Refresh**: Use the refresh button to reload org data

### Keyboard Shortcuts

- `Ctrl+Shift+P` → "SF Org Compare: Compare Selected Files"
- `Ctrl+Shift+P` → "SF Org Compare: Clear File Selection"
- `Ctrl+Shift+P` → "SF Org Compare: Refresh Organizations"

## 🛠️ Technical Details

### Architecture

```
src/
├── extension.ts              # Extension activation and command registration
├── providers/
│   └── SfOrgCompareProvider.ts   # Tree data provider and UI logic
├── services/
│   ├── OrgManager.ts         # Salesforce org management and API calls
│   └── FileCompareService.ts # File selection and comparison logic
└── types/
    └── index.ts              # TypeScript type definitions
```

### SF CLI Integration

The extension uses modern Salesforce CLI v2 commands:
- `sf org list` - List authenticated organizations
- `sf org list metadata` - Retrieve metadata for specific types
- `sf data query --use-tooling-api` - Get Apex class/trigger content
- `sf project retrieve start` - Download XML metadata for custom objects
- `sf sobject describe` - Get detailed object schema information

### Caching Strategy

- **Org-level caching**: Metadata loaded once per session
- **Smart invalidation**: Cache cleared when orgs are removed
- **Performance first**: File selection operations use cached data only

## 🐛 Troubleshooting

### Common Issues

**"No authenticated orgs found"**
- Run `sf org list` to verify authenticated orgs
- Re-authenticate with `sf org login web`

**"Failed to load files for org"**
- Check org permissions for metadata access
- Verify SF CLI installation: `sf version`
- Ensure org is still authenticated: `sf org display --target-org your-org`

**Extension not appearing**
- Check VS Code version compatibility (1.102.0+)
- Reload window: `Ctrl+Shift+P` → "Developer: Reload Window"

### Debug Mode

Enable console logging:
1. Open VS Code Developer Tools (`Ctrl+Shift+I`)
2. Check Console tab for detailed logs
3. Look for messages starting with extension operations

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Run tests: `npm test`
5. Submit a pull request

### Testing

```bash
# Run TypeScript checks
npm run check-types

# Run linting
npm run lint

# Run all tests
npm test
```

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [VS Code Extension API](https://code.visualstudio.com/api)
- Powered by [Salesforce CLI](https://developer.salesforce.com/tools/salesforcecli)
- Inspired by the Salesforce developer community

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/chenchenick/sf-org-source-compare/issues)
- **Discussions**: [GitHub Discussions](https://github.com/chenchenick/sf-org-source-compare/discussions)
- **Email**: chen@chenology.com

---

**Made with ❤️ for the Salesforce Developer Community**
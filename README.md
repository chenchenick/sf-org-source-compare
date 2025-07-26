# Salesforce Org Source Compare - Development

![VSCode Extension](https://img.shields.io/badge/VSCode-Extension-blue.svg)
![Version](https://img.shields.io/badge/version-0.0.1-green.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-4.9-blue.svg)
![Node](https://img.shields.io/badge/Node.js-18+-green.svg)

**Developer documentation for the Salesforce Org Source Compare VS Code extension.**

This extension enables seamless comparison and editing of source code and metadata between different Salesforce organizations using native SFDX directory structure, dependency injection architecture, and comprehensive error handling.

## 🏗️ Development Setup

### Prerequisites

- **Node.js**: 18.x or higher
- **VS Code**: Version 1.102.0 or higher
- **TypeScript**: 4.9 or higher
- **Salesforce CLI v2**: For testing with real orgs

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

3. **Build the Extension**:
   ```bash
   npm run compile
   ```

4. **Run in Development**:
   - Press `F5` to open a new VS Code Extension Host window
   - Or use the debugger with the provided launch configuration

### Development Scripts

```bash
# Type checking
npm run check-types

# Linting
npm run lint

# Watch mode for development
npm run watch

# Build for production
npm run package

# Run tests
npm test
```

## 🏛️ Architecture Overview

### Core Components

The extension follows a modern TypeScript architecture with dependency injection, comprehensive error handling, and modular design:

```
src/
├── extension.ts                     # Extension activation and DI container setup
├── di/
│   ├── Container.ts                 # Dependency injection container
│   └── ServiceRegistration.ts      # Service lifetime management
├── providers/
│   └── SfOrgCompareProvider.ts     # Tree data provider with smart caching
├── services/
│   ├── FileCompareService.ts       # Local file comparison logic
│   ├── SourceRetrievalService.ts   # SFDX manifest-based retrieval
│   └── ManifestManager.ts          # Org-specific manifest configuration
├── metadata/
│   └── EnhancedOrgManager.ts       # Advanced org management with caching
├── webview/
│   ├── ManifestConfigurationWebview.ts  # Manifest config UI
│   └── UserPreferencesWebview.ts        # Settings management UI
├── progress/
│   └── ProgressManager.ts          # Operation progress tracking
├── errors/
│   ├── ErrorHandler.ts             # Standardized error handling
│   └── UserErrorReporter.ts        # User-friendly error reporting
└── types/
    └── index.ts                    # TypeScript type definitions
```

### Key Architecture Patterns

#### Dependency Injection
- **Container-based DI**: All services registered in `Container.ts`
- **Service Lifetimes**: Singleton, Transient, and Scoped service management
- **Automatic Resolution**: Dependencies injected automatically based on constructor parameters

#### Error Handling Strategy
- **Standardized Errors**: All errors processed through `ErrorHandler.standardizeError()`
- **User-Friendly Reporting**: Interactive error messages with suggested actions
- **Error Classification**: Authentication, Network, Metadata, File System error types

#### Smart Caching
- **Org-Level Caching**: Files cached per organization with timestamp tracking
- **Force Refresh**: Explicit refresh from Salesforce vs. cached display
- **Cache Invalidation**: Automatic cleanup on org removal or explicit cache clearing

#### Progress Management
- **Operation-Specific**: Different progress patterns for various operations
- **Cancellable**: Users can cancel long-running operations
- **Time Estimation**: Smart progress reporting with completion estimates

## 🔧 Building and Testing

### TypeScript Compilation

The project uses ESBuild for fast compilation:

```bash
# Development build with watch
npm run watch

# Production build with minification
npm run package

# Type checking only
npm run check-types
```

### Testing Strategy

```bash
# Run all tests
npm test

# Compile tests
npm run compile-tests

# Watch tests during development
npm run watch-tests
```

### Test Structure

- **Unit Tests**: Individual service and utility testing
- **Integration Tests**: End-to-end workflow testing
- **Mock Services**: Comprehensive mocking for Salesforce CLI interactions

## 🤝 Contributing

### Development Workflow

1. **Fork the Repository**
2. **Create Feature Branch**: `git checkout -b feature/amazing-feature`
3. **Make Changes**: Follow TypeScript and ESLint conventions
4. **Add Tests**: Ensure new functionality is tested
5. **Run Quality Checks**:
   ```bash
   npm run check-types
   npm run lint
   npm test
   ```
6. **Submit Pull Request**: Include detailed description of changes

### Code Style Guidelines

- **TypeScript Strict Mode**: All code must pass strict type checking
- **ESLint Rules**: Follow configured ESLint rules for consistency
- **Error Handling**: Use standardized error handling patterns
- **Dependency Injection**: Register all services in the DI container
- **Documentation**: Add JSDoc comments for public APIs

### Adding New Features

1. **Service Registration**: Register new services in `ServiceRegistration.ts`
2. **Error Handling**: Use `ErrorHandler.standardizeError()` for all errors
3. **Progress Tracking**: Use `ProgressManager` for long-running operations
4. **Configuration**: Add settings to VS Code configuration schema in `package.json`
5. **Testing**: Add comprehensive unit and integration tests

## 🔍 Key Technical Features

### Manifest-Based Metadata Retrieval
- **25+ Metadata Types**: Comprehensive coverage of Salesforce metadata
- **Per-Org Configuration**: Customizable metadata type selection
- **XML Generation**: Dynamic package.xml generation based on configuration

### SFDX Integration
- **CLI Command Abstraction**: Robust SF/SFDX CLI command execution
- **Process Management**: Timeout handling and process cleanup
- **JSON Response Parsing**: Structured handling of CLI responses

### Webview Integration
- **VS Code Theming**: Native VS Code theme integration
- **Bidirectional Communication**: Extension ↔ Webview message passing
- **Rich UI Components**: Professional configuration and preference interfaces

### Performance Optimizations
- **Local File Operations**: Direct file system access for comparisons
- **Concurrent Processing**: Parallel metadata operations where possible
- **Smart Deduplication**: Prevent redundant concurrent operations
- **Memory Management**: Efficient caching with automatic cleanup

## 🧪 Testing

### Running Tests

The extension includes comprehensive test suites covering all major components:

```bash
# Run all tests
npm test

# Run specific test files
npm run test -- --grep "ManifestManager"

# Run tests with coverage
npm run test:coverage
```

### Test Categories

#### Unit Tests
- **Service Layer**: ManifestManager, SourceRetrievalService, FileCompareService
- **Error Handling**: ErrorHandler, UserErrorReporter
- **Progress Management**: ProgressManager operations
- **Dependency Injection**: Container registration and resolution

#### Integration Tests
- **End-to-End Workflows**: Org authentication → source retrieval → file comparison
- **CLI Integration**: SFDX command execution and response parsing
- **Webview Communication**: Extension ↔ webview message handling

#### Mock Strategy
- **SFDX CLI**: Mocked SF CLI responses for consistent testing
- **File System**: Virtual file system for isolated testing
- **VS Code API**: Comprehensive VS Code API mocking

### Test Data

```bash
test/
├── fixtures/
│   ├── sfdx-responses/       # Mock SFDX CLI JSON responses
│   ├── manifest-samples/     # Sample package.xml files
│   └── org-configs/          # Test organization configurations
├── unit/
│   ├── services/            # Service layer unit tests
│   ├── providers/           # Tree provider tests
│   └── utils/               # Utility function tests
└── integration/
    ├── workflows/           # End-to-end workflow tests
    └── cli-integration/     # SFDX CLI integration tests
```

## 🔍 Debugging

### VS Code Debug Configuration

The project includes launch configurations for debugging:

```json
{
    "name": "Run Extension",
    "type": "extensionHost",
    "request": "launch",
    "runtimeExecutable": "${execPath}",
    "args": ["--extensionDevelopmentPath=${workspaceFolder}"]
}
```

### Debug Techniques

#### Extension Host Debugging
1. Press `F5` to launch Extension Development Host
2. Set breakpoints in TypeScript source files
3. Use VS Code's integrated debugger

#### Logging Strategy
```typescript
// Use consistent logging patterns
console.log('🔧 SERVICE:', 'Operation description', data);
console.error('❌ ERROR:', 'Error context', error);
console.warn('⚠️ WARNING:', 'Warning message');
```

#### Output Channel
- Extension logs appear in VS Code Output panel
- Select "SF Org Source Compare" from the dropdown
- Configure log levels via user preferences

### Common Debug Scenarios

#### SFDX CLI Issues
```bash
# Verify CLI installation
sf --version

# Test org authentication
sf org list --json

# Debug manifest retrieval
sf project retrieve start --manifest package.xml --json
```

#### Extension Loading Issues
```bash
# Check extension logs
code --log-level debug --extensionDevelopmentPath=.

# Reset extension state
rm -rf ~/.vscode/extensions/*/globalStorage/*
```

## 🚀 Deployment & Publishing

### Building for Production

```bash
# Create production build
npm run package

# Validate extension package
vsce ls

# Package as VSIX for distribution
vsce package
```

### Publishing to VS Code Marketplace

```bash
# Install VSCE (Visual Studio Code Extension manager)
npm install -g vsce

# Login to publisher account
vsce login chenology

# Publish new version
vsce publish minor

# Publish specific version
vsce publish 1.0.0
```

### Release Process

1. **Update Version**: Bump version in `package.json`
2. **Update Changelog**: Document new features and fixes
3. **Run Quality Gates**:
   ```bash
   npm run check-types
   npm run lint
   npm test
   npm run package
   ```
4. **Create Release Tag**: `git tag v1.0.0`
5. **Publish Extension**: `vsce publish`
6. **GitHub Release**: Create release notes on GitHub

## 🔧 Configuration Management

### VS Code Settings Schema

The extension contributes configuration settings defined in `package.json`:

```json
{
  "contributes": {
    "configuration": {
      "properties": {
        "sfOrgSourceCompare.apiVersion": {
          "type": "string",
          "enum": ["58.0", "59.0", "60.0", "61.0"],
          "default": "58.0"
        },
        "sfOrgSourceCompare.defaultTimeout": {
          "type": "number",
          "default": 30000
        }
      }
    }
  }
}
```

### Environment Variables

```bash
# Development environment
VSCODE_DEBUG=true
SF_CLI_PATH=/usr/local/bin/sf

# Testing environment
NODE_ENV=test
MOCK_SFDX_RESPONSES=true
```

### Extension Settings

Settings are managed through the ConfigurationManager singleton:

```typescript
// Get configuration value
const apiVersion = ConfigurationManager.getInstance().getApiVersion();

// Update configuration
await vscode.workspace.getConfiguration('sfOrgSourceCompare')
  .update('apiVersion', '59.0', vscode.ConfigurationTarget.Global);
```

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

# Compile and build
npm run compile
```

## 📈 Performance Benchmarks

- **Source Retrieval**: ~30-60 seconds (one-time per org)
- **File Opening**: ~50ms (local file access)
- **File Comparison**: ~100ms (local diff generation)
- **Tree Navigation**: <10ms (cached data)
- **Memory Usage**: <50MB per org (including cached source)

## 🔄 Changelog

### Version 0.0.1
- ✅ Native SFDX directory structure implementation
- ✅ Click-to-open file functionality
- ✅ Optimized local file comparisons
- ✅ Comprehensive metadata support via SFDX manifest
- ✅ Enhanced folder management with state preservation
- ✅ Performance optimizations and caching improvements

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [VS Code Extension API](https://code.visualstudio.com/api)
- Powered by [Salesforce CLI v2](https://developer.salesforce.com/tools/salesforcecli)
- Uses native SFDX project structure and manifest deployment
- Inspired by the Salesforce developer community

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/chenchenick/sf-org-source-compare/issues)
- **Discussions**: [GitHub Discussions](https://github.com/chenchenick/sf-org-source-compare/discussions)
- **Email**: chen@chenology.com

---

**Made with ❤️ for the Salesforce Developer Community**
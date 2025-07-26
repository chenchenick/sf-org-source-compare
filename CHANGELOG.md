# Change Log

All notable changes to the "sf-org-source-compare" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.4] - 2025-01-26

### Added
- Extension icon for VS Code Marketplace
- Comprehensive documentation restructure for better user/developer experience

### Changed
- Updated version badge in README to reflect current version (0.0.4)
- Improved extension metadata and presentation

### Fixed
- VS Code extension packaging issue with README file selection
- Proper documentation separation for marketplace vs repository audiences

## [0.0.3] - 2025-01-26

### Fixed
- VS Code extension README packaging issue
- Removed unsupported `readme` field from package.json
- Restructured documentation: README.md for users, DEVELOPMENT.md for developers

### Changed
- README.md now contains user-focused content for VS Code Marketplace
- Technical documentation moved to DEVELOPMENT.md
- Deleted redundant EXTENSION_README.md file

## [0.0.2] - 2025-01-26

### Added
- Comprehensive extension enhancements with 9 high-priority improvements:
  - Consolidated dual org management systems (removed redundant OrgManager)
  - Centralized configuration constants (moved timeouts and API versions to config)
  - Implemented dependency injection container with service lifetime management
  - Standardized error handling patterns across all services
  - Added per-org manifest configuration with 25+ metadata types
  - User preferences panel with webview-based settings management
  - Enhanced error messaging with user-friendly, actionable descriptions
  - Progress indicators for all long-running operations
  - Security audit and command injection vulnerability fixes

### Added - Core Features
- **ManifestManager**: Per-org metadata type configuration with 25+ types
- **ProgressManager**: Operation-specific progress tracking with cancellation
- **UserErrorReporter**: Interactive error messages with suggested actions
- **UserPreferencesWebview**: Rich settings panel with 5 preference categories
- **ManifestConfigurationWebview**: GUI for configuring metadata retrieval per org
- **Dependency Injection Container**: Service lifetime management and automatic resolution

### Added - Smart Caching & Performance
- Smart caching system: files display instantly from cache, refresh only when requested
- Org-level caching with timestamp tracking and selective refresh
- Config Manifest button inline with org names for quick access
- Enhanced progress reporting with time estimation and step-by-step feedback

### Added - User Experience
- TestSuite support with proper manifest configuration
- Pre-selection of org when clicking Config Manifest button
- Real-time progress indicators for org refresh, multi-org refresh, source retrieval
- Category-organized metadata types (Apex, Components, Security, Analytics, etc.)
- Quick preset options: Enable All Types, Core Types Only, Reset to Default

### Fixed
- TestSuite not showing in org refresh (manifest configuration issue)
- SourceRetrievalService using hardcoded manifest instead of ManifestManager
- Constructor dependency injection issues throughout codebase
- Org pre-selection in manifest configuration webview

### Changed
- Replaced dual org management system with single EnhancedOrgManager
- All services now use dependency injection container
- Standardized error handling with consistent patterns
- Progress tracking integrated across all long-running operations

### Technical
- 80+ comprehensive test suite covering all major components
- Service lifetime management with Singleton, Transient, and Scoped patterns
- Security-focused command execution with input sanitization
- Webview integration with VS Code theming and bidirectional communication

## [0.0.1] - 2025-01-25

### Added
- Initial release with core functionality
- Native SFDX directory structure implementation
- Click-to-open file functionality with full syntax highlighting
- Optimized local file comparisons using VS Code's native diff editor
- Multi-org management with authentication via SF CLI
- Smart file selection system with visual indicators [1] and [2]
- Comprehensive metadata support via SFDX manifest approach
- Enhanced folder management with state preservation
- Real-time editing capabilities for locally cached files
- Performance optimizations and intelligent caching system

### Features
- **Multi-Org Support**: Connect to multiple Salesforce orgs using SFDX/SF CLI
- **Native File Structure**: Browse actual `force-app/main/default/` directory layout
- **Lightning-Fast Comparisons**: Compare files using local cached copies
- **Complete Metadata Coverage**: Support for Apex, LWC, Aura, CustomObjects, Flows, etc.
- **Smart UI**: Color-coded file selection, folder expansion state preservation
- **Direct File Access**: Click any file to open in VS Code editor
- **Local Operations**: All comparisons use local file URIs for optimal performance

### Technical Implementation
- Manifest-based source retrieval using `sf project retrieve start`
- Local file caching in `/tmp/sf-org-compare/org-[id]/` structure
- Concurrent processing and smart deduplication
- VS Code TreeDataProvider integration with proper expansion handling
- Native file system operations for comparison workflows
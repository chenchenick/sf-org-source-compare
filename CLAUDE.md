# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a VSCode extension for comparing Salesforce organization source code. The extension provides a dual-editor interface where users can:
- Connect to different authorized Salesforce orgs in each editor
- Browse and list files from each org
- Select files from both editors and compare them using VSCode's built-in diff functionality

## Development Commands

- **Development**: `npm run watch` (watch mode with hot reload)
- **Compile**: `npm run compile` (TypeScript compilation + linting)
- **Test**: `npm test` (run extension tests)
- **Package**: `vsce package` (create .vsix file for distribution)
- **Lint**: `npm run lint` (ESLint code quality checks)
- **Type check**: `npm run check-types` (TypeScript type checking only)

For debugging: Use F5 to launch Extension Development Host in VSCode

## Architecture Notes

### Core Components
- **Dual Editor Interface**: Side-by-side editors for different Salesforce orgs
- **Org Authentication**: Management of multiple Salesforce org connections
- **File Browser**: Tree view for browsing org metadata/source files
- **File Comparison**: Integration with VSCode's built-in diff functionality

### Key VSCode Extension Concepts
- Extension activation events (likely `onCommand` or workspace-based)
- TreeDataProvider for org file listings
- Webview or custom editor providers for dual-editor interface
- Command registration for file comparison actions
- Configuration for storing org authentication details

### Salesforce Integration
- Authentication with multiple Salesforce orgs simultaneously
- Metadata API or Tooling API for file retrieval
- Handling different metadata types (Apex, Lightning Components, etc.)
- Org-specific file tree structures

## Important Reminders

- Always use `python3` instead of `python` when running Python commands
- VSCode extensions use TypeScript/JavaScript - ensure proper type definitions
- Store sensitive auth data securely (VSCode SecretStorage API)
- Handle Salesforce API rate limits and authentication timeouts
- Follow VSCode extension guidelines for UI/UX consistency
- Extension requires Salesforce CLI (sfdx) to be installed and configured
- Users must authenticate with orgs using `sfdx force:auth:web:login` before using the extension
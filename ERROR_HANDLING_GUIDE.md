# Standardized Error Handling Guide

## Overview

The Salesforce Org Source Compare extension now implements a comprehensive standardized error handling system that provides consistent error classification, handling strategies, and user-friendly messaging across all services and components.

## Architecture

### Core Components

1. **ErrorHandler** - Singleton service that manages all error handling
2. **ErrorUtils** - Utility functions for creating common error types
3. **StandardError** - Interface defining the structure of standardized errors
4. **ErrorType** - Enumeration of error categories
5. **ErrorSeverity** - Levels of error severity
6. **ErrorHandlingStrategy** - Different approaches to handle errors

### Error Types

```typescript
export enum ErrorType {
    AUTHENTICATION = 'AUTHENTICATION',
    NETWORK = 'NETWORK', 
    TIMEOUT = 'TIMEOUT',
    VALIDATION = 'VALIDATION',
    FILE_SYSTEM = 'FILE_SYSTEM',
    METADATA_RETRIEVAL = 'METADATA_RETRIEVAL',
    CLI_COMMAND = 'CLI_COMMAND',
    PARSING = 'PARSING',
    CONFIGURATION = 'CONFIGURATION',
    UNKNOWN = 'UNKNOWN'
}
```

### Error Severity Levels

```typescript
export enum ErrorSeverity {
    LOW = 'LOW',        // Minor issues, informational
    MEDIUM = 'MEDIUM',  // Standard errors, warnings
    HIGH = 'HIGH',      // Serious errors, requires attention
    CRITICAL = 'CRITICAL' // System-breaking errors
}
```

### Handling Strategies

```typescript
export enum ErrorHandlingStrategy {
    THROW = 'THROW',                    // Re-throw the error (fail fast)
    RETURN_EMPTY = 'RETURN_EMPTY',      // Return empty result ('')
    RETURN_DEFAULT = 'RETURN_DEFAULT',   // Return specified default value
    LOG_AND_CONTINUE = 'LOG_AND_CONTINUE', // Log error and continue
    RETRY = 'RETRY'                     // Retry the operation (future)
}
```

## Usage Examples

### Basic Error Standardization

```typescript
import { ErrorHandler } from '../errors/ErrorHandler';

const errorHandler = ErrorHandler.getInstance();

try {
    // Some operation that might fail
    await riskyOperation();
} catch (error) {
    const standardError = errorHandler.standardizeError(error as Error, 'operation_context');
    throw standardError;
}
```

### Using Error Handling Strategies

```typescript
// Return empty result on error
const result = errorHandler.handleError(
    error, 
    ErrorHandlingStrategy.RETURN_EMPTY
);

// Return default value on error
const result = errorHandler.handleError(
    error,
    ErrorHandlingStrategy.RETURN_DEFAULT,
    { defaultValue: [] }
);

// Log and continue
const result = errorHandler.handleError(
    error,
    ErrorHandlingStrategy.LOG_AND_CONTINUE
);
```

### Creating Specific Error Types

```typescript
import { ErrorUtils } from '../errors/ErrorHandler';

// Authentication error
const authError = ErrorUtils.createAuthError(
    'Invalid credentials provided',
    { orgId: 'org123', username: 'user@example.com' }
);

// Network error
const networkError = ErrorUtils.createNetworkError(
    'Connection timeout',
    { url: 'https://api.salesforce.com', timeout: 30000 }
);

// Metadata error
const metadataError = ErrorUtils.createMetadataError(
    'Failed to retrieve ApexClass metadata',
    { metadataType: 'ApexClass', orgIdentifier: 'prod-org' }
);

// Validation error
const validationError = ErrorUtils.createValidationError(
    'Organization ID format is invalid',
    { field: 'orgId', providedValue: 'invalid-id' }
);
```

## Implementation in Services

### SourceRetrievalService Example

```typescript
export class SourceRetrievalService {
    private errorHandler: ErrorHandler;

    constructor() {
        this.errorHandler = ErrorHandler.getInstance();
    }

    public async retrieveOrgSource(org: SalesforceOrg): Promise<string> {
        try {
            // Implementation
            return result;
        } catch (error) {
            const standardError = ErrorUtils.createMetadataError(
                `Failed to retrieve source for org: ${error.message}`,
                { orgId: org.id, orgAlias: org.alias }
            );
            
            throw new Error(standardError.userMessage || standardError.message);
        }
    }
}
```

### Metadata Handler Example

```typescript
export class ApexHandler extends MetadataHandler {
    private errorHandler: ErrorHandler;

    constructor(config: MetadataHandlerConfig) {
        super(definition, config);
        this.errorHandler = ErrorHandler.getInstance();
    }

    public async getFiles(orgId: string, orgIdentifier: string): Promise<OrgFile[]> {
        try {
            // Implementation
            return files;
        } catch (error) {
            const standardError = ErrorUtils.createMetadataError(
                `Failed to retrieve ${this.requestedType} files: ${error.message}`,
                { metadataType: this.requestedType, orgIdentifier }
            );
            
            return this.errorHandler.handleError(standardError, ErrorHandlingStrategy.RETURN_EMPTY);
        }
    }
}
```

## Error Features

### Automatic Classification

The system automatically classifies errors based on message content:

- **Authentication**: "authentication", "unauthorized", "access denied"
- **Network**: "network", "connection", "ECONNREFUSED"
- **Timeout**: "timeout", "timed out"
- **File System**: "file not found", "ENOENT", "path"
- **Metadata**: "metadata", "retrieve", "deploy"
- **CLI Command**: "sf ", "sfdx ", "cli"
- **Parsing**: "json", "parse", "syntax"
- **Validation**: "validation", "invalid", "required"

### User-Friendly Messages

Technical errors are converted to user-friendly messages:

```typescript
// Technical: "ECONNREFUSED 127.0.0.1:443"
// User-friendly: "Network connection failed. Please check your internet connection and try again."

// Technical: "sf command not found"
// User-friendly: "Salesforce CLI command failed. Please ensure the CLI is properly installed."
```

### Contextual Suggestions

Each error type includes helpful suggestions:

- **Authentication**: "Run 'sf org login web' to authenticate", "Check if your org is still active"
- **Network**: "Check your internet connection", "Verify firewall settings"
- **CLI Command**: "Install Salesforce CLI", "Update to the latest CLI version"

### Error Logging and Statistics

```typescript
// Get recent errors
const recentErrors = errorHandler.getRecentErrors(10);

// Get error statistics
const stats = errorHandler.getErrorStats();
console.log(`Total errors: ${stats.totalErrors}`);
console.log(`Auth errors: ${stats.errorsByType.AUTHENTICATION}`);
console.log(`High severity: ${stats.errorsBySeverity.HIGH}`);

// Clear error log
errorHandler.clearErrorLog();
```

## Best Practices

### 1. Always Use Context

```typescript
// Good - provides context
const standardError = errorHandler.standardizeError(error, 'retrieveApexClass');

// Better - includes operation context
const standardError = ErrorUtils.createMetadataError(
    error.message,
    { operation: 'retrieveApexClass', orgId: 'org123', metadataType: 'ApexClass' }
);
```

### 2. Choose Appropriate Strategies

```typescript
// For data retrieval - return empty rather than crash
return errorHandler.handleError(error, ErrorHandlingStrategy.RETURN_EMPTY);

// For critical operations - fail fast
return errorHandler.handleError(error, ErrorHandlingStrategy.THROW);

// For optional operations - log and continue
return errorHandler.handleError(error, ErrorHandlingStrategy.LOG_AND_CONTINUE);
```

### 3. Preserve Original Error Information

```typescript
// Always include original error for debugging
const standardError = errorHandler.createError(
    ErrorType.METADATA_RETRIEVAL,
    'User-friendly message',
    {
        originalError: error,
        context: { operation: 'retrieve' }
    }
);
```

### 4. Show Errors to Users Appropriately

```typescript
// Use built-in UI handling
errorHandler.showErrorToUser(standardError);

// This automatically chooses appropriate VS Code notification based on severity:
// - Critical/High: Error message with actions
// - Medium: Warning message with actions  
// - Low: Information message
```

## Migration Guide

### Before (Inconsistent Error Handling)

```typescript
// Different patterns across files
throw new Error(`Failed to retrieve files: ${error.message}`);
return [];
vscode.window.showErrorMessage('Something went wrong');
console.error('Error:', error);
```

### After (Standardized Error Handling)

```typescript
// Consistent pattern across all files
const standardError = ErrorUtils.createMetadataError(
    `Failed to retrieve files: ${error.message}`,
    { metadataType: 'ApexClass', orgIdentifier }
);

return this.errorHandler.handleError(standardError, ErrorHandlingStrategy.RETURN_EMPTY);
```

## Files Updated

- **Created**: `src/errors/ErrorHandler.ts` - Core error handling system
- **Updated**: `src/config/Constants.ts` - Added logging configuration
- **Updated**: `src/services/SourceRetrievalService.ts` - Standardized error handling
- **Updated**: `src/services/FileCompareService.ts` - Standardized error handling
- **Updated**: `src/metadata/handlers/ApexHandler.ts` - Standardized error handling
- **Updated**: `src/metadata/handlers/LwcHandler.ts` - Standardized error handling
- **Created**: `src/test/errors/ErrorHandler.test.ts` - Comprehensive test suite

## Benefits

1. **Consistency**: All errors are handled the same way across the extension
2. **User Experience**: Technical errors are converted to actionable messages
3. **Debugging**: Rich context and original error preservation
4. **Monitoring**: Error statistics and logging for analysis
5. **Maintainability**: Centralized error handling logic
6. **Reliability**: Configurable strategies prevent crashes
7. **Guidance**: Contextual suggestions help users resolve issues

## Future Enhancements

- **Retry Logic**: Implement automatic retry for transient errors
- **Error Reporting**: Integration with telemetry systems
- **Custom Actions**: Context-specific action buttons in error messages
- **Error Recovery**: Automatic recovery strategies for common issues
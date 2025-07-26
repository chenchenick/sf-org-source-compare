import * as assert from 'assert';
import { ErrorHandler, ErrorType, ErrorSeverity, ErrorHandlingStrategy, ErrorUtils } from '../../errors/ErrorHandler';

suite('ErrorHandler Tests', () => {
    let errorHandler: ErrorHandler;

    setup(() => {
        errorHandler = ErrorHandler.getInstance();
        errorHandler.clearErrorLog();
    });

    suite('Error Classification', () => {
        test('should classify authentication errors correctly', () => {
            const authError = new Error('Authentication failed: invalid credentials');
            const standardError = errorHandler.standardizeError(authError);
            
            assert.strictEqual(standardError.type, ErrorType.AUTHENTICATION);
            assert.strictEqual(standardError.severity, ErrorSeverity.HIGH);
            assert.ok(standardError.userMessage?.includes('Authentication failed'));
            assert.ok(standardError.suggestions && standardError.suggestions.length > 0);
        });

        test('should classify network errors correctly', () => {
            const networkError = new Error('ECONNREFUSED: Connection refused');
            const standardError = errorHandler.standardizeError(networkError);
            
            assert.strictEqual(standardError.type, ErrorType.NETWORK);
            assert.strictEqual(standardError.severity, ErrorSeverity.MEDIUM);
            assert.ok(standardError.userMessage?.includes('Network connection failed'));
        });

        test('should classify timeout errors correctly', () => {
            const timeoutError = new Error('Operation timed out after 30000ms');
            const standardError = errorHandler.standardizeError(timeoutError);
            
            assert.strictEqual(standardError.type, ErrorType.TIMEOUT);
            assert.strictEqual(standardError.severity, ErrorSeverity.MEDIUM);
            assert.ok(standardError.userMessage?.includes('Operation timed out'));
        });

        test('should classify metadata errors correctly', () => {
            const metadataError = new Error('Failed to retrieve metadata from org');
            const standardError = errorHandler.standardizeError(metadataError);
            
            assert.strictEqual(standardError.type, ErrorType.METADATA_RETRIEVAL);
            assert.strictEqual(standardError.severity, ErrorSeverity.MEDIUM);
            assert.ok(standardError.userMessage?.includes('Failed to retrieve metadata'));
        });

        test('should classify CLI command errors correctly', () => {
            const cliError = new Error('sf command not found');
            const standardError = errorHandler.standardizeError(cliError);
            
            assert.strictEqual(standardError.type, ErrorType.CLI_COMMAND);
            assert.strictEqual(standardError.severity, ErrorSeverity.MEDIUM);
            assert.ok(standardError.userMessage?.includes('Salesforce CLI command failed'));
        });

        test('should classify validation errors correctly', () => {
            const validationError = new Error('Invalid input: required field missing');
            const standardError = errorHandler.standardizeError(validationError);
            
            assert.strictEqual(standardError.type, ErrorType.VALIDATION);
            assert.strictEqual(standardError.severity, ErrorSeverity.LOW);
            assert.ok(standardError.userMessage?.includes('Validation error'));
        });

        test('should classify unknown errors correctly', () => {
            const unknownError = new Error('Something unexpected happened');
            const standardError = errorHandler.standardizeError(unknownError);
            
            assert.strictEqual(standardError.type, ErrorType.UNKNOWN);
            assert.strictEqual(standardError.severity, ErrorSeverity.MEDIUM);
        });
    });

    suite('Error Handling Strategies', () => {
        test('should handle THROW strategy correctly', () => {
            const testError = new Error('Test error');
            
            assert.throws(() => {
                errorHandler.handleError(testError, ErrorHandlingStrategy.THROW);
            });
        });

        test('should handle RETURN_EMPTY strategy correctly', () => {
            const testError = new Error('Test error');
            const result = errorHandler.handleError(testError, ErrorHandlingStrategy.RETURN_EMPTY);
            
            assert.strictEqual(result, '');
        });

        test('should handle RETURN_DEFAULT strategy correctly', () => {
            const testError = new Error('Test error');
            const defaultValue = 'default';
            const result = errorHandler.handleError(testError, ErrorHandlingStrategy.RETURN_DEFAULT, {
                defaultValue
            });
            
            assert.strictEqual(result, defaultValue);
        });

        test('should handle LOG_AND_CONTINUE strategy correctly', () => {
            const testError = new Error('Test error');
            const result = errorHandler.handleError(testError, ErrorHandlingStrategy.LOG_AND_CONTINUE);
            
            assert.strictEqual(result, '');
        });
    });

    suite('Error Utilities', () => {
        test('should create auth error correctly', () => {
            const authError = ErrorUtils.createAuthError('Invalid credentials', { orgId: 'test' });
            
            assert.strictEqual(authError.type, ErrorType.AUTHENTICATION);
            assert.strictEqual(authError.severity, ErrorSeverity.HIGH);
            assert.ok(authError.suggestions && authError.suggestions.includes('Run "sf org login web" to authenticate'));
        });

        test('should create network error correctly', () => {
            const networkError = ErrorUtils.createNetworkError('Connection failed', { url: 'test.com' });
            
            assert.strictEqual(networkError.type, ErrorType.NETWORK);
            assert.strictEqual(networkError.severity, ErrorSeverity.MEDIUM);
            assert.ok(networkError.suggestions && networkError.suggestions.includes('Check your internet connection'));
        });

        test('should create metadata error correctly', () => {
            const metadataError = ErrorUtils.createMetadataError('Retrieval failed', { metadataType: 'ApexClass' });
            
            assert.strictEqual(metadataError.type, ErrorType.METADATA_RETRIEVAL);
            assert.strictEqual(metadataError.severity, ErrorSeverity.MEDIUM);
            assert.ok(metadataError.suggestions && metadataError.suggestions.includes('Check your org permissions'));
        });

        test('should create validation error correctly', () => {
            const validationError = ErrorUtils.createValidationError('Invalid format', { field: 'orgId' });
            
            assert.strictEqual(validationError.type, ErrorType.VALIDATION);
            assert.strictEqual(validationError.severity, ErrorSeverity.LOW);
        });
    });

    suite('Error Logging', () => {
        test('should log errors to internal log', () => {
            const testError = new Error('Test error for logging');
            errorHandler.standardizeError(testError);
            
            const recentErrors = errorHandler.getRecentErrors(1);
            assert.strictEqual(recentErrors.length, 1);
            assert.strictEqual(recentErrors[0].message, 'Test error for logging');
        });

        test('should maintain log size limit', () => {
            // Create more errors than the log size limit
            for (let i = 0; i < 105; i++) {
                const testError = new Error(`Test error ${i}`);
                errorHandler.standardizeError(testError);
            }
            
            const allErrors = errorHandler.getRecentErrors(200);
            assert.ok(allErrors.length <= 100); // Should be limited to max log size
        });

        test('should provide error statistics', () => {
            // Create different types of errors
            const authError = new Error('Authentication failed');
            const networkError = new Error('Network connection failed');
            const validationError = new Error('Invalid input provided');
            
            errorHandler.standardizeError(authError);
            errorHandler.standardizeError(networkError);
            errorHandler.standardizeError(validationError);
            
            const stats = errorHandler.getErrorStats();
            assert.ok(stats.totalErrors >= 3);
            assert.ok(stats.errorsByType[ErrorType.AUTHENTICATION] >= 1);
            assert.ok(stats.errorsByType[ErrorType.NETWORK] >= 1);
            assert.ok(stats.errorsByType[ErrorType.VALIDATION] >= 1);
        });

        test('should clear error log', () => {
            const testError = new Error('Test error');
            errorHandler.standardizeError(testError);
            
            assert.ok(errorHandler.getRecentErrors().length > 0);
            
            errorHandler.clearErrorLog();
            assert.strictEqual(errorHandler.getRecentErrors().length, 0);
        });
    });

    suite('Error Context and Suggestions', () => {
        test('should include context in error', () => {
            const testError = new Error('Test error');
            const context = { operation: 'file_retrieval', orgId: 'test123' };
            const standardError = errorHandler.standardizeError(testError, 'file_retrieval');
            
            assert.ok(standardError.context);
            assert.strictEqual(standardError.context.operation, 'file_retrieval');
        });

        test('should provide relevant suggestions for different error types', () => {
            const authError = new Error('Authentication failed');
            const standardError = errorHandler.standardizeError(authError);
            
            assert.ok(standardError.suggestions);
            assert.ok(standardError.suggestions && standardError.suggestions.some(s => s.includes('sf org login web')));
        });

        test('should generate user-friendly messages', () => {
            const techError = new Error('ECONNREFUSED 127.0.0.1:443');
            const standardError = errorHandler.standardizeError(techError);
            
            assert.ok(standardError.userMessage);
            assert.ok(standardError.userMessage.includes('Network connection failed'));
            assert.ok(!standardError.userMessage.includes('ECONNREFUSED')); // Should be user-friendly
        });
    });

    suite('Standard Error Properties', () => {
        test('should have all required properties', () => {
            const testError = new Error('Test error');
            const standardError = errorHandler.standardizeError(testError);
            
            assert.ok(standardError.type);
            assert.ok(standardError.severity);
            assert.ok(standardError.message);
            assert.ok(standardError.timestamp instanceof Date);
            assert.ok(standardError.originalError === testError);
        });

        test('should preserve original error', () => {
            const originalError = new Error('Original error message');
            originalError.stack = 'test stack trace';
            
            const standardError = errorHandler.standardizeError(originalError);
            
            assert.strictEqual(standardError.originalError, originalError);
            assert.strictEqual(standardError.originalError?.stack, 'test stack trace');
        });
    });
});
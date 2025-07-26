import * as vscode from 'vscode';
import { SF_CONFIG } from '../config';

/**
 * Standardized error types for the extension
 */
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

/**
 * Standardized error severity levels
 */
export enum ErrorSeverity {
    LOW = 'LOW',
    MEDIUM = 'MEDIUM',
    HIGH = 'HIGH',
    CRITICAL = 'CRITICAL'
}

/**
 * Standardized error interface
 */
export interface StandardError {
    type: ErrorType;
    severity: ErrorSeverity;
    message: string;
    userMessage?: string;
    code?: string;
    context?: Record<string, any>;
    originalError?: Error;
    timestamp: Date;
    suggestions?: string[];
}

/**
 * Error handling strategy
 */
export enum ErrorHandlingStrategy {
    THROW = 'THROW',           // Throw the error (fail fast)
    RETURN_EMPTY = 'RETURN_EMPTY',  // Return empty result
    RETURN_DEFAULT = 'RETURN_DEFAULT',  // Return default value
    LOG_AND_CONTINUE = 'LOG_AND_CONTINUE',  // Log error and continue
    RETRY = 'RETRY'            // Retry the operation
}

/**
 * Centralized error handler for the extension
 */
export class ErrorHandler {
    private static instance: ErrorHandler;
    private errorLog: StandardError[] = [];
    private maxLogSize = SF_CONFIG.LOGGING.MAX_LOG_SIZE;

    private constructor() {}

    public static getInstance(): ErrorHandler {
        if (!ErrorHandler.instance) {
            ErrorHandler.instance = new ErrorHandler();
        }
        return ErrorHandler.instance;
    }

    /**
     * Create a standardized error
     */
    public createError(
        type: ErrorType,
        message: string,
        options: {
            severity?: ErrorSeverity;
            userMessage?: string;
            code?: string;
            context?: Record<string, any>;
            originalError?: Error;
            suggestions?: string[];
        } = {}
    ): StandardError {
        const error: StandardError = {
            type,
            severity: options.severity || ErrorSeverity.MEDIUM,
            message,
            userMessage: options.userMessage,
            code: options.code,
            context: options.context,
            originalError: options.originalError,
            timestamp: new Date(),
            suggestions: options.suggestions
        };

        // Add to error log
        this.logError(error);

        return error;
    }

    /**
     * Handle error based on strategy
     */
    public handleError<T>(
        error: Error | StandardError,
        strategy: ErrorHandlingStrategy,
        options: {
            defaultValue?: T;
            retryFn?: () => Promise<T>;
            maxRetries?: number;
            context?: string;
        } = {}
    ): T | never {
        const standardError = this.standardizeError(error, options.context);

        switch (strategy) {
            case ErrorHandlingStrategy.THROW:
                throw new Error(standardError.userMessage || standardError.message);

            case ErrorHandlingStrategy.RETURN_EMPTY:
                return this.getEmptyValue<T>();

            case ErrorHandlingStrategy.RETURN_DEFAULT:
                if (options.defaultValue !== undefined) {
                    return options.defaultValue;
                }
                return this.getEmptyValue<T>();

            case ErrorHandlingStrategy.LOG_AND_CONTINUE:
                console.error(`[${standardError.type}] ${standardError.message}`, standardError.context);
                return this.getEmptyValue<T>();

            case ErrorHandlingStrategy.RETRY:
                // Retry logic would be implemented here
                // For now, fall back to throw
                throw new Error(standardError.userMessage || standardError.message);

            default:
                throw new Error(standardError.userMessage || standardError.message);
        }
    }

    /**
     * Handle async error with strategy
     */
    public async handleAsyncError<T>(
        errorPromise: Promise<T>,
        strategy: ErrorHandlingStrategy,
        options: {
            defaultValue?: T;
            retryFn?: () => Promise<T>;
            maxRetries?: number;
            context?: string;
        } = {}
    ): Promise<T> {
        try {
            return await errorPromise;
        } catch (error) {
            return this.handleError(error as Error, strategy, options);
        }
    }

    /**
     * Standardize any error to StandardError format
     */
    public standardizeError(error: Error | StandardError, context?: string): StandardError {
        if (this.isStandardError(error)) {
            return error;
        }

        // Determine error type from error message/properties
        const type = this.classifyError(error as Error);
        const severity = this.determineSeverity(error as Error, type);

        return this.createError(type, error.message, {
            severity,
            originalError: error as Error,
            context: context ? { operation: context } : undefined,
            userMessage: this.generateUserFriendlyMessage(error as Error, type),
            suggestions: this.generateSuggestions(error as Error, type)
        });
    }

    /**
     * Classify error type based on error message and properties
     */
    private classifyError(error: Error): ErrorType {
        const message = error.message.toLowerCase();

        if (message.includes('authentication') || message.includes('unauthorized') || message.includes('access denied')) {
            return ErrorType.AUTHENTICATION;
        }
        
        if (message.includes('timeout') || message.includes('timed out')) {
            return ErrorType.TIMEOUT;
        }
        
        if (message.includes('network') || message.includes('connection') || message.includes('econnrefused')) {
            return ErrorType.NETWORK;
        }
        
        if (message.includes('file not found') || message.includes('enoent') || message.includes('path')) {
            return ErrorType.FILE_SYSTEM;
        }
        
        if (message.includes('metadata') || message.includes('retrieve') || message.includes('deploy')) {
            return ErrorType.METADATA_RETRIEVAL;
        }
        
        if (message.includes('sf ') || message.includes('sfdx ') || message.includes('cli')) {
            return ErrorType.CLI_COMMAND;
        }
        
        if (message.includes('json') || message.includes('parse') || message.includes('syntax')) {
            return ErrorType.PARSING;
        }
        
        if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
            return ErrorType.VALIDATION;
        }
        
        if (message.includes('config') || message.includes('setting')) {
            return ErrorType.CONFIGURATION;
        }

        return ErrorType.UNKNOWN;
    }

    /**
     * Determine error severity
     */
    private determineSeverity(error: Error, type: ErrorType): ErrorSeverity {
        switch (type) {
            case ErrorType.AUTHENTICATION:
            case ErrorType.CONFIGURATION:
                return ErrorSeverity.HIGH;
                
            case ErrorType.NETWORK:
            case ErrorType.TIMEOUT:
            case ErrorType.CLI_COMMAND:
                return ErrorSeverity.MEDIUM;
                
            case ErrorType.FILE_SYSTEM:
            case ErrorType.METADATA_RETRIEVAL:
            case ErrorType.PARSING:
                return ErrorSeverity.MEDIUM;
                
            case ErrorType.VALIDATION:
                return ErrorSeverity.LOW;
                
            default:
                return ErrorSeverity.MEDIUM;
        }
    }

    /**
     * Generate user-friendly error message
     */
    private generateUserFriendlyMessage(error: Error, type: ErrorType): string {
        switch (type) {
            case ErrorType.AUTHENTICATION:
                return 'Authentication failed. Please check your Salesforce credentials and try again.';
                
            case ErrorType.NETWORK:
                return 'Network connection failed. Please check your internet connection and try again.';
                
            case ErrorType.TIMEOUT:
                return 'Operation timed out. The request took longer than expected.';
                
            case ErrorType.FILE_SYSTEM:
                return 'File system error. The requested file or directory could not be accessed.';
                
            case ErrorType.METADATA_RETRIEVAL:
                return 'Failed to retrieve metadata from the org. Please check your org connection.';
                
            case ErrorType.CLI_COMMAND:
                return 'Salesforce CLI command failed. Please ensure the CLI is properly installed.';
                
            case ErrorType.PARSING:
                return 'Failed to parse response data. The data may be corrupted or in an unexpected format.';
                
            case ErrorType.VALIDATION:
                return 'Validation error. Please check your input and try again.';
                
            case ErrorType.CONFIGURATION:
                return 'Configuration error. Please check your extension settings.';
                
            default:
                return error.message || 'An unexpected error occurred.';
        }
    }

    /**
     * Generate helpful suggestions
     */
    private generateSuggestions(error: Error, type: ErrorType): string[] {
        switch (type) {
            case ErrorType.AUTHENTICATION:
                return [
                    'Run "sf org login web" to authenticate',
                    'Check if your org is still active',
                    'Verify your credentials are correct'
                ];
                
            case ErrorType.NETWORK:
                return [
                    'Check your internet connection',
                    'Verify firewall settings',
                    'Try again in a few minutes'
                ];
                
            case ErrorType.TIMEOUT:
                return [
                    'Try increasing the timeout in settings',
                    'Check your network connection',
                    'Retry the operation'
                ];
                
            case ErrorType.CLI_COMMAND:
                return [
                    'Install Salesforce CLI: https://developer.salesforce.com/tools/sfdxcli',
                    'Update to the latest CLI version',
                    'Restart VS Code after CLI installation'
                ];
                
            case ErrorType.METADATA_RETRIEVAL:
                return [
                    'Check your org permissions',
                    'Verify the metadata type is supported',
                    'Try refreshing the org connection'
                ];
                
            case ErrorType.CONFIGURATION:
                return [
                    'Check extension settings in VS Code',
                    'Reset to default configuration',
                    'Restart the extension'
                ];
                
            default:
                return ['Try the operation again', 'Check the console for more details'];
        }
    }

    /**
     * Show error to user with appropriate UI
     */
    public showErrorToUser(error: StandardError): void {
        const message = error.userMessage || error.message;
        
        switch (error.severity) {
            case ErrorSeverity.CRITICAL:
            case ErrorSeverity.HIGH:
                vscode.window.showErrorMessage(message, ...this.getErrorActions(error));
                break;
                
            case ErrorSeverity.MEDIUM:
                vscode.window.showWarningMessage(message, ...this.getErrorActions(error));
                break;
                
            case ErrorSeverity.LOW:
                vscode.window.showInformationMessage(message);
                break;
        }
    }

    /**
     * Get appropriate actions for error
     */
    private getErrorActions(error: StandardError): string[] {
        const actions: string[] = [];
        
        if (error.suggestions && error.suggestions.length > 0) {
            actions.push('Show Suggestions');
        }
        
        if (error.type === ErrorType.AUTHENTICATION) {
            actions.push('Authenticate');
        }
        
        if (error.type === ErrorType.CLI_COMMAND) {
            actions.push('Open Terminal');
        }
        
        return actions;
    }

    /**
     * Get empty value for generic type
     */
    private getEmptyValue<T>(): T {
        return '' as unknown as T;  // This will work for strings, arrays will need special handling
    }

    /**
     * Check if error is already a StandardError
     */
    private isStandardError(error: any): error is StandardError {
        return error && typeof error.type === 'string' && typeof error.severity === 'string';
    }

    /**
     * Log error to internal log
     */
    private logError(error: StandardError): void {
        this.errorLog.unshift(error);
        
        // Keep log size under limit
        if (this.errorLog.length > this.maxLogSize) {
            this.errorLog = this.errorLog.slice(0, this.maxLogSize);
        }
    }

    /**
     * Get recent errors
     */
    public getRecentErrors(count: number = 10): StandardError[] {
        return this.errorLog.slice(0, count);
    }

    /**
     * Clear error log
     */
    public clearErrorLog(): void {
        this.errorLog = [];
    }

    /**
     * Get error statistics
     */
    public getErrorStats(): {
        totalErrors: number;
        errorsByType: Record<ErrorType, number>;
        errorsBySeverity: Record<ErrorSeverity, number>;
    } {
        const errorsByType = {} as Record<ErrorType, number>;
        const errorsBySeverity = {} as Record<ErrorSeverity, number>;

        // Initialize counts
        Object.values(ErrorType).forEach(type => errorsByType[type] = 0);
        Object.values(ErrorSeverity).forEach(severity => errorsBySeverity[severity] = 0);

        // Count errors
        this.errorLog.forEach(error => {
            errorsByType[error.type]++;
            errorsBySeverity[error.severity]++;
        });

        return {
            totalErrors: this.errorLog.length,
            errorsByType,
            errorsBySeverity
        };
    }
}

/**
 * Utility functions for common error handling patterns
 */
export class ErrorUtils {
    private static errorHandler = ErrorHandler.getInstance();

    /**
     * Wrap function with error handling
     */
    public static withErrorHandling<T, Args extends any[]>(
        fn: (...args: Args) => T | Promise<T>,
        strategy: ErrorHandlingStrategy = ErrorHandlingStrategy.THROW,
        options: {
            defaultValue?: T;
            context?: string;
        } = {}
    ) {
        return async (...args: Args): Promise<T> => {
            try {
                const result = await fn(...args);
                return result;
            } catch (error) {
                return this.errorHandler.handleError(error as Error, strategy, {
                    defaultValue: options.defaultValue,
                    context: options.context
                });
            }
        };
    }

    /**
     * Create typed error for specific scenarios
     */
    public static createAuthError(message: string, context?: Record<string, any>): StandardError {
        return this.errorHandler.createError(ErrorType.AUTHENTICATION, message, {
            severity: ErrorSeverity.HIGH,
            context,
            suggestions: [
                'Run "sf org login web" to authenticate',
                'Check if your org is still active'
            ]
        });
    }

    public static createNetworkError(message: string, context?: Record<string, any>): StandardError {
        return this.errorHandler.createError(ErrorType.NETWORK, message, {
            severity: ErrorSeverity.MEDIUM,
            context,
            suggestions: [
                'Check your internet connection',
                'Try again in a few minutes'
            ]
        });
    }

    public static createMetadataError(message: string, context?: Record<string, any>): StandardError {
        return this.errorHandler.createError(ErrorType.METADATA_RETRIEVAL, message, {
            severity: ErrorSeverity.MEDIUM,
            context,
            suggestions: [
                'Check your org permissions',
                'Try refreshing the org connection'
            ]
        });
    }

    public static createValidationError(message: string, context?: Record<string, any>): StandardError {
        return this.errorHandler.createError(ErrorType.VALIDATION, message, {
            severity: ErrorSeverity.LOW,
            context
        });
    }
}
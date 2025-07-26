import * as vscode from 'vscode';
import { ErrorHandler, ErrorType, ErrorSeverity, StandardError } from './ErrorHandler';

/**
 * User-friendly error messages with context and suggestions
 */
interface UserErrorMessage {
    title: string;
    description: string;
    suggestions: string[];
    actions: ErrorAction[];
    details?: string;
    learnMore?: string;
}

/**
 * Actions that can be taken from error messages
 */
interface ErrorAction {
    label: string;
    action: () => any;
    primary?: boolean;
}

/**
 * Enhanced error reporter that provides user-friendly error messages
 * with actionable suggestions and contextual help
 */
export class UserErrorReporter {
    private static instance: UserErrorReporter;
    private errorHandler: ErrorHandler;

    private constructor() {
        this.errorHandler = ErrorHandler.getInstance();
    }

    public static getInstance(): UserErrorReporter {
        if (!UserErrorReporter.instance) {
            UserErrorReporter.instance = new UserErrorReporter();
        }
        return UserErrorReporter.instance;
    }

    /**
     * Report an error to the user with enhanced messaging
     */
    public async reportError(error: Error | StandardError, context?: string): Promise<void> {
        const standardError = this.errorHandler.standardizeError(error, context);
        const userMessage = this.createUserMessage(standardError);
        
        await this.showUserMessage(userMessage, standardError);
    }

    /**
     * Report a specific operation failure with context
     */
    public async reportOperationFailure(
        operation: string,
        error: Error | StandardError,
        additionalContext?: Record<string, any>
    ): Promise<void> {
        const standardError = this.errorHandler.standardizeError(error, operation);
        if (additionalContext) {
            standardError.context = { ...standardError.context, ...additionalContext };
        }
        
        const userMessage = this.createOperationFailureMessage(operation, standardError);
        await this.showUserMessage(userMessage, standardError);
    }

    /**
     * Report authentication failures with specific guidance
     */
    public async reportAuthenticationFailure(orgAlias?: string, error?: Error): Promise<void> {
        const standardError = this.errorHandler.createError(
            ErrorType.AUTHENTICATION,
            'Authentication failed',
            {
                severity: ErrorSeverity.HIGH,
                context: { orgAlias },
                originalError: error,
                userMessage: orgAlias 
                    ? `Unable to authenticate with organization "${orgAlias}"`
                    : 'Unable to authenticate with Salesforce'
            }
        );

        const userMessage: UserErrorMessage = {
            title: 'Authentication Required',
            description: orgAlias 
                ? `Your session with "${orgAlias}" has expired or is invalid. Please re-authenticate to continue.`
                : 'You need to authenticate with Salesforce to use this extension.',
            suggestions: [
                'Click "Authenticate" to log in with a web browser',
                'Ensure you have the correct permissions in your org',
                'Check if your org is still active and accessible'
            ],
            actions: [
                {
                    label: 'Authenticate',
                    action: this.triggerAuthentication,
                    primary: true
                },
                {
                    label: 'Learn More',
                    action: () => this.openHelpDocument('authentication')
                }
            ],
            learnMore: 'https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_auth.htm'
        };

        await this.showUserMessage(userMessage, standardError);
    }

    /**
     * Report CLI-related errors with installation guidance
     */
    public async reportCliError(command: string, error: Error): Promise<void> {
        const standardError = this.errorHandler.createError(
            ErrorType.CLI_COMMAND,
            `CLI command failed: ${command}`,
            {
                severity: ErrorSeverity.HIGH,
                context: { command },
                originalError: error
            }
        );

        const userMessage: UserErrorMessage = {
            title: 'Salesforce CLI Error',
            description: error.message.includes('not found') || error.message.includes('command not found')
                ? 'The Salesforce CLI is not installed or not accessible. This extension requires the Salesforce CLI to function.'
                : `The Salesforce CLI command "${command}" failed to execute properly.`,
            suggestions: error.message.includes('not found') || error.message.includes('command not found')
                ? [
                    'Install the Salesforce CLI from the official website',
                    'Restart VS Code after installation',
                    'Verify the CLI is in your system PATH'
                ]
                : [
                    'Check that your org is authenticated',
                    'Verify the command parameters are correct',
                    'Update the Salesforce CLI to the latest version',
                    'Check the console output for more details'
                ],
            actions: [
                {
                    label: 'Install CLI',
                    action: () => vscode.env.openExternal(vscode.Uri.parse('https://developer.salesforce.com/tools/sfdxcli')),
                    primary: error.message.includes('not found')
                },
                {
                    label: 'Open Terminal',
                    action: () => vscode.commands.executeCommand('workbench.action.terminal.new')
                },
                {
                    label: 'Check Settings',
                    action: () => vscode.commands.executeCommand('sf-org-source-compare.openUserPreferences', 'api')
                }
            ],
            details: `Command: ${command}\nError: ${error.message}`,
            learnMore: 'https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_install_cli.htm'
        };

        await this.showUserMessage(userMessage, standardError);
    }

    /**
     * Report network-related errors with connectivity guidance
     */
    public async reportNetworkError(operation: string, error: Error): Promise<void> {
        const standardError = this.errorHandler.createError(
            ErrorType.NETWORK,
            `Network error during ${operation}`,
            {
                severity: ErrorSeverity.MEDIUM,
                context: { operation },
                originalError: error
            }
        );

        const userMessage: UserErrorMessage = {
            title: 'Connection Failed',
            description: `Unable to connect to Salesforce while ${operation}. This could be due to network connectivity issues or server problems.`,
            suggestions: [
                'Check your internet connection',
                'Verify your firewall and proxy settings',
                'Try again in a few minutes',
                'Check Salesforce Trust status for outages'
            ],
            actions: [
                {
                    label: 'Retry',
                    action: () => vscode.commands.executeCommand('sf-org-source-compare.refreshOrgs'),
                    primary: true
                },
                {
                    label: 'Check Status',
                    action: () => vscode.env.openExternal(vscode.Uri.parse('https://status.salesforce.com'))
                },
                {
                    label: 'Network Settings',
                    action: () => vscode.commands.executeCommand('sf-org-source-compare.openUserPreferences', 'api')
                }
            ],
            details: error.message
        };

        await this.showUserMessage(userMessage, standardError);
    }

    /**
     * Report timeout errors with performance guidance
     */
    public async reportTimeoutError(operation: string, timeoutMs: number, error: Error): Promise<void> {
        const standardError = this.errorHandler.createError(
            ErrorType.TIMEOUT,
            `Timeout during ${operation}`,
            {
                severity: ErrorSeverity.MEDIUM,
                context: { operation, timeoutMs },
                originalError: error
            }
        );

        const userMessage: UserErrorMessage = {
            title: 'Operation Timed Out',
            description: `The ${operation} operation took longer than ${timeoutMs / 1000} seconds and was cancelled. This might happen with large orgs or slow connections.`,
            suggestions: [
                'Increase the timeout setting for this operation',
                'Try during off-peak hours',
                'Check your network connection speed',
                'Consider reducing the scope of the operation'
            ],
            actions: [
                {
                    label: 'Increase Timeout',
                    action: () => vscode.commands.executeCommand('sf-org-source-compare.openUserPreferences', 'performance'),
                    primary: true
                },
                {
                    label: 'Retry',
                    action: () => vscode.commands.executeCommand('sf-org-source-compare.refreshOrgs')
                }
            ],
            details: `Operation: ${operation}\nTimeout: ${timeoutMs}ms\nError: ${error.message}`
        };

        await this.showUserMessage(userMessage, standardError);
    }

    /**
     * Report file system errors with path guidance
     */
    public async reportFileSystemError(path: string, operation: string, error: Error): Promise<void> {
        const standardError = this.errorHandler.createError(
            ErrorType.FILE_SYSTEM,
            `File system error: ${operation}`,
            {
                severity: ErrorSeverity.MEDIUM,
                context: { path, operation },
                originalError: error
            }
        );

        const isPermissionError = error.message.includes('EACCES') || error.message.includes('permission');
        const isNotFoundError = error.message.includes('ENOENT') || error.message.includes('not found');

        const userMessage: UserErrorMessage = {
            title: isPermissionError ? 'Permission Denied' : isNotFoundError ? 'File Not Found' : 'File System Error',
            description: isPermissionError
                ? `Access denied when ${operation}. The extension doesn't have permission to access "${path}".`
                : isNotFoundError
                ? `The file or directory "${path}" could not be found when ${operation}.`
                : `An error occurred while ${operation} at "${path}".`,
            suggestions: isPermissionError
                ? [
                    'Check file and directory permissions',
                    'Run VS Code with appropriate privileges',
                    'Ensure the path is not restricted by antivirus software'
                ]
                : isNotFoundError
                ? [
                    'Verify the file or directory exists',
                    'Check the path spelling and case sensitivity',
                    'Try refreshing the workspace',
                    'Clear temporary files and retry'
                ]
                : [
                    'Check available disk space',
                    'Verify the path is accessible',
                    'Try the operation again'
                ],
            actions: [
                {
                    label: 'Open Folder',
                    action: () => vscode.commands.executeCommand('vscode.openFolder'),
                    primary: isNotFoundError
                },
                {
                    label: 'Clear Temp Files',
                    action: () => vscode.commands.executeCommand('sf-org-source-compare.cleanupTempFiles')
                },
                {
                    label: 'Retry',
                    action: () => vscode.commands.executeCommand('sf-org-source-compare.refreshOrgs')
                }
            ],
            details: `Path: ${path}\nOperation: ${operation}\nError: ${error.message}`
        };

        await this.showUserMessage(userMessage, standardError);
    }

    /**
     * Create a user-friendly message from a StandardError
     */
    private createUserMessage(error: StandardError): UserErrorMessage {
        switch (error.type) {
            case ErrorType.AUTHENTICATION:
                return {
                    title: 'Authentication Required',
                    description: error.userMessage || 'Please authenticate with Salesforce to continue.',
                    suggestions: error.suggestions || ['Run authentication command', 'Check credentials'],
                    actions: [
                        {
                            label: 'Authenticate',
                            action: this.triggerAuthentication,
                            primary: true
                        }
                    ]
                };

            case ErrorType.NETWORK:
                return {
                    title: 'Connection Failed',
                    description: error.userMessage || 'Network connection to Salesforce failed.',
                    suggestions: error.suggestions || ['Check internet connection', 'Try again later'],
                    actions: [
                        {
                            label: 'Retry',
                            action: () => vscode.commands.executeCommand('sf-org-source-compare.refreshOrgs'),
                            primary: true
                        }
                    ]
                };

            case ErrorType.TIMEOUT:
                return {
                    title: 'Operation Timed Out',
                    description: error.userMessage || 'The operation took too long to complete.',
                    suggestions: error.suggestions || ['Increase timeout in settings', 'Try again'],
                    actions: [
                        {
                            label: 'Adjust Settings',
                            action: () => vscode.commands.executeCommand('sf-org-source-compare.openUserPreferences', 'performance'),
                            primary: true
                        }
                    ]
                };

            case ErrorType.CLI_COMMAND:
                return {
                    title: 'CLI Command Failed',
                    description: error.userMessage || 'Salesforce CLI command execution failed.',
                    suggestions: error.suggestions || ['Check CLI installation', 'Update CLI version'],
                    actions: [
                        {
                            label: 'Open Terminal',
                            action: () => vscode.commands.executeCommand('workbench.action.terminal.new'),
                            primary: true
                        }
                    ]
                };

            default:
                return {
                    title: 'Error',
                    description: error.userMessage || error.message || 'An unexpected error occurred.',
                    suggestions: error.suggestions || ['Try the operation again'],
                    actions: []
                };
        }
    }

    /**
     * Create a user message for operation failures
     */
    private createOperationFailureMessage(operation: string, error: StandardError): UserErrorMessage {
        const baseMessage = this.createUserMessage(error);
        
        return {
            ...baseMessage,
            title: `${operation} Failed`,
            description: `Failed to ${operation.toLowerCase()}. ${baseMessage.description}`,
            details: error.context ? JSON.stringify(error.context, null, 2) : undefined
        };
    }

    /**
     * Show user message with appropriate VS Code UI
     */
    private async showUserMessage(userMessage: UserErrorMessage, error: StandardError): Promise<void> {
        const actions = userMessage.actions.map(action => action.label);
        const allActions = [...actions];
        
        if (userMessage.details) {
            allActions.push('Show Details');
        }
        
        if (userMessage.learnMore) {
            allActions.push('Learn More');
        }

        let showFunction: (message: string, ...items: string[]) => Thenable<string | undefined>;
        
        switch (error.severity) {
            case ErrorSeverity.CRITICAL:
            case ErrorSeverity.HIGH:
                showFunction = vscode.window.showErrorMessage;
                break;
            case ErrorSeverity.MEDIUM:
                showFunction = vscode.window.showWarningMessage;
                break;
            default:
                showFunction = vscode.window.showInformationMessage;
                break;
        }

        const selectedAction = await showFunction(
            `${userMessage.title}: ${userMessage.description}`,
            ...allActions
        );

        if (selectedAction) {
            await this.handleActionSelection(selectedAction, userMessage, error);
        }
    }

    /**
     * Handle user action selection
     */
    private async handleActionSelection(
        selectedAction: string,
        userMessage: UserErrorMessage,
        error: StandardError
    ): Promise<void> {
        if (selectedAction === 'Show Details') {
            await this.showErrorDetails(userMessage, error);
            return;
        }

        if (selectedAction === 'Learn More' && userMessage.learnMore) {
            await vscode.env.openExternal(vscode.Uri.parse(userMessage.learnMore));
            return;
        }

        const action = userMessage.actions.find(a => a.label === selectedAction);
        if (action) {
            try {
                await action.action();
            } catch (actionError) {
                console.error('Error executing user action:', actionError);
                vscode.window.showErrorMessage(`Failed to execute action "${selectedAction}"`);
            }
        }
    }

    /**
     * Show detailed error information
     */
    private async showErrorDetails(userMessage: UserErrorMessage, error: StandardError): Promise<void> {
        const suggestions = userMessage.suggestions.map(s => `• ${s}`).join('\n');
        const details = userMessage.details || 'No additional details available.';
        
        const fullMessage = `
**Error Details:**
${userMessage.description}

**Suggestions:**
${suggestions}

**Technical Details:**
${details}

**Error Type:** ${error.type}
**Severity:** ${error.severity}
**Timestamp:** ${error.timestamp.toISOString()}
        `.trim();

        const panel = vscode.window.createWebviewPanel(
            'errorDetails',
            `Error Details - ${userMessage.title}`,
            vscode.ViewColumn.One,
            { enableScripts: false }
        );

        panel.webview.html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Error Details</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        pre {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 10px;
            border-radius: 4px;
            overflow-x: auto;
        }
        .error-type {
            color: var(--vscode-errorForeground);
            font-weight: bold;
        }
        .timestamp {
            color: var(--vscode-descriptionForeground);
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <h1>${userMessage.title}</h1>
    <pre>${fullMessage}</pre>
</body>
</html>`;
    }

    /**
     * Trigger Salesforce authentication
     */
    private async triggerAuthentication(): Promise<void> {
        try {
            await vscode.commands.executeCommand('sf-org-source-compare.addOrg');
        } catch (error) {
            console.error('Failed to trigger authentication:', error);
            vscode.window.showErrorMessage('Failed to start authentication process');
        }
    }

    /**
     * Open help document
     */
    private async openHelpDocument(topic: string): Promise<void> {
        const helpUrls: Record<string, string> = {
            'authentication': 'https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_auth.htm',
            'cli': 'https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_install_cli.htm',
            'troubleshooting': 'https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_troubleshoot.htm'
        };

        const url = helpUrls[topic];
        if (url) {
            await vscode.env.openExternal(vscode.Uri.parse(url));
        }
    }
}
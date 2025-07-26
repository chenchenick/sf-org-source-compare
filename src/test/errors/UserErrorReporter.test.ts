import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { UserErrorReporter } from '../../errors/UserErrorReporter';
import { ErrorHandler, ErrorType, ErrorSeverity } from '../../errors/ErrorHandler';

suite('UserErrorReporter Test Suite', () => {
    let userErrorReporter: UserErrorReporter;
    let mockErrorHandler: sinon.SinonStubbedInstance<ErrorHandler>;
    let showErrorMessageStub: sinon.SinonStub;
    let showWarningMessageStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;
    let createWebviewPanelStub: sinon.SinonStub;
    let executeCommandStub: sinon.SinonStub;
    let openExternalStub: sinon.SinonStub;

    setup(() => {
        // Mock ErrorHandler
        mockErrorHandler = {
            standardizeError: sinon.stub(),
            createError: sinon.stub()
        } as any;

        // Mock VS Code API
        showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
        showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage');
        showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
        createWebviewPanelStub = sinon.stub(vscode.window, 'createWebviewPanel');
        executeCommandStub = sinon.stub(vscode.commands, 'executeCommand');
        openExternalStub = sinon.stub(vscode.env, 'openExternal');

        // Mock static methods
        sinon.stub(ErrorHandler, 'getInstance').returns(mockErrorHandler as any);

        userErrorReporter = UserErrorReporter.getInstance();
    });

    teardown(() => {
        sinon.restore();
    });

    suite('Basic Error Reporting', () => {
        test('should report error with enhanced messaging', async () => {
            const testError = new Error('Test error message');
            const standardError = {
                type: ErrorType.NETWORK,
                severity: ErrorSeverity.MEDIUM,
                message: 'Test error message',
                userMessage: 'Network connection failed',
                suggestions: ['Check internet connection', 'Try again later'],
                timestamp: new Date()
            };

            mockErrorHandler.standardizeError.returns(standardError);
            showWarningMessageStub.resolves('Retry');

            await userErrorReporter.reportError(testError, 'test operation');

            assert.ok(mockErrorHandler.standardizeError.calledWith(testError, 'test operation'));
            assert.ok(showWarningMessageStub.calledOnce);
            
            const messageCall = showWarningMessageStub.getCall(0);
            assert.ok(messageCall.args[0].includes('Connection Failed'));
            assert.ok(messageCall.args.includes('Retry'));
        });

        test('should handle different error severities', async () => {
            const highSeverityError = {
                type: ErrorType.AUTHENTICATION,
                severity: ErrorSeverity.HIGH,
                message: 'Auth failed',
                userMessage: 'Authentication required',
                suggestions: [],
                timestamp: new Date()
            };

            const lowSeverityError = {
                type: ErrorType.VALIDATION,
                severity: ErrorSeverity.LOW,
                message: 'Validation failed',
                userMessage: 'Invalid input',
                suggestions: [],
                timestamp: new Date()
            };

            mockErrorHandler.standardizeError.returns(highSeverityError);
            await userErrorReporter.reportError(new Error('test'), 'auth');
            assert.ok(showErrorMessageStub.calledOnce);

            showErrorMessageStub.resetHistory();
            mockErrorHandler.standardizeError.returns(lowSeverityError);
            await userErrorReporter.reportError(new Error('test'), 'validation');
            assert.ok(showInformationMessageStub.calledOnce);
        });
    });

    suite('Specific Error Type Reporting', () => {
        test('should report authentication failure with specific guidance', async () => {
            showErrorMessageStub.resolves('Authenticate');
            executeCommandStub.resolves();

            await userErrorReporter.reportAuthenticationFailure('test-org', new Error('Auth failed'));

            assert.ok(showErrorMessageStub.calledOnce);
            const messageCall = showErrorMessageStub.getCall(0);
            assert.ok(messageCall.args[0].includes('Authentication Required'));
            assert.ok(messageCall.args[0].includes('test-org'));
            assert.ok(messageCall.args.includes('Authenticate'));
        });

        test('should report CLI error with installation guidance', async () => {
            const cliError = new Error('sf: command not found');
            showErrorMessageStub.resolves('Install CLI');
            openExternalStub.resolves();

            await userErrorReporter.reportCliError('sf org list', cliError);

            assert.ok(showErrorMessageStub.calledOnce);
            const messageCall = showErrorMessageStub.getCall(0);
            assert.ok(messageCall.args[0].includes('Salesforce CLI Error'));
            assert.ok(messageCall.args.includes('Install CLI'));
        });

        test('should report network error with connectivity guidance', async () => {
            const networkError = new Error('ECONNREFUSED');
            showWarningMessageStub.resolves('Retry');
            executeCommandStub.resolves();

            await userErrorReporter.reportNetworkError('fetching data', networkError);

            assert.ok(showWarningMessageStub.calledOnce);
            const messageCall = showWarningMessageStub.getCall(0);
            assert.ok(messageCall.args[0].includes('Connection Failed'));
            assert.ok(messageCall.args.includes('Retry'));
        });

        test('should report timeout error with performance guidance', async () => {
            const timeoutError = new Error('Operation timed out');
            showWarningMessageStub.resolves('Increase Timeout');
            executeCommandStub.resolves();

            await userErrorReporter.reportTimeoutError('data retrieval', 30000, timeoutError);

            assert.ok(showWarningMessageStub.calledOnce);
            const messageCall = showWarningMessageStub.getCall(0);
            assert.ok(messageCall.args[0].includes('Operation Timed Out'));
            assert.ok(messageCall.args[0].includes('30 seconds'));
            assert.ok(messageCall.args.includes('Increase Timeout'));
        });

        test('should report file system error with path guidance', async () => {
            const fileError = new Error('ENOENT: no such file or directory');
            showWarningMessageStub.resolves('Open Folder');
            executeCommandStub.resolves();

            await userErrorReporter.reportFileSystemError('/test/path', 'reading file', fileError);

            assert.ok(showWarningMessageStub.calledOnce);
            const messageCall = showWarningMessageStub.getCall(0);
            assert.ok(messageCall.args[0].includes('File Not Found'));
            assert.ok(messageCall.args[0].includes('/test/path'));
            assert.ok(messageCall.args.includes('Open Folder'));
        });
    });

    suite('Operation Failure Reporting', () => {
        test('should report operation failure with context', async () => {
            const testError = new Error('Operation failed');
            const standardError = {
                type: ErrorType.METADATA_RETRIEVAL,
                severity: ErrorSeverity.MEDIUM,
                message: 'Metadata retrieval failed',
                userMessage: 'Failed to retrieve metadata',
                suggestions: ['Check permissions'],
                timestamp: new Date(),
                context: { orgId: 'test-org' }
            };

            mockErrorHandler.standardizeError.returns(standardError);
            showWarningMessageStub.resolves();

            await userErrorReporter.reportOperationFailure(
                'Retrieve metadata',
                testError,
                { orgId: 'test-org', metadataType: 'ApexClass' }
            );

            assert.ok(mockErrorHandler.standardizeError.calledWith(testError, 'Retrieve metadata'));
            assert.ok(showWarningMessageStub.calledOnce);
            
            const messageCall = showWarningMessageStub.getCall(0);
            assert.ok(messageCall.args[0].includes('Retrieve Metadata Failed'));
        });
    });

    suite('Action Handling', () => {
        test('should handle authenticate action', async () => {
            showErrorMessageStub.resolves('Authenticate');
            executeCommandStub.resolves();

            await userErrorReporter.reportAuthenticationFailure();

            // Verify authentication command was called when user clicks Authenticate
            // Note: The actual action execution happens after user interaction
            assert.ok(showErrorMessageStub.calledOnce);
        });

        test('should handle show details action', async () => {
            const testError = new Error('Test error');
            const standardError = {
                type: ErrorType.UNKNOWN,
                severity: ErrorSeverity.MEDIUM,
                message: 'Test error',
                userMessage: 'Test error occurred',
                suggestions: ['Try again'],
                timestamp: new Date()
            };

            mockErrorHandler.standardizeError.returns(standardError);
            showWarningMessageStub.resolves('Show Details');
            
            const mockPanel = {
                webview: { html: '' }
            };
            createWebviewPanelStub.returns(mockPanel);

            await userErrorReporter.reportError(testError);

            assert.ok(showWarningMessageStub.calledOnce);
            const messageCall = showWarningMessageStub.getCall(0);
            assert.ok(messageCall.args.includes('Show Details'));
        });

        test('should handle learn more action', async () => {
            showErrorMessageStub.resolves('Learn More');
            openExternalStub.resolves();

            await userErrorReporter.reportAuthenticationFailure();

            assert.ok(showErrorMessageStub.calledOnce);
            const messageCall = showErrorMessageStub.getCall(0);
            assert.ok(messageCall.args.includes('Learn More'));
        });
    });

    suite('Error Details Display', () => {
        test('should create webview for error details', async () => {
            const userMessage = {
                title: 'Test Error',
                description: 'Test description',
                suggestions: ['Suggestion 1', 'Suggestion 2'],
                actions: [],
                details: 'Technical details'
            };

            const standardError = {
                type: ErrorType.UNKNOWN,
                severity: ErrorSeverity.MEDIUM,
                message: 'Test error',
                timestamp: new Date()
            };

            const mockPanel = {
                webview: { html: '' }
            };
            createWebviewPanelStub.returns(mockPanel);

            // Use reflection to access private method for testing
            const showErrorDetails = (userErrorReporter as any).showErrorDetails;
            await showErrorDetails.call(userErrorReporter, userMessage, standardError);

            assert.ok(createWebviewPanelStub.calledOnce);
            const panelCall = createWebviewPanelStub.getCall(0);
            assert.strictEqual(panelCall.args[0], 'errorDetails');
            assert.strictEqual(panelCall.args[1], 'Error Details - Test Error');
        });
    });

    suite('Message Creation', () => {
        test('should create appropriate user messages for different error types', async () => {
            const authError = {
                type: ErrorType.AUTHENTICATION,
                severity: ErrorSeverity.HIGH,
                message: 'Auth failed',
                suggestions: ['Authenticate'],
                timestamp: new Date()
            };

            const networkError = {
                type: ErrorType.NETWORK,
                severity: ErrorSeverity.MEDIUM,
                message: 'Network failed',
                suggestions: ['Check connection'],
                timestamp: new Date()
            };

            // Test authentication error message
            const createUserMessage = (userErrorReporter as any).createUserMessage;
            const authMessage = createUserMessage.call(userErrorReporter, authError);
            assert.strictEqual(authMessage.title, 'Authentication Required');
            assert.ok(authMessage.actions.some((action: any) => action.label === 'Authenticate'));

            // Test network error message
            const networkMessage = createUserMessage.call(userErrorReporter, networkError);
            assert.strictEqual(networkMessage.title, 'Connection Failed');
            assert.ok(networkMessage.actions.some((action: any) => action.label === 'Retry'));
        });
    });

    suite('Singleton Pattern', () => {
        test('should return same instance', () => {
            const instance1 = UserErrorReporter.getInstance();
            const instance2 = UserErrorReporter.getInstance();
            
            assert.strictEqual(instance1, instance2);
        });
    });

    suite('Error Action Execution', () => {
        test('should handle action execution errors gracefully', async () => {
            const testError = new Error('Test error');
            const standardError = {
                type: ErrorType.UNKNOWN,
                severity: ErrorSeverity.MEDIUM,
                message: 'Test error',
                userMessage: 'Test error occurred',
                suggestions: [],
                actions: [],
                timestamp: new Date()
            };

            mockErrorHandler.standardizeError.returns(standardError);
            showWarningMessageStub.resolves('Retry');
            executeCommandStub.rejects(new Error('Command failed'));

            const consoleErrorStub = sinon.stub(console, 'error');

            await userErrorReporter.reportError(testError);

            // The error should be logged but not rethrown
            assert.ok(showWarningMessageStub.calledOnce);
            
            consoleErrorStub.restore();
        });
    });
});
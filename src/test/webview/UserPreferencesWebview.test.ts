import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { UserPreferencesWebview } from '../../webview/UserPreferencesWebview';
import { ConfigurationManager } from '../../config/ConfigurationManager';
import { ErrorHandler } from '../../errors/ErrorHandler';

suite('UserPreferencesWebview Test Suite', () => {
    let userPreferencesWebview: UserPreferencesWebview;
    let mockContext: vscode.ExtensionContext;
    let mockConfigManager: sinon.SinonStubbedInstance<ConfigurationManager>;
    let mockErrorHandler: sinon.SinonStubbedInstance<ErrorHandler>;
    let mockPanel: sinon.SinonStubbedInstance<vscode.WebviewPanel>;
    let mockWebview: sinon.SinonStubbedInstance<vscode.Webview>;
    let createWebviewPanelStub: sinon.SinonStub;

    setup(() => {
        // Mock VS Code context
        mockContext = {
            subscriptions: [],
            workspaceState: {} as any,
            globalState: {} as any,
            extensionUri: {} as any,
            extensionPath: '/test/path',
            storageUri: {} as any,
            storagePath: '/test/storage',
            globalStorageUri: {} as any,
            globalStoragePath: '/test/global-storage',
            logUri: {} as any,
            logPath: '/test/log',
            extensionMode: vscode.ExtensionMode.Test,
            secrets: {} as any,
            environmentVariableCollection: {} as any,
            asAbsolutePath: sinon.stub().returns('/test/absolute'),
            extension: {} as any,
            languageModelAccessInformation: {} as any
        };

        // Mock ConfigurationManager
        mockConfigManager = {
            isAutoRefreshEnabled: sinon.stub().returns(false),
            shouldShowProgress: sinon.stub().returns(true),
            getTimeout: sinon.stub().returns(30000),
            getMaxConcurrentRequests: sinon.stub().returns(5),
            getCacheConfig: sinon.stub().returns({ ttl: 1800000 }),
            getApiVersion: sinon.stub().returns('58.0'),
            getEnabledMetadataTypes: sinon.stub().returns(['ApexClass', 'ApexTrigger']),
            getLogLevel: sinon.stub().returns('info'),
            getConfiguration: sinon.stub().returns({
                apiVersion: '58.0',
                defaultTimeout: 30000,
                extendedTimeout: 60000,
                maxConcurrentRequests: 5,
                cacheTtl: 1800000,
                enabledMetadataTypes: ['ApexClass', 'ApexTrigger'],
                autoRefresh: false,
                showProgress: true,
                logLevel: 'info'
            }),
            set: sinon.stub().resolves(),
            resetToDefaults: sinon.stub().resolves(),
            validateConfiguration: sinon.stub().returns({ valid: true, errors: [] })
        } as any;

        // Mock ErrorHandler
        mockErrorHandler = {
            handleError: sinon.stub()
        } as any;

        // Mock webview
        mockWebview = {
            html: '',
            postMessage: sinon.stub().resolves(),
            onDidReceiveMessage: sinon.stub()
        } as any;

        // Mock panel
        mockPanel = {
            webview: mockWebview as any,
            reveal: sinon.stub(),
            onDidDispose: sinon.stub()
        } as any;

        // Stub VS Code API
        createWebviewPanelStub = sinon.stub(vscode.window, 'createWebviewPanel').returns(mockPanel as any);
        sinon.stub(ConfigurationManager, 'getInstance').returns(mockConfigManager as any);
        sinon.stub(ErrorHandler, 'getInstance').returns(mockErrorHandler as any);

        userPreferencesWebview = new UserPreferencesWebview(mockContext);
    });

    teardown(() => {
        sinon.restore();
    });

    suite('Initialization', () => {
        test('should create instance with context', () => {
            assert.ok(userPreferencesWebview);
        });
    });

    suite('Webview Display', () => {
        test('should create and show webview panel', async () => {
            await userPreferencesWebview.show();

            assert.ok(createWebviewPanelStub.calledOnce);
            const createCall = createWebviewPanelStub.getCall(0);
            assert.strictEqual(createCall.args[0], 'userPreferences');
            assert.strictEqual(createCall.args[1], 'SF Org Compare - User Preferences');
            assert.strictEqual(createCall.args[2], vscode.ViewColumn.One);
        });

        test('should reveal existing panel if already open', async () => {
            // First call creates panel
            await userPreferencesWebview.show();
            assert.ok(createWebviewPanelStub.calledOnce);

            // Second call should reveal existing panel
            await userPreferencesWebview.show();
            assert.ok(createWebviewPanelStub.calledOnce); // Still only one call
            assert.ok(mockPanel.reveal.calledOnce);
        });

        test('should send preferences data to webview', async () => {
            await userPreferencesWebview.show();

            assert.ok(mockWebview.postMessage.calledWith(
                sinon.match({
                    command: 'loadPreferences',
                    categories: sinon.match.array
                })
            ));
        });

        test('should focus category when specified', async () => {
            await userPreferencesWebview.show('performance');

            assert.ok(mockWebview.postMessage.calledWith(
                sinon.match({
                    command: 'focusCategory',
                    categoryId: 'performance'
                })
            ));
        });
    });

    suite('Preference Categories', () => {
        test('should generate correct preference categories', async () => {
            await userPreferencesWebview.show();

            const postMessageCall = mockWebview.postMessage.getCall(0);
            const categories = postMessageCall.args[0].categories;

            assert.ok(Array.isArray(categories));
            assert.ok(categories.length > 0);

            // Check category structure
            const generalCategory = categories.find((cat: any) => cat.id === 'general');
            assert.ok(generalCategory);
            assert.strictEqual(generalCategory.title, 'General');
            assert.ok(Array.isArray(generalCategory.settings));

            const performanceCategory = categories.find((cat: any) => cat.id === 'performance');
            assert.ok(performanceCategory);
            assert.strictEqual(performanceCategory.title, 'Performance');

            const apiCategory = categories.find((cat: any) => cat.id === 'api');
            assert.ok(apiCategory);
            assert.strictEqual(apiCategory.title, 'Salesforce API');

            const metadataCategory = categories.find((cat: any) => cat.id === 'metadata');
            assert.ok(metadataCategory);
            assert.strictEqual(metadataCategory.title, 'Metadata');

            const uiCategory = categories.find((cat: any) => cat.id === 'ui');
            assert.ok(uiCategory);
            assert.strictEqual(uiCategory.title, 'User Interface');
        });

        test('should include correct settings in general category', async () => {
            await userPreferencesWebview.show();

            const postMessageCall = mockWebview.postMessage.getCall(0);
            const categories = postMessageCall.args[0].categories;
            const generalCategory = categories.find((cat: any) => cat.id === 'general');

            assert.ok(generalCategory.settings.some((setting: any) => 
                setting.key === 'autoRefresh' && setting.type === 'boolean'
            ));
            assert.ok(generalCategory.settings.some((setting: any) =>
                setting.key === 'showProgress' && setting.type === 'boolean'
            ));
        });

        test('should include correct settings in performance category', async () => {
            await userPreferencesWebview.show();

            const postMessageCall = mockWebview.postMessage.getCall(0);
            const categories = postMessageCall.args[0].categories;
            const performanceCategory = categories.find((cat: any) => cat.id === 'performance');

            assert.ok(performanceCategory.settings.some((setting: any) =>
                setting.key === 'defaultTimeout' && setting.type === 'number'
            ));
            assert.ok(performanceCategory.settings.some((setting: any) =>
                setting.key === 'extendedTimeout' && setting.type === 'number'
            ));
            assert.ok(performanceCategory.settings.some((setting: any) =>
                setting.key === 'maxConcurrentRequests' && setting.type === 'number'
            ));
        });
    });

    suite('Message Handling', () => {
        test('should setup message handling on show', async () => {
            await userPreferencesWebview.show();

            assert.ok(mockWebview.onDidReceiveMessage.calledOnce);
        });

        test('should handle updateSetting message', async () => {
            await userPreferencesWebview.show();

            // Get the message handler
            const messageHandler = mockWebview.onDidReceiveMessage.getCall(0).args[0];

            // Simulate updateSetting message
            await messageHandler({
                command: 'updateSetting',
                key: 'autoRefresh',
                value: true
            });

            assert.ok(mockConfigManager.set.calledWith('autoRefresh', true));
        });

        test('should handle resetToDefaults message', async () => {
            await userPreferencesWebview.show();

            const messageHandler = mockWebview.onDidReceiveMessage.getCall(0).args[0];

            await messageHandler({
                command: 'resetToDefaults'
            });

            assert.ok(mockConfigManager.resetToDefaults.calledOnce);
        });

        test('should handle validateSettings message', async () => {
            await userPreferencesWebview.show();

            const messageHandler = mockWebview.onDidReceiveMessage.getCall(0).args[0];

            await messageHandler({
                command: 'validateSettings'
            });

            assert.ok(mockConfigManager.validateConfiguration.calledOnce);
            assert.ok(mockWebview.postMessage.calledWith(
                sinon.match({
                    command: 'validationResult',
                    valid: true,
                    errors: []
                })
            ));
        });

        test('should handle unknown command gracefully', async () => {
            await userPreferencesWebview.show();

            const messageHandler = mockWebview.onDidReceiveMessage.getCall(0).args[0];
            const consoleWarnStub = sinon.stub(console, 'warn');

            await messageHandler({
                command: 'unknownCommand'
            });

            assert.ok(consoleWarnStub.calledWith('Unknown command:', 'unknownCommand'));
            consoleWarnStub.restore();
        });

        test('should handle errors in message processing', async () => {
            mockConfigManager.set.rejects(new Error('Config error'));
            await userPreferencesWebview.show();

            const messageHandler = mockWebview.onDidReceiveMessage.getCall(0).args[0];

            await messageHandler({
                command: 'updateSetting',
                key: 'autoRefresh',
                value: true
            });

            assert.ok(mockErrorHandler.handleError.calledOnce);
            assert.ok(mockWebview.postMessage.calledWith(
                sinon.match({
                    command: 'error',
                    message: sinon.match.string
                })
            ));
        });
    });

    suite('Settings Operations', () => {
        test('should export settings successfully', async () => {
            const mockUri = vscode.Uri.file('/test/settings.json');
            const showSaveDialogStub = sinon.stub(vscode.window, 'showSaveDialog').resolves(mockUri);
            const writeFileStub = sinon.stub(vscode.workspace.fs, 'writeFile').resolves();
            const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage');

            await userPreferencesWebview.show();
            const messageHandler = mockWebview.onDidReceiveMessage.getCall(0).args[0];

            await messageHandler({
                command: 'exportSettings'
            });

            assert.ok(showSaveDialogStub.calledOnce);
            assert.ok(writeFileStub.calledOnce);
            assert.ok(showInfoStub.calledWith('Settings exported successfully'));

            showSaveDialogStub.restore();
            writeFileStub.restore();
            showInfoStub.restore();
        });

        test('should import settings successfully', async () => {
            const mockUri = vscode.Uri.file('/test/settings.json');
            const settingsContent = JSON.stringify({ autoRefresh: true, showProgress: false });
            
            const showOpenDialogStub = sinon.stub(vscode.window, 'showOpenDialog').resolves([mockUri]);
            const readFileStub = sinon.stub(vscode.workspace.fs, 'readFile').resolves(Buffer.from(settingsContent));
            const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage');

            await userPreferencesWebview.show();
            const messageHandler = mockWebview.onDidReceiveMessage.getCall(0).args[0];

            await messageHandler({
                command: 'importSettings'
            });

            assert.ok(showOpenDialogStub.calledOnce);
            assert.ok(readFileStub.calledOnce);
            assert.ok(mockConfigManager.set.calledWith('autoRefresh', true));
            assert.ok(mockConfigManager.set.calledWith('showProgress', false));
            assert.ok(showInfoStub.calledWith('Settings imported successfully'));

            showOpenDialogStub.restore();
            readFileStub.restore();
            showInfoStub.restore();
        });
    });

    suite('Version Helpers', () => {
        test('should provide correct version labels', async () => {
            await userPreferencesWebview.show();

            const postMessageCall = mockWebview.postMessage.getCall(0);
            const categories = postMessageCall.args[0].categories;
            const apiCategory = categories.find((cat: any) => cat.id === 'api');
            const apiVersionSetting = apiCategory.settings.find((setting: any) => setting.key === 'apiVersion');

            const options = apiVersionSetting.options;
            const version58Option = options.find((opt: any) => opt.value === '58.0');
            
            assert.ok(version58Option);
            assert.ok(version58Option.label.includes('Winter \'24'));
            assert.ok(version58Option.description.includes('Stable release'));
        });
    });

    suite('HTML Content Generation', () => {
        test('should generate valid HTML content', async () => {
            await userPreferencesWebview.show();

            const html = mockPanel.webview.html;
            assert.ok(typeof html === 'string');
            assert.ok(html.includes('<!DOCTYPE html>'));
            assert.ok(html.includes('<title>User Preferences</title>'));
            assert.ok(html.includes('acquireVsCodeApi()'));
            assert.ok(html.includes('function renderPreferences()'));
        });
    });

    suite('Cleanup', () => {
        test('should handle panel disposal', async () => {
            await userPreferencesWebview.show();

            // Get the disposal handler
            const disposalHandler = mockPanel.onDidDispose.getCall(0).args[0];

            // Simulate panel disposal
            disposalHandler();

            // Should be able to create new panel
            await userPreferencesWebview.show();
            assert.strictEqual(createWebviewPanelStub.callCount, 2);
        });
    });
});
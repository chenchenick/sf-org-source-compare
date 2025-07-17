import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as extension from '../extension';
import { OrgManager } from '../services/OrgManager';
import { FileCompareService } from '../services/FileCompareService';
import { SfOrgCompareProvider } from '../providers/SfOrgCompareProvider';
import { 
    createMockContext, 
    setupVSCodeMocks, 
    createMockExec,
    MockSfCliResponses,
    TestData,
    cleanupTest
} from './utils/testHelpers';

suite('Extension Test Suite', () => {
    let mockContext: vscode.ExtensionContext;
    let mockExecAsync: sinon.SinonStub;
    let vscodeStubs: ReturnType<typeof setupVSCodeMocks>;

    setup(() => {
        mockContext = createMockContext();
        mockExecAsync = createMockExec();
        vscodeStubs = setupVSCodeMocks();
    });

    teardown(() => {
        cleanupTest();
    });

    suite('Extension Activation', () => {
        test('should activate extension successfully', () => {
            // Mock tree data provider registration
            const registerTreeDataProviderStub = sinon.stub(vscode.window, 'registerTreeDataProvider');
            const registerCommandStub = sinon.stub(vscode.commands, 'registerCommand').returns({
                dispose: sinon.stub()
            } as any);

            extension.activate(mockContext);

            // Verify tree data provider is registered
            assert.ok(registerTreeDataProviderStub.calledWith('sfOrgCompareView'));

            // Verify all commands are registered
            const expectedCommands = [
                'sf-org-source-compare.openCompareView',
                'sf-org-source-compare.refreshOrgs',
                'sf-org-source-compare.compareFiles',
                'sf-org-source-compare.selectOrg',
                'sf-org-source-compare.selectFile',
                'sf-org-source-compare.addOrg',
                'sf-org-source-compare.deleteOrg',
                'sf-org-source-compare.clearSelection'
            ];

            expectedCommands.forEach(command => {
                assert.ok(
                    registerCommandStub.calledWith(command),
                    `Command ${command} should be registered`
                );
            });

            // Verify activation message
            assert.ok(vscodeStubs.showInformationMessage.calledWith('SF Org Compare extension activated!'));
        });

        test('should handle activation errors gracefully', () => {
            const registerTreeDataProviderStub = sinon.stub(vscode.window, 'registerTreeDataProvider');
            registerTreeDataProviderStub.throws(new Error('Registration failed'));

            // Should not throw during activation
            assert.doesNotThrow(() => {
                extension.activate(mockContext);
            });
        });
    });

    suite('Command Handlers', () => {
        let orgManager: OrgManager;
        let fileCompareService: FileCompareService;
        let provider: SfOrgCompareProvider;

        setup(() => {
            orgManager = new OrgManager(mockContext);
            fileCompareService = new FileCompareService(orgManager);
            provider = new SfOrgCompareProvider(orgManager, fileCompareService);
        });

        test('should handle openCompareView command', async () => {
            extension.activate(mockContext);

            // Execute the command
            await vscode.commands.executeCommand('sf-org-source-compare.openCompareView');

            // Should focus the view
            assert.ok(vscodeStubs.executeCommand.calledWith('sfOrgCompareView.focus'));
        });

        test('should handle refreshOrgs command', async () => {
            const refreshSpy = sinon.spy(provider, 'refresh');
            extension.activate(mockContext);

            await vscode.commands.executeCommand('sf-org-source-compare.refreshOrgs');

            assert.ok(refreshSpy.calledOnce);
        });

        test('should handle compareFiles command', async () => {
            const compareSpy = sinon.spy(fileCompareService, 'compareSelectedFiles');
            extension.activate(mockContext);

            await vscode.commands.executeCommand('sf-org-source-compare.compareFiles');

            assert.ok(compareSpy.calledOnce);
        });

        test('should handle addOrg command', async () => {
            mockExecAsync.resolves({
                stdout: JSON.stringify(MockSfCliResponses.orgList(TestData.multipleOrgs(2)))
            });

            const authenticateSpy = sinon.spy(orgManager, 'authenticateOrg');
            const refreshSpy = sinon.spy(provider, 'refresh');

            extension.activate(mockContext);

            await vscode.commands.executeCommand('sf-org-source-compare.addOrg');

            assert.ok(authenticateSpy.calledOnce);
            assert.ok(refreshSpy.calledOnce);
        });

        test('should handle selectOrg command for "no-orgs" case', async () => {
            mockExecAsync.resolves({
                stdout: JSON.stringify(MockSfCliResponses.orgList(TestData.multipleOrgs(1)))
            });

            const authenticateSpy = sinon.spy(orgManager, 'authenticateOrg');
            const refreshSpy = sinon.spy(provider, 'refresh');

            extension.activate(mockContext);

            const orgItem = { id: 'no-orgs', label: 'Add organization' };
            await vscode.commands.executeCommand('sf-org-source-compare.selectOrg', orgItem);

            assert.ok(authenticateSpy.calledOnce);
            assert.ok(refreshSpy.calledOnce);
        });

        test('should handle selectOrg command for regular org', async () => {
            const selectOrgSpy = sinon.spy(provider, 'selectOrg');
            extension.activate(mockContext);

            const orgItem = { id: 'org1-id', label: 'Test Org' };
            await vscode.commands.executeCommand('sf-org-source-compare.selectOrg', orgItem);

            assert.ok(selectOrgSpy.calledWith(orgItem));
        });

        test('should handle selectFile command', async () => {
            const selectFileSpy = sinon.spy(fileCompareService, 'selectFile');
            extension.activate(mockContext);

            const fileItem = { 
                file: TestData.multipleFiles(1)[0]
            };
            await vscode.commands.executeCommand('sf-org-source-compare.selectFile', fileItem);

            assert.ok(selectFileSpy.calledWith(fileItem.file));
        });

        test('should handle selectFile command with missing file', async () => {
            const selectFileSpy = sinon.spy(fileCompareService, 'selectFile');
            extension.activate(mockContext);

            const fileItem = { /* no file property */ };
            await vscode.commands.executeCommand('sf-org-source-compare.selectFile', fileItem);

            assert.ok(selectFileSpy.notCalled);
        });

        test('should handle deleteOrg command', async () => {
            const deleteOrgSpy = sinon.spy(provider, 'deleteOrg');
            extension.activate(mockContext);

            const orgItem = { id: 'org1-id', label: 'Test Org' };
            await vscode.commands.executeCommand('sf-org-source-compare.deleteOrg', orgItem);

            assert.ok(deleteOrgSpy.calledWith(orgItem));
        });

        test('should handle clearSelection command', async () => {
            const clearSelectionSpy = sinon.spy(fileCompareService, 'clearSelection');
            extension.activate(mockContext);

            await vscode.commands.executeCommand('sf-org-source-compare.clearSelection');

            assert.ok(clearSelectionSpy.calledOnce);
            assert.ok(vscodeStubs.showInformationMessage.calledWith('File selection cleared'));
        });
    });

    suite('Extension Deactivation', () => {
        test('should deactivate cleanly', () => {
            // Should not throw
            assert.doesNotThrow(() => {
                extension.deactivate();
            });
        });
    });

    suite('Error Handling', () => {
        test('should handle command registration failures', () => {
            const registerCommandStub = sinon.stub(vscode.commands, 'registerCommand');
            registerCommandStub.throws(new Error('Command registration failed'));

            // Should not crash the extension
            assert.doesNotThrow(() => {
                extension.activate(mockContext);
            });
        });

        test('should handle tree provider registration failures', () => {
            const registerTreeDataProviderStub = sinon.stub(vscode.window, 'registerTreeDataProvider');
            registerTreeDataProviderStub.throws(new Error('Tree provider registration failed'));

            assert.doesNotThrow(() => {
                extension.activate(mockContext);
            });
        });

        test('should handle command execution errors', async () => {
            extension.activate(mockContext);

            // Mock command to throw error
            vscodeStubs.executeCommand.withArgs('sfOrgCompareView.focus').rejects(new Error('Command failed'));

            // Should not crash when command fails
            assert.doesNotThrow(async () => {
                await vscode.commands.executeCommand('sf-org-source-compare.openCompareView');
            });
        });
    });

    suite('Subscription Management', () => {
        test('should add all disposables to context subscriptions', () => {
            const initialSubscriptionCount = mockContext.subscriptions.length;
            
            extension.activate(mockContext);

            // Should have added disposables for all commands
            const expectedCommandCount = 8; // Number of registered commands
            assert.ok(mockContext.subscriptions.length >= initialSubscriptionCount + expectedCommandCount);
        });

        test('should handle missing subscriptions array', () => {
            const contextWithoutSubscriptions = {
                ...mockContext,
                subscriptions: undefined as any
            };

            // Should not crash
            assert.doesNotThrow(() => {
                extension.activate(contextWithoutSubscriptions);
            });
        });
    });

    suite('Integration with VSCode API', () => {
        test('should use correct extension point for tree view', () => {
            const registerTreeDataProviderStub = sinon.stub(vscode.window, 'registerTreeDataProvider');
            
            extension.activate(mockContext);

            assert.ok(registerTreeDataProviderStub.calledWith('sfOrgCompareView'));
        });

        test('should register commands with correct identifiers', () => {
            const registerCommandStub = sinon.stub(vscode.commands, 'registerCommand').returns({
                dispose: sinon.stub()
            } as any);

            extension.activate(mockContext);

            // Check that all commands start with the extension prefix
            const calls = registerCommandStub.getCalls();
            calls.forEach(call => {
                const commandId = call.args[0];
                assert.ok(
                    commandId.startsWith('sf-org-source-compare.'),
                    `Command ${commandId} should start with extension prefix`
                );
            });
        });
    });

    suite('Performance Tests', () => {
        test('should activate quickly', () => {
            const start = Date.now();
            
            extension.activate(mockContext);
            
            const duration = Date.now() - start;
            assert.ok(duration < 100, `Activation took ${duration}ms, expected < 100ms`);
        });

        test('should handle multiple rapid command executions', async () => {
            extension.activate(mockContext);

            const commands = [
                'sf-org-source-compare.refreshOrgs',
                'sf-org-source-compare.clearSelection',
                'sf-org-source-compare.compareFiles'
            ];

            // Execute commands rapidly
            const promises = commands.map(cmd => 
                vscode.commands.executeCommand(cmd)
            );

            // Should complete without errors
            await Promise.all(promises);
            assert.ok(true); // If we get here, all commands executed successfully
        });
    });

    suite('Memory Management', () => {
        test('should properly dispose of resources', () => {
            const disposables: Array<{ dispose: sinon.SinonStub }> = [];
            
            const registerCommandStub = sinon.stub(vscode.commands, 'registerCommand').callsFake(() => {
                const disposable = { dispose: sinon.stub() };
                disposables.push(disposable);
                return disposable as any;
            });

            extension.activate(mockContext);

            // Simulate extension deactivation by calling dispose on all subscriptions
            mockContext.subscriptions.forEach(subscription => {
                if (subscription && typeof subscription.dispose === 'function') {
                    subscription.dispose();
                }
            });

            // All disposables should have been called
            disposables.forEach(disposable => {
                assert.ok(disposable.dispose.called, 'Disposable should have been disposed');
            });
        });
    });
});
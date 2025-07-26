import * as assert from 'assert';
import * as sinon from 'sinon';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { SfOrgCompareProvider } from '../../providers/SfOrgCompareProvider';
import { FileCompareService } from '../../services/FileCompareService';
import { EnhancedOrgManager } from '../../metadata/EnhancedOrgManager';
import { SourceRetrievalService } from '../../services/SourceRetrievalService';
import { ManifestManager } from '../../services/ManifestManager';
import { SalesforceOrg, TreeItem, ItemType } from '../../types';

suite('Complete Workflow Integration Tests', () => {
    let sfOrgCompareProvider: SfOrgCompareProvider;
    let fileCompareService: FileCompareService;
    let enhancedOrgManager: EnhancedOrgManager;
    let sourceRetrievalService: SourceRetrievalService;
    let mockContext: vscode.ExtensionContext;
    let mockGlobalState: sinon.SinonStubbedInstance<vscode.Memento>;
    
    // Mock file system operations
    let mockExistsSync: sinon.SinonStub;
    let mockMkdirSync: sinon.SinonStub;
    let mockWriteFile: sinon.SinonStub;
    let mockReadFile: sinon.SinonStub;
    let mockReaddir: sinon.SinonStub;
    let mockRmSync: sinon.SinonStub;
    let mockSpawn: sinon.SinonStub;
    let mockExecAsync: sinon.SinonStub;

    // Mock VSCode operations
    let executeCommandStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;
    let showWarningMessageStub: sinon.SinonStub;
    let withProgressStub: sinon.SinonStub;
    let createStatusBarItemStub: sinon.SinonStub;

    const testOrg1: SalesforceOrg = {
        id: 'test-org-123',
        username: 'test@example.com',
        alias: 'dev-org',
        instanceUrl: 'https://test.salesforce.com',
        accessToken: 'test-token'
    };

    const testOrg2: SalesforceOrg = {
        id: 'test-org-456',
        username: 'test2@example.com',
        alias: 'prod-org',
        instanceUrl: 'https://test2.salesforce.com',
        accessToken: 'test-token-2'
    };

    setup(async () => {
        sinon.reset();

        // Setup mock VSCode context
        mockGlobalState = {
            get: sinon.stub().returns([]),
            update: sinon.stub().resolves(),
            keys: sinon.stub().returns([]),
            setKeysForSync: sinon.stub()
        } as any;

        mockContext = {
            globalState: mockGlobalState as any,
            subscriptions: [],
            workspaceState: {} as any,
            extensionUri: {} as any,
            extensionPath: '',
            environmentVariableCollection: {} as any,
            secrets: {} as any,
            globalStorageUri: {} as any,
            logUri: {} as any,
            storageUri: {} as any,
            storagePath: '',
            globalStoragePath: '',
            logPath: '',
            languageModelAccessInformation: {} as any,
            extensionMode: vscode.ExtensionMode.Test,
            extension: {} as any,
            asAbsolutePath: sinon.stub()
        } as any;

        // Mock file system operations
        mockExistsSync = sinon.stub(fs, 'existsSync');
        mockMkdirSync = sinon.stub(fs, 'mkdirSync');
        mockWriteFile = sinon.stub(fs.promises, 'writeFile');
        mockReadFile = sinon.stub(fs.promises, 'readFile');
        mockReaddir = sinon.stub(fs.promises, 'readdir');
        mockRmSync = sinon.stub(fs, 'rmSync');
        mockSpawn = sinon.stub(require('child_process'), 'spawn');

        // Mock child_process exec
        mockExecAsync = sinon.stub();
        sinon.stub(require('util'), 'promisify').returns(mockExecAsync);

        // Mock VSCode operations
        executeCommandStub = sinon.stub(vscode.commands, 'executeCommand');
        showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
        showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
        showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage');
        withProgressStub = sinon.stub(vscode.window, 'withProgress');
        createStatusBarItemStub = sinon.stub(vscode.window, 'createStatusBarItem').returns({
            text: '',
            tooltip: '',
            backgroundColor: undefined,
            show: sinon.stub(),
            hide: sinon.stub(),
            dispose: sinon.stub(),
            id: 'test-status-bar',
            alignment: vscode.StatusBarAlignment.Left,
            priority: 0,
            name: 'Test Status Bar',
            color: undefined,
            command: undefined,
            accessibilityInformation: undefined
        } as vscode.StatusBarItem);

        sinon.stub(vscode.window, 'setStatusBarMessage');
        sinon.stub(vscode.workspace, 'getConfiguration').returns({
            get: sinon.stub().returns({}),
            update: sinon.stub().resolves()
        } as any);
        sinon.stub(vscode.workspace, 'openTextDocument');

        // Setup default file system mocks
        mockExistsSync.returns(true);
        mockMkdirSync.returns(true);
        mockWriteFile.resolves();
        mockReadFile.resolves('public class TestClass { }');
        mockRmSync.returns(true);

        // Setup default SF CLI mocks
        setupDefaultSfCliMocks();

        // Create services
        enhancedOrgManager = new EnhancedOrgManager(mockContext);
        const manifestManager = new ManifestManager(mockContext);
        sourceRetrievalService = new SourceRetrievalService(manifestManager);
        fileCompareService = new FileCompareService(enhancedOrgManager);
        sfOrgCompareProvider = new SfOrgCompareProvider(enhancedOrgManager, fileCompareService);

        await enhancedOrgManager.initialize();
    });

    teardown(() => {
        sinon.restore();
    });

    function setupDefaultSfCliMocks() {
        // Mock successful SF CLI version check
        const mockVersionProcess = {
            on: sinon.stub(),
            kill: sinon.stub(),
            stdout: { on: sinon.stub() },
            stderr: { on: sinon.stub() }
        };

        // Mock successful source retrieval
        const mockRetrievalProcess = {
            on: sinon.stub(),
            kill: sinon.stub(),
            stdout: { on: sinon.stub() },
            stderr: { on: sinon.stub() }
        };

        mockSpawn.callsFake((cmd, args) => {
            if (args && args[0] === '--version') {
                mockVersionProcess.on.withArgs('close').callsArgWith(1, 0);
                return mockVersionProcess;
            } else if (args && args[0] === 'project') {
                mockRetrievalProcess.on.withArgs('close').callsArgWith(1, 0);
                return mockRetrievalProcess;
            } else if (args && args[0] === 'org') {
                mockVersionProcess.on.withArgs('close').callsArgWith(1, 0);
                return mockVersionProcess;
            }
            return mockVersionProcess;
        });

        // Mock org list command
        const mockOrgListResult = {
            status: 0,
            result: {
                nonScratchOrgs: [testOrg1, testOrg2],
                scratchOrgs: []
            }
        };
        mockExecAsync.resolves({ stdout: JSON.stringify(mockOrgListResult) });

        // Mock directory structure
        mockReaddir.callsFake((dirPath) => {
            if (dirPath.includes('force-app/main/default')) {
                return Promise.resolve([
                    { name: 'classes', isDirectory: () => true },
                    { name: 'lwc', isDirectory: () => true },
                    { name: 'objects', isDirectory: () => true }
                ]);
            } else if (dirPath.includes('classes')) {
                return Promise.resolve([
                    { name: 'TestClass.cls', isDirectory: () => false },
                    { name: 'TestClass.cls-meta.xml', isDirectory: () => false }
                ]);
            } else if (dirPath.includes('lwc')) {
                return Promise.resolve([
                    { name: 'testComponent', isDirectory: () => true }
                ]);
            }
            return Promise.resolve([]);
        });
    }

    suite('Complete Org Setup Workflow', () => {
        test('should successfully add and initialize org', async () => {
            // Add org
            await enhancedOrgManager.addOrg(testOrg1);
            await enhancedOrgManager.addOrg(testOrg2);

            // Verify orgs are added
            const orgs = enhancedOrgManager.getOrgs();
            assert.strictEqual(orgs.length, 2);
            assert.strictEqual(orgs[0].id, testOrg1.id);
            assert.strictEqual(orgs[1].id, testOrg2.id);

            // Verify storage update was called
            assert.ok(mockGlobalState.update.called);
        });

        test('should authenticate and add org from SFDX', async () => {
            const quickPickStub = sinon.stub(vscode.window, 'showQuickPick').resolves({
                label: 'dev-org',
                description: 'test@example.com',
                org: testOrg1
            } as any);

            const result = await enhancedOrgManager.authenticateOrg();

            assert.ok(result);
            assert.strictEqual(result.id, testOrg1.id);
            assert.ok(mockGlobalState.update.called);

            quickPickStub.restore();
        });
    });

    suite('Source Retrieval Workflow', () => {
        test('should retrieve source files for org', async () => {
            await enhancedOrgManager.addOrg(testOrg1);

            const sourceDirectory = await enhancedOrgManager.getOrgSourceDirectory(testOrg1.id);

            assert.ok(sourceDirectory);
            assert.ok(sourceDirectory.includes('force-app/main/default'));

            // Verify SF CLI was called
            const retrievalCalls = mockSpawn.getCalls().filter(call =>
                call.args[1] && call.args[1][0] === 'project'
            );
            assert.ok(retrievalCalls.length > 0);

            // Verify manifest was created
            const manifestCall = mockWriteFile.getCalls().find(call =>
                call.args[0].includes('package.xml')
            );
            assert.ok(manifestCall);
        });

        test('should cache source directory and reuse', async () => {
            await enhancedOrgManager.addOrg(testOrg1);

            // First call
            const sourceDirectory1 = await enhancedOrgManager.getOrgSourceDirectory(testOrg1.id);
            // Second call
            const sourceDirectory2 = await enhancedOrgManager.getOrgSourceDirectory(testOrg1.id);

            assert.strictEqual(sourceDirectory1, sourceDirectory2);

            // Should only call SF CLI once (due to deduplication)
            const retrievalCalls = mockSpawn.getCalls().filter(call =>
                call.args[1] && call.args[1][0] === 'project'
            );
            assert.strictEqual(retrievalCalls.length, 1);
        });

        test('should refresh org source and clear cache', async () => {
            await enhancedOrgManager.addOrg(testOrg1);

            // Initial retrieval
            await enhancedOrgManager.getOrgSourceDirectory(testOrg1.id);

            // Refresh
            const refreshedDirectory = await enhancedOrgManager.refreshOrgSource(testOrg1.id);

            assert.ok(refreshedDirectory);
            assert.ok(mockRmSync.called); // Cache was cleared
        });
    });

    suite('Tree View and File Navigation', () => {
        test('should provide root tree items', async () => {
            await enhancedOrgManager.addOrg(testOrg1);
            await enhancedOrgManager.addOrg(testOrg2);

            const rootItems = await sfOrgCompareProvider.getChildren();

            assert.ok(Array.isArray(rootItems));
            assert.ok(rootItems.length > 0);

            // Should have organizations folder
            const orgsFolder = rootItems.find(item => item.id === 'available-orgs');
            assert.ok(orgsFolder);
            assert.strictEqual(orgsFolder.label, 'Organizations (2)');
        });

        test('should expand org and show source structure', async () => {
            await enhancedOrgManager.addOrg(testOrg1);

            // Get org item
            const rootItems = await sfOrgCompareProvider.getChildren();
            const orgsFolder = rootItems.find(item => item.id === 'available-orgs');
            assert.ok(orgsFolder);

            const orgItem = orgsFolder.children!.find(child => child.orgId === testOrg1.id);
            assert.ok(orgItem);

            // Expand org
            const orgChildren = await sfOrgCompareProvider.getChildren(orgItem);

            assert.ok(Array.isArray(orgChildren));
            assert.ok(orgChildren.length > 0);

            // Should have classes folder
            const classesFolder = orgChildren.find(child => child.label === 'classes');
            assert.ok(classesFolder);
            assert.strictEqual(classesFolder.type, ItemType.Folder);
        });

        test('should navigate into folders and show files', async () => {
            await enhancedOrgManager.addOrg(testOrg1);

            // Get to classes folder
            const rootItems = await sfOrgCompareProvider.getChildren();
            const orgsFolder = rootItems.find(item => item.id === 'available-orgs');
            const orgItem = orgsFolder!.children!.find(child => child.orgId === testOrg1.id);
            const orgChildren = await sfOrgCompareProvider.getChildren(orgItem);
            const classesFolder = orgChildren.find(child => child.label === 'classes');

            // Expand classes folder
            const classFiles = await sfOrgCompareProvider.getChildren(classesFolder);

            assert.ok(Array.isArray(classFiles));
            const clsFile = classFiles.find(file => file.label.includes('.cls'));
            assert.ok(clsFile);
            assert.strictEqual(clsFile.type, ItemType.File);
            assert.ok(clsFile.file);
            assert.ok(clsFile.file.filePath);
        });

        test('should preserve folder expansion state', async () => {
            await enhancedOrgManager.addOrg(testOrg1);

            const rootItems = await sfOrgCompareProvider.getChildren();
            const orgsFolder = rootItems.find(item => item.id === 'available-orgs');
            const orgItem = orgsFolder!.children!.find(child => child.orgId === testOrg1.id);

            // Expand org
            await sfOrgCompareProvider.getChildren(orgItem);

            // Trigger tree refresh (simulates file selection)
            sfOrgCompareProvider.refreshTreeView();

            // Get tree items again - should still be expanded
            const treeItem = sfOrgCompareProvider.getTreeItem(orgItem!);
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
        });
    });

    suite('File Selection and Comparison Workflow', () => {
        test('should select files for comparison', async () => {
            await enhancedOrgManager.addOrg(testOrg1);
            await enhancedOrgManager.addOrg(testOrg2);

            // Get file items from both orgs
            const rootItems = await sfOrgCompareProvider.getChildren();
            const orgsFolder = rootItems.find(item => item.id === 'available-orgs');

            const org1Item = orgsFolder!.children!.find(child => child.orgId === testOrg1.id);
            const org1Children = await sfOrgCompareProvider.getChildren(org1Item);
            const classesFolder1 = org1Children.find(child => child.label === 'classes');
            const classFiles1 = await sfOrgCompareProvider.getChildren(classesFolder1);
            const file1 = classFiles1.find(file => file.label.includes('.cls'));

            const org2Item = orgsFolder!.children!.find(child => child.orgId === testOrg2.id);
            const org2Children = await sfOrgCompareProvider.getChildren(org2Item);
            const classesFolder2 = org2Children.find(child => child.label === 'classes');
            const classFiles2 = await sfOrgCompareProvider.getChildren(classesFolder2);
            const file2 = classFiles2.find(file => file.label.includes('.cls'));

            // Select files
            fileCompareService.selectFile(file1!.file!);
            fileCompareService.selectFile(file2!.file!);

            const selectedFiles = fileCompareService.getSelectedFiles();
            assert.strictEqual(selectedFiles.length, 2);
            assert.ok(fileCompareService.canCompare());
        });

        test('should compare selected files using local paths', async () => {
            await enhancedOrgManager.addOrg(testOrg1);
            await enhancedOrgManager.addOrg(testOrg2);

            // Create mock files with local paths
            const mockFile1 = {
                id: 'file1',
                name: 'TestClass.cls',
                type: 'ApexClass',
                fullName: 'TestClass',
                orgId: testOrg1.id,
                filePath: '/tmp/sf-org-compare/org-test-org-123/force-app/main/default/classes/TestClass.cls'
            };

            const mockFile2 = {
                id: 'file2',
                name: 'TestClass.cls',
                type: 'ApexClass',
                fullName: 'TestClass',
                orgId: testOrg2.id,
                filePath: '/tmp/sf-org-compare/org-test-org-456/force-app/main/default/classes/TestClass.cls'
            };

            fileCompareService.selectFile(mockFile1);
            fileCompareService.selectFile(mockFile2);

            // Mock progress for comparison
            withProgressStub.callsArgWith(1, { report: sinon.stub() });

            await fileCompareService.compareSelectedFiles();

            // Verify diff command was called
            assert.ok(executeCommandStub.calledWith('vscode.diff'));

            // Verify no content retrieval was needed (local files used)
            const diffCall = executeCommandStub.getCalls().find(call => call.args[0] === 'vscode.diff');
            assert.ok(diffCall);

            const [uri1, uri2, title] = diffCall.args.slice(1);
            assert.ok(uri1.toString().includes('TestClass.cls'));
            assert.ok(uri2.toString().includes('TestClass.cls'));
            assert.ok(title.includes('dev-org'));
            assert.ok(title.includes('prod-org'));
        });

        test('should handle file opening', async () => {
            await enhancedOrgManager.addOrg(testOrg1);

            const mockFile = {
                id: 'file1',
                name: 'TestClass.cls',
                type: 'ApexClass',
                fullName: 'TestClass',
                orgId: testOrg1.id,
                filePath: '/tmp/sf-org-compare/org-test-org-123/force-app/main/default/classes/TestClass.cls'
            };

            const openTextDocumentStub = sinon.stub(vscode.window, 'showTextDocument');
            
            // Simulate file opening command
            await executeCommandStub.withArgs('sf-org-source-compare.openFile').callsArgWith(1, { file: mockFile });

            openTextDocumentStub.restore();
        });
    });

    suite('Error Handling and Recovery', () => {
        test('should handle SF CLI not found error', async () => {
            // Mock SF CLI not available
            mockSpawn.callsFake(() => {
                const mockProcess = {
                    on: sinon.stub(),
                    kill: sinon.stub(),
                    stdout: { on: sinon.stub() },
                    stderr: { on: sinon.stub() }
                };
                mockProcess.on.withArgs('close').callsArgWith(1, 1); // Command failed
                return mockProcess;
            });

            await enhancedOrgManager.addOrg(testOrg1);

            try {
                await enhancedOrgManager.getOrgSourceDirectory(testOrg1.id);
                assert.fail('Should have thrown error');
            } catch (error: any) {
                assert.ok(error.message.includes('Salesforce CLI not found') || 
                         error.message.includes('Failed to retrieve source'));
            }
        });

        test('should handle network errors during source retrieval', async () => {
            // Mock successful CLI but failed retrieval
            const mockVersionProcess = {
                on: sinon.stub(),
                kill: sinon.stub(),
                stdout: { on: sinon.stub() },
                stderr: { on: sinon.stub() }
            };

            const mockRetrievalProcess = {
                on: sinon.stub(),
                kill: sinon.stub(),
                stdout: { on: sinon.stub() },
                stderr: { on: sinon.stub() }
            };

            mockSpawn.callsFake((cmd, args) => {
                if (args && args[0] === '--version') {
                    mockVersionProcess.on.withArgs('close').callsArgWith(1, 0);
                    return mockVersionProcess;
                } else {
                    mockRetrievalProcess.on.withArgs('close').callsArgWith(1, 1); // Failed
                    mockRetrievalProcess.stderr.on.withArgs('data').callsArgWith(1, 'Network timeout');
                    return mockRetrievalProcess;
                }
            });

            await enhancedOrgManager.addOrg(testOrg1);

            try {
                await enhancedOrgManager.getOrgSourceDirectory(testOrg1.id);
                assert.fail('Should have thrown error');
            } catch (error: any) {
                assert.ok(error.message.includes('Failed to retrieve source'));
            }
        });

        test('should handle file system errors gracefully', async () => {
            mockExistsSync.returns(false);
            mockMkdirSync.throws(new Error('Permission denied'));

            await enhancedOrgManager.addOrg(testOrg1);

            try {
                await enhancedOrgManager.getOrgSourceDirectory(testOrg1.id);
                assert.fail('Should have thrown error');
            } catch (error) {
                // Should handle gracefully
                assert.ok(error);
            }
        });

        test('should recover from org refresh errors', async () => {
            await enhancedOrgManager.addOrg(testOrg1);

            // Initial successful retrieval
            await enhancedOrgManager.getOrgSourceDirectory(testOrg1.id);

            // Mock refresh failure
            mockRmSync.throws(new Error('Permission denied'));

            // Should not throw error
            try {
                await enhancedOrgManager.refreshOrgSource(testOrg1.id);
                // Should succeed despite cache clear error
                assert.ok(true);
            } catch (error: any) {
                // If it fails, it should be due to retrieval, not cache clearing
                assert.ok(!error.message.includes('Permission denied'));
            }
        });
    });

    suite('Performance and Caching', () => {
        test('should deduplicate concurrent retrievals', async () => {
            await enhancedOrgManager.addOrg(testOrg1);

            // Start multiple concurrent retrievals
            const promises = [
                enhancedOrgManager.getOrgSourceDirectory(testOrg1.id),
                enhancedOrgManager.getOrgSourceDirectory(testOrg1.id),
                enhancedOrgManager.getOrgSourceDirectory(testOrg1.id)
            ];

            const results = await Promise.all(promises);

            // All should return same result
            assert.strictEqual(results[0], results[1]);
            assert.strictEqual(results[1], results[2]);

            // But SF CLI should only be called once
            const retrievalCalls = mockSpawn.getCalls().filter(call =>
                call.args[1] && call.args[1][0] === 'project'
            );
            assert.strictEqual(retrievalCalls.length, 1);
        });

        test('should handle large directory structures efficiently', async () => {
            // Mock large directory structure
            mockReaddir.callsFake((dirPath) => {
                if (dirPath.includes('force-app/main/default')) {
                    return Promise.resolve(
                        Array.from({ length: 20 }, (_, i) => ({
                            name: `folder${i}`,
                            isDirectory: () => true
                        }))
                    );
                } else {
                    return Promise.resolve(
                        Array.from({ length: 100 }, (_, i) => ({
                            name: `file${i}.cls`,
                            isDirectory: () => false
                        }))
                    );
                }
            });

            await enhancedOrgManager.addOrg(testOrg1);

            const startTime = Date.now();
            const rootItems = await sfOrgCompareProvider.getChildren();
            const orgsFolder = rootItems.find(item => item.id === 'available-orgs');
            const orgItem = orgsFolder!.children!.find(child => child.orgId === testOrg1.id);
            const orgChildren = await sfOrgCompareProvider.getChildren(orgItem);
            const endTime = Date.now();

            // Should complete within reasonable time
            assert.ok(endTime - startTime < 5000);
            assert.ok(orgChildren.length === 20); // 20 folders
        });

        test('should cleanup resources properly', async () => {
            await enhancedOrgManager.addOrg(testOrg1);
            await enhancedOrgManager.getOrgSourceDirectory(testOrg1.id);

            // Mock cleanup
            const sourceRetrieval = (enhancedOrgManager as any).sourceRetrieval as SourceRetrievalService;
            sourceRetrieval.cleanup();

            // Cleanup file compare service
            await fileCompareService.cleanup();

            // Should have cleaned up temp files and status bar
            assert.ok(mockRmSync.called);
        });
    });

    suite('User Experience Features', () => {
        test('should provide helpful error messages', async () => {
            await enhancedOrgManager.addOrg(testOrg1);

            // Mock authentication error
            mockSpawn.callsFake(() => {
                const mockProcess = {
                    on: sinon.stub(),
                    kill: sinon.stub(),
                    stdout: { on: sinon.stub() },
                    stderr: { on: sinon.stub() }
                };
                mockProcess.on.withArgs('close').callsArgWith(1, 1);
                mockProcess.stderr.on.withArgs('data').callsArgWith(1, 'ERROR: This org appears to have a problem with its OAuth configuration.');
                return mockProcess;
            });

            try {
                await enhancedOrgManager.getOrgSourceDirectory(testOrg1.id);
                assert.fail('Should have thrown error');
            } catch (error: any) {
                assert.ok(error.message.includes('Failed to retrieve source'));
            }
        });

        test('should show progress during long operations', async () => {
            await enhancedOrgManager.addOrg(testOrg1);
            await enhancedOrgManager.addOrg(testOrg2);

            // Mock files for comparison
            const file1 = {
                id: 'file1', name: 'TestClass.cls', type: 'ApexClass',
                fullName: 'TestClass', orgId: testOrg1.id,
                filePath: '/tmp/org1/TestClass.cls'
            };
            const file2 = {
                id: 'file2', name: 'TestClass.cls', type: 'ApexClass',
                fullName: 'TestClass', orgId: testOrg2.id,
                filePath: '/tmp/org2/TestClass.cls'
            };

            fileCompareService.selectFile(file1);
            fileCompareService.selectFile(file2);

            const mockProgress = { report: sinon.stub() };
            withProgressStub.callsArgWith(1, mockProgress);

            await fileCompareService.compareSelectedFiles();

            // Should have shown progress updates
            assert.ok(mockProgress.report.called);
            assert.ok(withProgressStub.calledWith({
                location: vscode.ProgressLocation.Notification,
                title: 'Comparing Files',
                cancellable: false
            }));
        });

        test('should update UI state appropriately', async () => {
            await enhancedOrgManager.addOrg(testOrg1);

            // Test tree view refresh
            sfOrgCompareProvider.refreshTreeView();
            assert.ok(executeCommandStub.calledWith('sf-org-source-compare.refreshTreeView'));

            // Test org-specific refresh
            await sfOrgCompareProvider.refreshOrg(testOrg1.id);
            assert.ok(showInformationMessageStub.called);
        });
    });
});
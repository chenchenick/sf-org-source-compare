import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { EnhancedOrgManager } from '../../metadata/EnhancedOrgManager';
import { FileCompareService } from '../../services/FileCompareService';
import { SfOrgCompareProvider } from '../../providers/SfOrgCompareProvider';
import { SalesforceOrg, OrgFile, ItemType } from '../../types';

suite('Extension Integration Test Suite', () => {
    let mockContext: vscode.ExtensionContext;
    let mockGlobalState: sinon.SinonStubbedInstance<vscode.Memento>;
    let mockExecAsync: sinon.SinonStub;
    let enhancedOrgManager: EnhancedOrgManager;
    let fileCompareService: FileCompareService;
    let provider: SfOrgCompareProvider;

    // Test data
    const sampleOrg1: SalesforceOrg = {
        id: 'org1-id',
        username: 'dev@example.com',
        alias: 'dev-org',
        instanceUrl: 'https://dev.salesforce.com',
        accessToken: 'dev-token'
    };

    const sampleOrg2: SalesforceOrg = {
        id: 'org2-id',
        username: 'prod@example.com',
        alias: 'prod-org',
        instanceUrl: 'https://prod.salesforce.com',
        accessToken: 'prod-token'
    };

    const mockSfCliOrgListResponse = {
        status: 0,
        result: {
            scratchOrgs: [],
            nonScratchOrgs: [
                {
                    orgId: 'org1-id',
                    username: 'dev@example.com',
                    alias: 'dev-org',
                    instanceUrl: 'https://dev.salesforce.com'
                },
                {
                    orgId: 'org2-id',
                    username: 'prod@example.com',
                    alias: 'prod-org',
                    instanceUrl: 'https://prod.salesforce.com'
                }
            ]
        }
    };

    const mockMetadataResponse = {
        status: 0,
        result: [
            { fullName: 'AccountController' },
            { fullName: 'ContactController' }
        ]
    };

    const mockApexContentResponse = {
        status: 0,
        result: {
            records: [{
                Body: 'public class AccountController { /* implementation */ }'
            }]
        }
    };

    setup(() => {
        sinon.reset();

        // Mock VSCode context
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

        // Mock child_process exec
        mockExecAsync = sinon.stub();
        sinon.stub(require('util'), 'promisify').returns(mockExecAsync);

        // Mock VSCode UI methods
        sinon.stub(vscode.window, 'showErrorMessage');
        sinon.stub(vscode.window, 'showInformationMessage');
        sinon.stub(vscode.window, 'showWarningMessage');
        sinon.stub(vscode.window, 'showQuickPick');
        sinon.stub(vscode.window, 'setStatusBarMessage');
        sinon.stub(vscode.commands, 'executeCommand');
        sinon.stub(vscode.workspace, 'openTextDocument');

        // Create real instances (not mocks) for integration testing
        enhancedOrgManager = new EnhancedOrgManager(mockContext);
        fileCompareService = new FileCompareService(enhancedOrgManager);
        // Mock EnhancedOrgManager for test
        const mockEnhancedOrgManager = {
            getOrgFilesByType: sinon.stub().resolves(new Map()),
            getFileContent: sinon.stub().resolves('mock content')
        } as any;
        provider = new SfOrgCompareProvider(enhancedOrgManager, fileCompareService);
    });

    teardown(() => {
        sinon.restore();
    });

    suite('Full Workflow Integration', () => {
        test('should complete full org authentication and file comparison workflow', async () => {
            // Step 1: Authenticate orgs
            mockExecAsync.withArgs('sf org list --json').resolves({
                stdout: JSON.stringify(mockSfCliOrgListResponse)
            });

            const orgs = await enhancedOrgManager.querySfdxOrgs();
            assert.strictEqual(orgs.length, 2);
            
            await enhancedOrgManager.addOrg(orgs[0]);
            await enhancedOrgManager.addOrg(orgs[1]);

            // Step 2: Load metadata from orgs
            mockExecAsync.withArgs(sinon.match(/sf org list metadata/)).resolves({
                stdout: JSON.stringify(mockMetadataResponse)
            });

            const org1SourceDir = await enhancedOrgManager.getOrgSourceDirectory(sampleOrg1.id);
            assert.ok(typeof org1SourceDir === 'string');
            assert.ok(org1SourceDir.length > 0);

            // Step 3: Select files for comparison (using mock files)
            const file1: OrgFile = {
                id: 'file1-id',
                name: 'TestClass.cls',
                type: 'ApexClass',
                fullName: 'TestClass',
                orgId: sampleOrg1.id
            };
            const file2: OrgFile = {
                id: 'file2-id',
                name: 'TestClass.cls',
                type: 'ApexClass',
                fullName: 'TestClass',
                orgId: sampleOrg2.id
            };

            fileCompareService.selectFile(file1);
            fileCompareService.selectFile(file2);

            assert.strictEqual(fileCompareService.getSelectedFiles().length, 2);
            assert.ok(fileCompareService.canCompare());

            // Step 4: Compare files
            mockExecAsync.withArgs(sinon.match(/sf data query/)).resolves({
                stdout: JSON.stringify(mockApexContentResponse)
            });

            const mockDocument = { uri: vscode.Uri.parse('untitled:test') };
            (vscode.workspace.openTextDocument as sinon.SinonStub).resolves(mockDocument);

            await fileCompareService.compareSelectedFiles();

            // Verify the diff command was called
            assert.ok((vscode.commands.executeCommand as sinon.SinonStub).calledWith('vscode.diff'));
        });

        test('should handle org expansion and file loading in tree provider', async () => {
            // Add orgs to manager
            await enhancedOrgManager.addOrg(sampleOrg1);
            await enhancedOrgManager.addOrg(sampleOrg2);

            // Mock metadata loading
            mockExecAsync.resolves({
                stdout: JSON.stringify(mockMetadataResponse)
            });

            // Get initial tree items (should show organizations folder)
            const rootItems = await provider.getChildren();
            assert.strictEqual(rootItems.length, 1);
            assert.strictEqual(rootItems[0].label, 'Organizations (2)');

            // Get org items
            const orgItems = rootItems[0].children || [];
            assert.strictEqual(orgItems.length, 2);

            // Expand first org
            const org1Item = orgItems[0];
            await provider.selectOrg(org1Item);

            // Should now have files cached
            const orgFiles = await provider.getChildren(org1Item);
            assert.ok(orgFiles.length > 0);

            // Each metadata type should be a folder
            const apexFolder = orgFiles.find(item => item.label.includes('Apex Classes'));
            assert.ok(apexFolder);
            assert.ok(apexFolder.children && apexFolder.children.length === 2);
        });

        test('should handle file selection through tree provider', async () => {
            // Setup orgs and files
            await enhancedOrgManager.addOrg(sampleOrg1);
            mockExecAsync.resolves({ stdout: JSON.stringify(mockMetadataResponse) });

            // Expand org
            const orgItem = {
                id: sampleOrg1.id,
                label: sampleOrg1.alias!,
                type: ItemType.Org,
                orgId: sampleOrg1.id
            };

            await provider.selectOrg(orgItem);
            const orgFiles = await provider.getChildren(orgItem);
            
            // Get a file from the apex folder
            const apexFolder = orgFiles.find(item => item.label.includes('Apex Classes'));
            assert.ok(apexFolder && apexFolder.children);
            
            const file = apexFolder.children[0];
            assert.ok(file.file);

            // Test file selection
            fileCompareService.selectFile(file.file);
            
            // Create tree item for the file to check visual state
            const treeItem = provider.getTreeItem(file);
            assert.ok((treeItem.label as string).includes('[1]'));
            assert.ok(treeItem.description === '🔵');
        });

        test('should handle errors gracefully in integrated workflow', async () => {
            // Test SF CLI not available
            mockExecAsync.rejects(new Error('sf: command not found'));

            try {
                await enhancedOrgManager.querySfdxOrgs();
                assert.fail('Should have thrown error');
            } catch (error: any) {
                assert.ok(error.message.includes('Failed to query Salesforce orgs'));
            }

            // Test metadata loading failure
            mockExecAsync.resolves({ stdout: JSON.stringify(mockSfCliOrgListResponse) });
            const orgs = await enhancedOrgManager.querySfdxOrgs();
            await enhancedOrgManager.addOrg(orgs[0]);

            mockExecAsync.rejects(new Error('Network timeout'));

            try {
                await enhancedOrgManager.getOrgSourceDirectory(orgs[0].id);
                assert.fail('Should have thrown error');
            } catch (error: any) {
                assert.ok(error.message.includes('Failed to fetch files for org'));
            }
        });
    });

    suite('Cache Integration', () => {
        test('should use cache across provider and org manager', async () => {
            await enhancedOrgManager.addOrg(sampleOrg1);
            
            // First call should hit the API
            mockExecAsync.resolves({ stdout: JSON.stringify(mockMetadataResponse) });
            
            const files1 = await provider['getOrgFiles'](sampleOrg1.id);
            assert.ok(mockExecAsync.calledOnce);

            // Second call should use cache
            mockExecAsync.reset();
            const files2 = await provider['getOrgFiles'](sampleOrg1.id);
            assert.ok(mockExecAsync.notCalled);
            assert.deepStrictEqual(files1, files2);
        });

        test('should clear cache when org is deleted', async () => {
            await enhancedOrgManager.addOrg(sampleOrg1);
            
            // Load files to populate cache
            mockExecAsync.resolves({ stdout: JSON.stringify(mockMetadataResponse) });
            await provider['getOrgFiles'](sampleOrg1.id);

            // Verify cache is populated
            assert.ok((provider as any).orgFilesCache.has(sampleOrg1.id));

            // Delete org
            const orgItem = {
                id: sampleOrg1.id,
                label: sampleOrg1.alias!,
                type: ItemType.Org,
                orgId: sampleOrg1.id
            };

            (vscode.window.showWarningMessage as sinon.SinonStub).resolves('Delete');
            await provider.deleteOrg(orgItem);

            // Verify cache is cleared
            assert.ok(!(provider as any).orgFilesCache.has(sampleOrg1.id));
        });
    });

    suite('Performance Integration', () => {
        test('should handle large number of files efficiently', async () => {
            await enhancedOrgManager.addOrg(sampleOrg1);

            // Mock large metadata response
            const largeMetadataResponse = {
                status: 0,
                result: Array.from({ length: 1000 }, (_, i) => ({ fullName: `Class${i}` }))
            };

            mockExecAsync.resolves({ stdout: JSON.stringify(largeMetadataResponse) });

            const startTime = Date.now();
            const files = await provider['getOrgFiles'](sampleOrg1.id);
            const endTime = Date.now();

            // Should complete within reasonable time (< 1 second)
            assert.ok(endTime - startTime < 1000);
            assert.ok(files.length > 0);

            // Should cache results for fast subsequent access
            const cachedStartTime = Date.now();
            await provider['getOrgFiles'](sampleOrg1.id);
            const cachedEndTime = Date.now();

            // Cached access should be much faster (< 10ms)
            assert.ok(cachedEndTime - cachedStartTime < 10);
        });

        test('should handle rapid file selection changes efficiently', () => {
            const files = Array.from({ length: 100 }, (_, i) => ({
                id: `file-${i}`,
                name: `Class${i}.cls`,
                type: 'ApexClass',
                fullName: `Class${i}`,
                orgId: sampleOrg1.id
            }));

            const startTime = Date.now();

            // Rapidly select and deselect files
            for (let i = 0; i < files.length; i++) {
                fileCompareService.selectFile(files[i]);
                if (i % 10 === 0) {
                    fileCompareService.clearSelection();
                }
            }

            const endTime = Date.now();

            // Should complete within reasonable time
            assert.ok(endTime - startTime < 100);
            assert.ok(fileCompareService.getSelectedFiles().length <= 2);
        });
    });

    suite('Edge Cases Integration', () => {
        test('should handle mixed org authentication states', async () => {
            // Mock partial org list response
            const partialResponse = {
                status: 0,
                result: {
                    scratchOrgs: [
                        { username: 'scratch@example.com', alias: 'scratch' }
                    ],
                    nonScratchOrgs: [
                        { orgId: 'prod-id', username: 'prod@example.com' }
                    ]
                }
            };

            mockExecAsync.resolves({ stdout: JSON.stringify(partialResponse) });

            const orgs = await enhancedOrgManager.querySfdxOrgs();
            assert.strictEqual(orgs.length, 2);

            // Both orgs should have generated IDs
            assert.ok(orgs[0].id);
            assert.ok(orgs[1].id);
        });

        test('should handle comparison between same file in different orgs', async () => {
            await enhancedOrgManager.addOrg(sampleOrg1);
            await enhancedOrgManager.addOrg(sampleOrg2);

            const file1: OrgFile = {
                id: 'file1-id',
                name: 'AccountController.cls',
                type: 'ApexClass',
                fullName: 'AccountController',
                orgId: sampleOrg1.id
            };

            const file2: OrgFile = {
                id: 'file2-id',
                name: 'AccountController.cls',
                type: 'ApexClass',
                fullName: 'AccountController',
                orgId: sampleOrg2.id
            };

            fileCompareService.selectFile(file1);
            fileCompareService.selectFile(file2);

            assert.ok(fileCompareService.canCompare());

            // Mock content retrieval
            mockExecAsync.resolves({ stdout: JSON.stringify(mockApexContentResponse) });
            const mockDocument = { uri: vscode.Uri.parse('untitled:test') };
            (vscode.workspace.openTextDocument as sinon.SinonStub).resolves(mockDocument);

            await fileCompareService.compareSelectedFiles();

            // Should successfully create comparison
            assert.ok((vscode.commands.executeCommand as sinon.SinonStub).calledWith('vscode.diff'));
        });

        test('should handle tree refresh with changing org states', async () => {
            // Start with no orgs
            mockGlobalState.get.returns([]);
            const emptyRootItems = await provider.getChildren();
            assert.strictEqual(emptyRootItems[0].id, 'no-orgs');

            // Add orgs
            await enhancedOrgManager.addOrg(sampleOrg1);
            await enhancedOrgManager.addOrg(sampleOrg2);

            // Refresh should show organizations
            const orgRootItems = await provider.getChildren();
            assert.strictEqual(orgRootItems[0].label, 'Organizations (2)');

            // Remove one org
            await enhancedOrgManager.removeOrg(sampleOrg1.id);

            // Should update accordingly
            const updatedRootItems = await provider.getChildren();
            assert.strictEqual(updatedRootItems[0].label, 'Organizations (1)');
        });
    });
});
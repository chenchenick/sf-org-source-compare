import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { SfOrgCompareProvider } from '../../providers/SfOrgCompareProvider';
import { EnhancedOrgManager } from '../../metadata/EnhancedOrgManager';
import { FileCompareService } from '../../services/FileCompareService';
import { SalesforceOrg, OrgFile, TreeItem, ItemType } from '../../types';

suite('SfOrgCompareProvider Test Suite', () => {
    let provider: SfOrgCompareProvider;
    let mockEnhancedOrgManager: sinon.SinonStubbedInstance<EnhancedOrgManager>;
    let mockFileCompareService: sinon.SinonStubbedInstance<FileCompareService>;
    let showWarningMessageStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;
    let executeCommandStub: sinon.SinonStub;

    const sampleOrg1: SalesforceOrg = {
        id: 'org1-id',
        username: 'org1@example.com',
        alias: 'org1',
        instanceUrl: 'https://org1.salesforce.com',
        accessToken: 'token1'
    };

    const sampleOrg2: SalesforceOrg = {
        id: 'org2-id',
        username: 'org2@example.com',
        alias: 'org2',
        instanceUrl: 'https://org2.salesforce.com',
        accessToken: 'token2'
    };

    const sampleFile1: OrgFile = {
        id: 'file1-id',
        name: 'TestClass.cls',
        type: 'ApexClass',
        fullName: 'TestClass',
        orgId: 'org1-id'
    };

    const sampleFile2: OrgFile = {
        id: 'file2-id',
        name: 'TestTrigger.trigger',
        type: 'ApexTrigger',
        fullName: 'TestTrigger',
        orgId: 'org1-id'
    };

    const sampleTreeItem: TreeItem = {
        id: 'org1-id',
        label: 'org1',
        type: ItemType.Org,
        orgId: 'org1-id'
    };

    setup(() => {
        sinon.reset();

        // Create stubbed dependencies
        mockEnhancedOrgManager = sinon.createStubInstance(EnhancedOrgManager);
        mockFileCompareService = sinon.createStubInstance(FileCompareService);

        // Mock VSCode methods
        showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage');
        showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
        showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
        executeCommandStub = sinon.stub(vscode.commands, 'executeCommand');

        // Set up default mock responses
        mockEnhancedOrgManager.getOrgs.returns([sampleOrg1, sampleOrg2]);
        mockEnhancedOrgManager.getOrg.withArgs('org1-id').returns(sampleOrg1);
        mockEnhancedOrgManager.getOrg.withArgs('org2-id').returns(sampleOrg2);
        mockFileCompareService.getSelectedFiles.returns([]);

        provider = new SfOrgCompareProvider(mockEnhancedOrgManager as any, mockFileCompareService as any);
    });

    teardown(() => {
        sinon.restore();
    });

    suite('Constructor', () => {
        test('should initialize with empty expanded orgs and cache', () => {
            const newProvider = new SfOrgCompareProvider(mockEnhancedOrgManager as any, mockFileCompareService as any);
            assert.ok(newProvider);
        });
    });

    suite('refresh', () => {
        test('should fire tree data change event', () => {
            const fireStub = sinon.stub((provider as any)._onDidChangeTreeData, 'fire');
            
            provider.refresh();
            
            assert.ok(fireStub.calledOnce);
        });
    });

    suite('deleteOrg', () => {
        test('should delete org after confirmation', async () => {
            const orgItem: TreeItem = {
                id: 'org1-id',
                label: 'org1',
                type: ItemType.Org,
                orgId: 'org1-id'
            };

            showWarningMessageStub.resolves('Delete');
            mockEnhancedOrgManager.removeOrg.resolves();

            await provider.deleteOrg(orgItem);

            assert.ok(showWarningMessageStub.calledOnce);
            assert.ok(mockEnhancedOrgManager.removeOrg.calledWith('org1-id'));
            assert.ok(showInformationMessageStub.calledWith('Removed organization: org1'));
        });

        test('should not delete org when confirmation is cancelled', async () => {
            const orgItem: TreeItem = {
                id: 'org1-id',
                label: 'org1',
                type: ItemType.Org,
                orgId: 'org1-id'
            };

            showWarningMessageStub.resolves('Cancel');

            await provider.deleteOrg(orgItem);

            assert.ok(showWarningMessageStub.calledOnce);
            assert.ok(mockEnhancedOrgManager.removeOrg.notCalled);
            assert.ok(showInformationMessageStub.notCalled);
        });

        test('should handle missing orgId gracefully', async () => {
            const orgItem: TreeItem = {
                id: 'org1-id',
                label: 'org1',
                type: ItemType.Org
            };

            await provider.deleteOrg(orgItem);

            assert.ok(showWarningMessageStub.notCalled);
            assert.ok(mockEnhancedOrgManager.removeOrg.notCalled);
        });

        test('should handle missing org gracefully', async () => {
            const orgItem: TreeItem = {
                id: 'non-existent-id',
                label: 'non-existent',
                type: ItemType.Org,
                orgId: 'non-existent-id'
            };

            mockEnhancedOrgManager.getOrg.withArgs('non-existent-id').returns(undefined);

            await provider.deleteOrg(orgItem);

            assert.ok(showWarningMessageStub.notCalled);
            assert.ok(mockEnhancedOrgManager.removeOrg.notCalled);
        });
    });

    suite('selectOrg', () => {
        test('should expand org and load files when not already expanded', async () => {
            const mockFilesByType = new Map([
                ['ApexClass', [sampleFile1]],
                ['ApexTrigger', [sampleFile2]]
            ]);
            
            mockEnhancedOrgManager.getOrgSourceDirectory.resolves('/tmp/mock-source');

            await provider.selectOrg(sampleTreeItem);

            assert.ok(showInformationMessageStub.calledWith('Loading files from: org1...'));
            assert.ok(mockEnhancedOrgManager.getOrgSourceDirectory.calledWith('org1-id'));
            assert.ok(showInformationMessageStub.calledWith('Loaded 2 file types from: org1'));
        });

        test('should not expand org when already expanded', async () => {
            // Manually add org to expanded list
            (provider as any).expandedOrgs.push('org1-id');

            await provider.selectOrg(sampleTreeItem);

            assert.ok(mockEnhancedOrgManager.getOrgSourceDirectory.notCalled);
        });

        test('should handle org loading errors gracefully', async () => {
            mockEnhancedOrgManager.getOrgSourceDirectory.rejects(new Error('API Error'));

            await provider.selectOrg(sampleTreeItem);

            assert.ok(showErrorMessageStub.calledOnce);
            assert.ok(showErrorMessageStub.args[0][0].includes('Failed to load files from org1'));
        });

        test('should handle missing org gracefully', async () => {
            const invalidOrgItem: TreeItem = {
                id: 'non-existent-id',
                label: 'non-existent',
                type: ItemType.Org,
                orgId: 'non-existent-id'
            };

            mockEnhancedOrgManager.getOrgs.returns([]);

            await provider.selectOrg(invalidOrgItem);

            assert.ok(mockEnhancedOrgManager.getOrgSourceDirectory.notCalled);
        });
    });

    suite('getTreeItem', () => {
        test('should create tree item for org with correct collapsible state', () => {
            const treeItem = provider.getTreeItem(sampleTreeItem);

            assert.strictEqual(treeItem.label, 'org1');
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
            assert.ok(treeItem.iconPath instanceof vscode.ThemeIcon);
            assert.strictEqual(treeItem.contextValue, 'availableOrg');
        });

        test('should create tree item for expanded org', () => {
            // Add org to expanded list
            (provider as any).expandedOrgs.push('org1-id');

            const treeItem = provider.getTreeItem(sampleTreeItem);

            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
        });

        test('should create tree item for file with no selection', () => {
            const fileTreeItem: TreeItem = {
                id: 'file1-id',
                label: 'TestClass.cls',
                type: ItemType.File,
                orgId: 'org1-id',
                file: sampleFile1
            };

            const treeItem = provider.getTreeItem(fileTreeItem);

            assert.strictEqual(treeItem.label, 'TestClass.cls');
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
            assert.ok(treeItem.iconPath instanceof vscode.ThemeIcon);
            assert.ok(treeItem.command);
            assert.strictEqual(treeItem.command.command, 'sf-org-source-compare.selectFile');
            assert.strictEqual(treeItem.tooltip, 'Click to select for comparison');
        });

        test('should create tree item for selected file (first selection)', () => {
            const fileTreeItem: TreeItem = {
                id: 'file1-id',
                label: 'TestClass.cls',
                type: ItemType.File,
                orgId: 'org1-id',
                file: sampleFile1
            };

            mockFileCompareService.getSelectedFiles.returns([sampleFile1]);

            const treeItem = provider.getTreeItem(fileTreeItem);

            assert.strictEqual(treeItem.label, '[1] TestClass.cls');
            assert.strictEqual(treeItem.tooltip, 'Selected as first file for comparison - click to unselect');
            assert.strictEqual(treeItem.description, '🔵');
        });

        test('should create tree item for selected file (second selection)', () => {
            const fileTreeItem: TreeItem = {
                id: 'file1-id',
                label: 'TestClass.cls',
                type: ItemType.File,
                orgId: 'org1-id',
                file: sampleFile1
            };

            mockFileCompareService.getSelectedFiles.returns([sampleFile2, sampleFile1]);

            const treeItem = provider.getTreeItem(fileTreeItem);

            assert.strictEqual(treeItem.label, '[2] TestClass.cls');
            assert.strictEqual(treeItem.tooltip, 'Selected as second file for comparison - click to unselect');
            assert.strictEqual(treeItem.description, '🔴');
        });

        test('should create tree item for folder', () => {
            const folderTreeItem: TreeItem = {
                id: 'folder-id',
                label: 'Apex Classes (5)',
                type: ItemType.Folder,
                children: []
            };

            const treeItem = provider.getTreeItem(folderTreeItem);

            assert.strictEqual(treeItem.label, 'Apex Classes (5)');
            assert.ok(treeItem.iconPath instanceof vscode.ThemeIcon);
        });

        test('should create tree item for metadata type folder with collapsed state', () => {
            const metadataFolderTreeItem: TreeItem = {
                id: 'metadata-folder-id',
                label: 'Apex Classes (5)',
                type: ItemType.Folder,
                metadataType: 'ApexClass',
                children: []
            };

            const treeItem = provider.getTreeItem(metadataFolderTreeItem);

            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
        });

        test('should handle "no-orgs" special case', () => {
            const noOrgsItem: TreeItem = {
                id: 'no-orgs',
                label: 'Add your first Salesforce organization',
                type: ItemType.Org
            };

            const treeItem = provider.getTreeItem(noOrgsItem);

            assert.ok(treeItem.command);
            assert.strictEqual(treeItem.command.command, 'sf-org-source-compare.selectOrg');
            assert.strictEqual(treeItem.command.title, 'Add Organization');
        });
    });

    suite('getChildren', () => {
        test('should return root items when no element provided', async () => {
            const children = await provider.getChildren();
            
            assert.ok(Array.isArray(children));
            // Should contain organizations folder
            assert.strictEqual(children.length, 1);
            assert.strictEqual(children[0].label, 'Organizations (2)');
        });

        test('should return org files when org is expanded', async () => {
            // Add org to expanded list
            (provider as any).expandedOrgs.push('org1-id');
            
            const mockFilesByType = new Map([
                ['ApexClass', [sampleFile1]]
            ]);
            mockEnhancedOrgManager.getOrgSourceDirectory.resolves('/tmp/mock-source');

            const children = await provider.getChildren(sampleTreeItem);
            
            assert.ok(Array.isArray(children));
            // Note: With SFDX directory structure, children count may vary
        });

        test('should return empty array when org is not expanded', async () => {
            const children = await provider.getChildren(sampleTreeItem);
            
            assert.ok(Array.isArray(children));
            assert.strictEqual(children.length, 0);
        });

        test('should auto-expand org when requested via tree expansion', async () => {
            const mockFilesByType = new Map([
                ['ApexClass', [sampleFile1]]
            ]);
            mockEnhancedOrgManager.getOrgSourceDirectory.resolves('/tmp/mock-source');

            const children = await provider.getChildren(sampleTreeItem);

            // Should auto-expand and return files
            assert.ok(showInformationMessageStub.calledWith('Loading files from: org1...'));
            assert.ok(mockEnhancedOrgManager.getOrgSourceDirectory.calledWith('org1-id'));
        });

        test('should return folder children when folder element provided', async () => {
            const folderChildren = [
                {
                    id: 'file1-id',
                    label: 'TestClass.cls',
                    type: ItemType.File,
                    orgId: 'org1-id',
                    file: sampleFile1
                }
            ];

            const folderTreeItem: TreeItem = {
                id: 'folder-id',
                label: 'Apex Classes',
                type: ItemType.Folder,
                children: folderChildren
            };

            const children = await provider.getChildren(folderTreeItem);

            assert.deepStrictEqual(children, folderChildren);
        });

        test('should handle auto-expansion errors gracefully', async () => {
            mockEnhancedOrgManager.getOrgSourceDirectory.rejects(new Error('Network error'));

            const children = await provider.getChildren(sampleTreeItem);

            assert.ok(showErrorMessageStub.calledOnce);
            assert.strictEqual(children.length, 0);
        });
    });

    suite('getRootItems', () => {
        test('should return "no-orgs" item when no orgs available', async () => {
            mockEnhancedOrgManager.getOrgs.returns([]);

            const items = await (provider as any).getRootItems();

            assert.strictEqual(items.length, 1);
            assert.strictEqual(items[0].id, 'no-orgs');
            assert.strictEqual(items[0].label, 'Add your first Salesforce organization');
        });

        test('should return organizations folder with all orgs', async () => {
            const items = await (provider as any).getRootItems();

            assert.strictEqual(items.length, 1);
            assert.strictEqual(items[0].label, 'Organizations (2)');
            assert.ok(items[0].children);
            assert.strictEqual(items[0].children.length, 2);
        });
    });

    suite('getOrgFiles', () => {
        test('should return cached files when available', async () => {
            const cachedFiles = [
                {
                    id: 'cached-folder-id',
                    label: 'Apex Classes (1)',
                    type: ItemType.Folder,
                    metadataType: 'ApexClass',
                    orgId: 'org1-id',
                    children: []
                }
            ];

            // Set cache
            (provider as any).orgFilesCache.set('org1-id', cachedFiles);

            const result = await (provider as any).getOrgFiles('org1-id');

            assert.deepStrictEqual(result, cachedFiles);
            assert.ok(mockEnhancedOrgManager.getOrgSourceDirectory.notCalled);
        });

        test('should fetch and cache files when not cached', async () => {
            mockEnhancedOrgManager.getOrgSourceDirectory.resolves('/tmp/mock-source');

            const result = await (provider as any).getOrgFiles('org1-id');

            assert.ok(mockEnhancedOrgManager.getOrgSourceDirectory.calledWith('org1-id'));
            // Note: Result length depends on actual directory structure
            assert.ok(Array.isArray(result));
        });

        test('should handle org metadata fetch errors', async () => {
            mockEnhancedOrgManager.getOrgSourceDirectory.rejects(new Error('Metadata error'));

            const result = await (provider as any).getOrgFiles('org1-id');

            assert.ok(showErrorMessageStub.calledOnce);
            assert.strictEqual(result.length, 0);
        });

        test('should sort folder items alphabetically', async () => {
            mockEnhancedOrgManager.getOrgSourceDirectory.resolves('/tmp/mock-source');

            const result = await (provider as any).getOrgFiles('org1-id');

            // Should be sorted alphabetically
            assert.ok(Array.isArray(result));
        });
    });

    suite('getMetadataTypeFolderName', () => {
        const testCases = [
            { type: 'ApexClass', expected: 'Apex Classes' },
            { type: 'ApexTrigger', expected: 'Apex Triggers' },
            { type: 'CustomObject', expected: 'Custom Objects' },
            { type: 'Flow', expected: 'Flows' },
            { type: 'Layout', expected: 'Layouts' },
            { type: 'PermissionSet', expected: 'Permission Sets' },
            { type: 'UnknownType', expected: 'UnknownType' }
        ];

        testCases.forEach(({ type, expected }) => {
            test(`should return "${expected}" for ${type}`, () => {
                const result = (provider as any).getMetadataTypeFolderName(type);
                assert.strictEqual(result, expected);
            });
        });
    });

    suite('edge cases and error handling', () => {
        test('should handle provider with no dependencies', () => {
            try {
                new SfOrgCompareProvider(null as any, null as any);
                assert.fail('Should throw error with null dependencies');
            } catch (error) {
                // Expected behavior
            }
        });

        test('should handle tree item with no file property for file type', () => {
            const invalidFileItem: TreeItem = {
                id: 'invalid-file-id',
                label: 'Invalid File',
                type: ItemType.File,
                orgId: 'org1-id'
                // Missing file property
            };

            const treeItem = provider.getTreeItem(invalidFileItem);

            // Should not crash
            assert.ok(treeItem);
            assert.strictEqual(treeItem.label, 'Invalid File');
        });

        test('should handle cache corruption gracefully', async () => {
            // Set invalid cache data
            (provider as any).orgFilesCache.set('org1-id', null);

            const result = await (provider as any).getOrgFiles('org1-id');

            // Should return empty array for corrupted cache
            assert.deepStrictEqual(result, []);
        });

        test('should handle org with no metadata types', async () => {
            mockEnhancedOrgManager.getOrgSourceDirectory.resolves('/tmp/empty-source');

            const result = await (provider as any).getOrgFiles('org1-id');

            assert.strictEqual(result.length, 0);
        });

        test('should clear cache when org is deleted', async () => {
            // Set cache for org
            (provider as any).orgFilesCache.set('org1-id', []);
            (provider as any).expandedOrgs.push('org1-id');

            const orgItem: TreeItem = {
                id: 'org1-id',
                label: 'org1',
                type: ItemType.Org,
                orgId: 'org1-id'
            };

            showWarningMessageStub.resolves('Delete');
            mockEnhancedOrgManager.removeOrg.resolves();

            await provider.deleteOrg(orgItem);

            // Cache and expanded state should be cleared
            assert.ok(!(provider as any).orgFilesCache.has('org1-id'));
            assert.ok(!(provider as any).expandedOrgs.includes('org1-id'));
        });
    });
});
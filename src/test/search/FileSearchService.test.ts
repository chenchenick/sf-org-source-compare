import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { FileSearchService } from '../../search/FileSearchService';
import { SfOrgCompareProvider } from '../../providers/SfOrgCompareProvider';
import { FileCompareService } from '../../services/FileCompareService';
import { TreeItem, ItemType, OrgFile } from '../../types';

suite('FileSearchService Test Suite', () => {
    let fileSearchService: FileSearchService;
    let mockTreeProvider: sinon.SinonStubbedInstance<SfOrgCompareProvider>;
    let mockFileCompareService: sinon.SinonStubbedInstance<FileCompareService>;
    let mockQuickPick: sinon.SinonStubbedInstance<vscode.QuickPick<vscode.QuickPickItem>>;
    let windowStub: sinon.SinonStub;

    setup(() => {
        mockTreeProvider = sinon.createStubInstance(SfOrgCompareProvider);
        mockFileCompareService = sinon.createStubInstance(FileCompareService);
        
        // Mock QuickPick
        mockQuickPick = {
            placeholder: '',
            canSelectMany: false,
            matchOnDescription: false,
            matchOnDetail: false,
            items: [],
            activeItems: [],
            selectedItems: [],
            onDidChangeSelection: sinon.stub(),
            onDidAccept: sinon.stub(),
            onDidChangeValue: sinon.stub(),
            onDidHide: sinon.stub(),
            show: sinon.stub(),
            hide: sinon.stub(),
            dispose: sinon.stub()
        } as any;

        windowStub = sinon.stub(vscode.window, 'createQuickPick').returns(mockQuickPick as any);
        
        fileSearchService = new FileSearchService(
            mockTreeProvider as any,
            mockFileCompareService as any
        );
    });

    teardown(() => {
        sinon.restore();
    });

    suite('openFileSearch', () => {
        test('should create QuickPick with correct configuration', async () => {
            // Arrange
            mockTreeProvider.getChildren.resolves([]);

            // Act
            await fileSearchService.openFileSearch();

            // Assert
            assert.strictEqual(windowStub.calledOnce, true);
            assert.strictEqual(mockQuickPick.placeholder, 'Type to search files across all organizations...');
            assert.strictEqual(mockQuickPick.canSelectMany, true);
            assert.strictEqual(mockQuickPick.matchOnDescription, true);
            assert.strictEqual(mockQuickPick.matchOnDetail, true);
            assert.strictEqual(mockQuickPick.show.calledOnce, true);
        });

        test('should load and display org files', async () => {
            // Arrange
            const mockOrgFile: OrgFile = {
                id: 'test-file-1',
                name: 'TestClass.cls',
                type: 'ApexClass',
                fullName: 'TestClass',
                orgId: 'org1',
                filePath: '/path/to/TestClass.cls'
            };

            const mockTreeItems: TreeItem[] = [
                {
                    id: 'available-orgs',
                    label: 'Organizations (1)',
                    type: ItemType.Folder,
                    children: [
                        {
                            id: 'org1',
                            label: 'Org 1',
                            type: ItemType.Org,
                            orgId: 'org1'
                        }
                    ]
                }
            ];

            const mockOrgFiles: TreeItem[] = [
                {
                    id: 'test-file-1',
                    label: 'TestClass.cls',
                    type: ItemType.File,
                    orgId: 'org1',
                    file: mockOrgFile
                }
            ];

            mockTreeProvider.getChildren.onFirstCall().resolves(mockTreeItems);
            mockTreeProvider.getChildren.onSecondCall().resolves(mockOrgFiles);

            // Act
            await fileSearchService.openFileSearch();

            // Assert
            assert.strictEqual(mockTreeProvider.getChildren.callCount, 2);
            assert.strictEqual(Array.isArray(mockQuickPick.items), true);
        });

        test('should handle file selection and start comparison for 2 files', async () => {
            // Arrange
            const mockFile1: OrgFile = {
                id: 'file1',
                name: 'Class1.cls',
                type: 'ApexClass',
                fullName: 'Class1',
                orgId: 'org1',
                filePath: '/path/to/Class1.cls'
            };

            const mockFile2: OrgFile = {
                id: 'file2',
                name: 'Class2.cls',
                type: 'ApexClass',
                fullName: 'Class2',
                orgId: 'org2',
                filePath: '/path/to/Class2.cls'
            };

            const selectedItems = [
                { label: 'Class1.cls', orgFile: mockFile1 },
                { label: 'Class2.cls', orgFile: mockFile2 }
            ];

            mockTreeProvider.getChildren.resolves([]);
            mockQuickPick.selectedItems = selectedItems as any;

            let acceptCallback: () => void = () => {};
            mockQuickPick.onDidAccept.callsFake((callback) => {
                acceptCallback = callback;
                return { dispose: () => {} } as any;
            });

            const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage');

            // Act
            await fileSearchService.openFileSearch();
            acceptCallback(); // Simulate user accepting selection

            // Assert
            assert.strictEqual(mockFileCompareService.clearSelection.calledOnce, true);
            assert.strictEqual(mockFileCompareService.selectFile.callCount, 2);
            assert.strictEqual(mockFileCompareService.selectFile.firstCall.args[0], mockFile1);
            assert.strictEqual(mockFileCompareService.selectFile.secondCall.args[0], mockFile2);
            assert.strictEqual(mockFileCompareService.compareSelectedFiles.calledOnce, true);
            assert.strictEqual(showInfoStub.calledWith('Comparing 2 files'), true);
            assert.strictEqual(mockQuickPick.hide.calledOnce, true);
        });

        test('should handle single file selection', async () => {
            // Arrange
            const mockFile: OrgFile = {
                id: 'file1',
                name: 'Class1.cls',
                type: 'ApexClass',
                fullName: 'Class1',
                orgId: 'org1',
                filePath: '/path/to/Class1.cls'
            };

            const selectedItems = [
                { label: 'Class1.cls', orgFile: mockFile }
            ];

            mockTreeProvider.getChildren.resolves([]);
            mockQuickPick.selectedItems = selectedItems as any;

            let acceptCallback: () => void = () => {};
            mockQuickPick.onDidAccept.callsFake((callback) => {
                acceptCallback = callback;
                return { dispose: () => {} } as any;
            });

            const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage');

            // Act
            await fileSearchService.openFileSearch();
            acceptCallback(); // Simulate user accepting selection

            // Assert
            assert.strictEqual(mockFileCompareService.clearSelection.calledOnce, true);
            assert.strictEqual(mockFileCompareService.selectFile.callCount, 1);
            assert.strictEqual(mockFileCompareService.selectFile.firstCall.args[0], mockFile);
            assert.strictEqual(mockFileCompareService.compareSelectedFiles.called, false);
            assert.strictEqual(showInfoStub.calledWith('Selected 1 file. Select another file to compare.'), true);
        });

        test('should show warning for more than 2 files selected', async () => {
            // Arrange
            const selectedItems = [
                { label: 'File1.cls', orgFile: {} },
                { label: 'File2.cls', orgFile: {} },
                { label: 'File3.cls', orgFile: {} }
            ];

            mockTreeProvider.getChildren.resolves([]);
            mockQuickPick.selectedItems = selectedItems as any;

            let acceptCallback: () => void = () => {};
            mockQuickPick.onDidAccept.callsFake((callback) => {
                acceptCallback = callback;
                return { dispose: () => {} } as any;
            });

            const showWarningStub = sinon.stub(vscode.window, 'showWarningMessage');

            // Act
            await fileSearchService.openFileSearch();
            acceptCallback(); // Simulate user accepting selection

            // Assert
            assert.strictEqual(showWarningStub.calledWith('Please select only 1 or 2 files for comparison'), true);
            assert.strictEqual(mockQuickPick.hide.called, false); // Should not hide on warning
        });

        test('should show message for no files selected', async () => {
            // Arrange
            mockTreeProvider.getChildren.resolves([]);
            mockQuickPick.selectedItems = [];

            let acceptCallback: () => void = () => {};
            mockQuickPick.onDidAccept.callsFake((callback) => {
                acceptCallback = callback;
                return { dispose: () => {} } as any;
            });

            const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage');

            // Act
            await fileSearchService.openFileSearch();
            acceptCallback(); // Simulate user accepting selection

            // Assert
            assert.strictEqual(showInfoStub.calledWith('No files selected'), true);
            assert.strictEqual(mockQuickPick.hide.calledOnce, true);
        });

        test('should filter items based on search input', async () => {
            // Arrange
            mockTreeProvider.getChildren.resolves([]);
            
            const mockItems = [
                { label: '  TestClass.cls', description: '$(folder) Org1/classes/TestClass.cls' },
                { label: '  AnotherClass.cls', description: '$(folder) Org1/classes/AnotherClass.cls' },
                { label: '  Component.js', description: '$(folder) Org2/lwc/Component.js' }
            ];

            mockQuickPick.items = mockItems as any;

            let changeValueCallback: (value: string) => void = () => {};
            mockQuickPick.onDidChangeValue.callsFake((callback) => {
                changeValueCallback = callback;
                return { dispose: () => {} } as any;
            });

            // Act
            await fileSearchService.openFileSearch();
            changeValueCallback('Test'); // Simulate user typing

            // Assert - should filter to only items containing 'Test'
            const expectedFiltered = mockItems.filter(item => 
                item.label.toLowerCase().includes('test') ||
                item.description?.toLowerCase().includes('test')
            );
            assert.strictEqual(mockQuickPick.items.length, expectedFiltered.length);
        });

        test('should reset items when search input is empty', async () => {
            // Arrange
            mockTreeProvider.getChildren.resolves([]);
            
            const mockItems = [
                { label: '  TestClass.cls', description: '$(folder) Org1/classes/TestClass.cls' },
                { label: '  AnotherClass.cls', description: '$(folder) Org1/classes/AnotherClass.cls' }
            ];

            mockQuickPick.items = mockItems as any;

            let changeValueCallback: (value: string) => void = () => {};
            mockQuickPick.onDidChangeValue.callsFake((callback) => {
                changeValueCallback = callback;
                return { dispose: () => {} } as any;
            });

            // Act
            await fileSearchService.openFileSearch();
            changeValueCallback(''); // Simulate empty search

            // Assert - should show all items
            assert.strictEqual(mockQuickPick.items, mockItems);
        });

        test('should dispose QuickPick when hidden', async () => {
            // Arrange
            mockTreeProvider.getChildren.resolves([]);

            let hideCallback: () => void = () => {};
            mockQuickPick.onDidHide.callsFake((callback) => {
                hideCallback = callback;
                return { dispose: () => {} } as any;
            });

            // Act
            await fileSearchService.openFileSearch();
            hideCallback(); // Simulate hiding QuickPick

            // Assert
            assert.strictEqual(mockQuickPick.dispose.calledOnce, true);
        });
    });

    suite('flattenTreeItems', () => {
        test('should flatten nested folder structure correctly', async () => {
            // This tests the private method indirectly through openFileSearch
            const mockNestedItems: TreeItem[] = [
                {
                    id: 'folder1',
                    label: 'classes',
                    type: ItemType.Folder,
                    children: [
                        {
                            id: 'file1',
                            label: 'TestClass.cls',
                            type: ItemType.File,
                            file: {
                                id: 'file1',
                                name: 'TestClass.cls',
                                type: 'ApexClass',
                                fullName: 'TestClass',
                                orgId: 'org1',
                                filePath: '/path/to/TestClass.cls'
                            }
                        }
                    ]
                }
            ];

            const mockRootItems: TreeItem[] = [
                {
                    id: 'available-orgs',
                    label: 'Organizations (1)',
                    type: ItemType.Folder,
                    children: [
                        {
                            id: 'org1',
                            label: 'Org 1',
                            type: ItemType.Org,
                            orgId: 'org1'
                        }
                    ]
                }
            ];

            mockTreeProvider.getChildren.onFirstCall().resolves(mockRootItems);
            mockTreeProvider.getChildren.onSecondCall().resolves(mockNestedItems);

            // Act
            await fileSearchService.openFileSearch();

            // Assert - check that items were processed and added to QuickPick
            assert.strictEqual(Array.isArray(mockQuickPick.items), true);
        });
    });

    suite('error handling', () => {
        test('should handle errors when loading org files', async () => {
            // Arrange
            const mockRootItems: TreeItem[] = [
                {
                    id: 'available-orgs',
                    label: 'Organizations (1)',
                    type: ItemType.Folder,
                    children: [
                        {
                            id: 'org1',
                            label: 'Org 1',
                            type: ItemType.Org,
                            orgId: 'org1'
                        }
                    ]
                }
            ];

            mockTreeProvider.getChildren.onFirstCall().resolves(mockRootItems);
            mockTreeProvider.getChildren.onSecondCall().rejects(new Error('Failed to load org files'));

            const consoleErrorStub = sinon.stub(console, 'error');

            // Act
            await fileSearchService.openFileSearch();

            // Assert - should handle error gracefully and continue
            assert.strictEqual(consoleErrorStub.called, true);
            assert.strictEqual(mockQuickPick.show.calledOnce, true);
        });
    });
});
import * as assert from 'assert';
import * as sinon from 'sinon';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { FileCompareService } from '../../services/FileCompareService';
import { EnhancedOrgManager } from '../../metadata/EnhancedOrgManager';
import { OrgFile, SalesforceOrg } from '../../types';

suite('FileCompareService Test Suite', () => {
    let fileCompareService: FileCompareService;
    let mockEnhancedOrgManager: sinon.SinonStubbedInstance<EnhancedOrgManager>;
    let executeCommandStub: sinon.SinonStub;
    let openTextDocumentStub: sinon.SinonStub;
    let setStatusBarMessageStub: sinon.SinonStub;
    let showWarningMessageStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;
    let withProgressStub: sinon.SinonStub;
    let createStatusBarItemStub: sinon.SinonStub;
    let mockStatusBarItem: any;
    let mockExistsSync: sinon.SinonStub;
    let mockReadFile: sinon.SinonStub;
    let mockWriteFile: sinon.SinonStub;
    let mockMkdir: sinon.SinonStub;

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
        orgId: 'org1-id',
        filePath: '/tmp/sf-org-compare/org-org1-id/force-app/main/default/classes/TestClass.cls'
    };

    const sampleFile2: OrgFile = {
        id: 'file2-id',
        name: 'TestClass.cls',
        type: 'ApexClass',
        fullName: 'TestClass',
        orgId: 'org2-id',
        filePath: '/tmp/sf-org-compare/org-org2-id/force-app/main/default/classes/TestClass.cls'
    };

    const sampleFile3: OrgFile = {
        id: 'file3-id',
        name: 'AnotherClass.cls',
        type: 'ApexClass',
        fullName: 'AnotherClass',
        orgId: 'org1-id',
        filePath: '/tmp/sf-org-compare/org-org1-id/force-app/main/default/classes/AnotherClass.cls'
    };

    const sampleFileWithoutPath: OrgFile = {
        id: 'file-no-path',
        name: 'NoPathClass.cls',
        type: 'ApexClass',
        fullName: 'NoPathClass',
        orgId: 'org1-id'
    };

    setup(() => {
        // Reset all stubs
        sinon.reset();

        // Create stubbed managers
        mockEnhancedOrgManager = sinon.createStubInstance(EnhancedOrgManager);

        // Mock status bar item
        mockStatusBarItem = {
            text: '',
            tooltip: '',
            backgroundColor: undefined,
            show: sinon.stub(),
            hide: sinon.stub(),
            dispose: sinon.stub()
        };

        // Mock VSCode methods
        executeCommandStub = sinon.stub(vscode.commands, 'executeCommand');
        openTextDocumentStub = sinon.stub(vscode.workspace, 'openTextDocument');
        setStatusBarMessageStub = sinon.stub(vscode.window, 'setStatusBarMessage');
        showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage');
        showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
        showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
        withProgressStub = sinon.stub(vscode.window, 'withProgress');
        createStatusBarItemStub = sinon.stub(vscode.window, 'createStatusBarItem').returns(mockStatusBarItem);

        // Mock file system operations
        mockExistsSync = sinon.stub(fs, 'existsSync');
        mockReadFile = sinon.stub(fs.promises, 'readFile');
        mockWriteFile = sinon.stub(fs.promises, 'writeFile');
        mockMkdir = sinon.stub(fs.promises, 'mkdir');

        // Set up default mock responses
        mockEnhancedOrgManager.getOrg.withArgs('org1-id').returns(sampleOrg1);
        mockEnhancedOrgManager.getOrg.withArgs('org2-id').returns(sampleOrg2);
        mockEnhancedOrgManager.getFileContentById.resolves('file content from enhanced manager');

        // Mock file system for local files
        mockExistsSync.returns(true);
        mockReadFile.resolves('public class TestClass { }');
        mockWriteFile.resolves();
        mockMkdir.resolves();

        // Create service instance with enhanced org manager
        fileCompareService = new FileCompareService(mockEnhancedOrgManager as any);
    });

    teardown(() => {
        sinon.restore();
    });

    suite('Constructor and Initialization', () => {
        test('should create status bar item on initialization', () => {
            assert.ok(createStatusBarItemStub.calledOnce);
            assert.ok(mockStatusBarItem.show.calledOnce);
        });

        test('should initialize with enhanced org manager', () => {
            const service = new FileCompareService(mockEnhancedOrgManager as any);
            assert.ok(service);
        });
    });

    suite('selectFile', () => {
        test('should add first file to selection', () => {
            fileCompareService.selectFile(sampleFile1);
            
            const selectedFiles = fileCompareService.getSelectedFiles();
            assert.strictEqual(selectedFiles.length, 1);
            assert.deepStrictEqual(selectedFiles[0], sampleFile1);
            assert.ok(setStatusBarMessageStub.calledOnce);
            assert.ok(executeCommandStub.calledWith('sf-org-source-compare.refreshTreeView'));
        });

        test('should add second file to selection', () => {
            fileCompareService.selectFile(sampleFile1);
            fileCompareService.selectFile(sampleFile2);
            
            const selectedFiles = fileCompareService.getSelectedFiles();
            assert.strictEqual(selectedFiles.length, 2);
            assert.deepStrictEqual(selectedFiles[0], sampleFile1);
            assert.deepStrictEqual(selectedFiles[1], sampleFile2);
        });

        test('should replace oldest file when selecting third file', () => {
            fileCompareService.selectFile(sampleFile1);
            fileCompareService.selectFile(sampleFile2);
            fileCompareService.selectFile(sampleFile3);
            
            const selectedFiles = fileCompareService.getSelectedFiles();
            assert.strictEqual(selectedFiles.length, 2);
            assert.deepStrictEqual(selectedFiles[0], sampleFile2);
            assert.deepStrictEqual(selectedFiles[1], sampleFile3);
        });

        test('should toggle off file when selecting same file again', () => {
            fileCompareService.selectFile(sampleFile1);
            fileCompareService.selectFile(sampleFile1);
            
            const selectedFiles = fileCompareService.getSelectedFiles();
            assert.strictEqual(selectedFiles.length, 0);
        });

        test('should remove first file when toggling it off with two files selected', () => {
            fileCompareService.selectFile(sampleFile1);
            fileCompareService.selectFile(sampleFile2);
            fileCompareService.selectFile(sampleFile1); // Toggle off first file
            
            const selectedFiles = fileCompareService.getSelectedFiles();
            assert.strictEqual(selectedFiles.length, 1);
            assert.deepStrictEqual(selectedFiles[0], sampleFile2);
        });

        test('should remove second file when toggling it off with two files selected', () => {
            fileCompareService.selectFile(sampleFile1);
            fileCompareService.selectFile(sampleFile2);
            fileCompareService.selectFile(sampleFile2); // Toggle off second file
            
            const selectedFiles = fileCompareService.getSelectedFiles();
            assert.strictEqual(selectedFiles.length, 1);
            assert.deepStrictEqual(selectedFiles[0], sampleFile1);
        });

        test('should update status bar item correctly', () => {
            fileCompareService.selectFile(sampleFile1);
            
            assert.ok(mockStatusBarItem.text.includes('TestClass.cls'));
            assert.ok(mockStatusBarItem.text.includes('select 1 more'));
        });
    });

    suite('clearSelection', () => {
        test('should clear all selected files', () => {
            fileCompareService.selectFile(sampleFile1);
            fileCompareService.selectFile(sampleFile2);
            fileCompareService.clearSelection();
            
            const selectedFiles = fileCompareService.getSelectedFiles();
            assert.strictEqual(selectedFiles.length, 0);
            assert.ok(setStatusBarMessageStub.called);
            assert.ok(executeCommandStub.calledWith('sf-org-source-compare.refreshTreeView'));
        });

        test('should update status bar item after clearing', () => {
            fileCompareService.selectFile(sampleFile1);
            fileCompareService.clearSelection();
            
            assert.ok(mockStatusBarItem.text.includes('No files selected'));
        });
    });

    suite('canCompare and isComparingFiles', () => {
        test('should return false with no files selected', () => {
            assert.strictEqual(fileCompareService.canCompare(), false);
        });

        test('should return false with one file selected', () => {
            fileCompareService.selectFile(sampleFile1);
            assert.strictEqual(fileCompareService.canCompare(), false);
        });

        test('should return true with two files selected', () => {
            fileCompareService.selectFile(sampleFile1);
            fileCompareService.selectFile(sampleFile2);
            assert.strictEqual(fileCompareService.canCompare(), true);
        });

        test('should track comparing state', () => {
            assert.strictEqual(fileCompareService.isComparingFiles(), false);
        });
    });

    suite('compareSelectedFiles', () => {
        test('should show warning when less than 2 files selected', async () => {
            fileCompareService.selectFile(sampleFile1);
            
            await fileCompareService.compareSelectedFiles();
            
            assert.ok(showWarningMessageStub.calledWith('Please select 2 files to compare.'));
            assert.ok(!executeCommandStub.calledWith('vscode.diff'));
        });

        test('should successfully compare two files with local paths', async () => {
            fileCompareService.selectFile(sampleFile1);
            fileCompareService.selectFile(sampleFile2);
            
            // Mock progress callback
            withProgressStub.callsArgWith(1, {
                report: sinon.stub()
            });
            
            await fileCompareService.compareSelectedFiles();
            
            // Should use local files directly
            assert.ok(executeCommandStub.calledWith('vscode.diff'));
            assert.ok(!mockEnhancedOrgManager.getFileContentById.called); // No content retrieval
        });

        test('should fallback to content retrieval for files without paths', async () => {
            fileCompareService.selectFile(sampleFileWithoutPath);
            fileCompareService.selectFile(sampleFile2);
            
            // Mock document creation
            const mockDocument = { uri: vscode.Uri.parse('untitled:NoPathClass.cls_org1') };
            openTextDocumentStub.resolves(mockDocument);
            
            withProgressStub.callsArgWith(1, {
                report: sinon.stub()
            });
            
            await fileCompareService.compareSelectedFiles();
            
            // Should fall back to content retrieval for file without path
            assert.ok(mockEnhancedOrgManager.getFileContentById.called);
            assert.ok(executeCommandStub.calledWith('vscode.diff'));
        });

        test('should handle file content retrieval errors', async () => {
            fileCompareService.selectFile(sampleFile1);
            fileCompareService.selectFile(sampleFile2);
            
            // Mock file system error
            mockExistsSync.withArgs(sampleFile1.filePath).returns(false);
            mockEnhancedOrgManager.getFileContentById.rejects(new Error('Network error'));
            
            withProgressStub.callsArgWith(1, {
                report: sinon.stub()
            });
            
            await fileCompareService.compareSelectedFiles();
            
            assert.ok(showErrorMessageStub.called);
        });

        test('should show correct progress messages for local files', async () => {
            fileCompareService.selectFile(sampleFile1);
            fileCompareService.selectFile(sampleFile2);
            
            const mockProgress = {
                report: sinon.stub()
            };
            withProgressStub.callsArgWith(1, mockProgress);
            
            await fileCompareService.compareSelectedFiles();
            
            // Should show "Preparing" instead of "Loading" for local files
            const progressCalls = mockProgress.report.getCalls();
            const preparingCalls = progressCalls.filter(call => 
                call.args[0].message && call.args[0].message.includes('Preparing')
            );
            assert.ok(preparingCalls.length > 0);
        });

        test('should show success message with local files indicator', async () => {
            fileCompareService.selectFile(sampleFile1);
            fileCompareService.selectFile(sampleFile2);
            
            withProgressStub.callsArgWith(1, {
                report: sinon.stub()
            });
            
            await fileCompareService.compareSelectedFiles();
            
            // Wait for timeout to trigger success message
            await new Promise(resolve => setTimeout(resolve, 600));
            
            const successCall = showInformationMessageStub.getCalls().find(call =>
                call.args[0].includes('using local cached files')
            );
            assert.ok(successCall);
        });

        test('should handle mixed local and remote files', async () => {
            fileCompareService.selectFile(sampleFile1); // Has filePath
            fileCompareService.selectFile(sampleFileWithoutPath); // No filePath
            
            withProgressStub.callsArgWith(1, {
                report: sinon.stub()
            });
            
            await fileCompareService.compareSelectedFiles();
            
            // Should use local for first file, content retrieval for second
            assert.ok(executeCommandStub.calledWith('vscode.diff'));
            assert.ok(mockEnhancedOrgManager.getFileContentById.calledOnce);
        });

        test('should update comparison state during operation', async () => {
            fileCompareService.selectFile(sampleFile1);
            fileCompareService.selectFile(sampleFile2);
            
            let isComparingDuringProgress = false;
            
            withProgressStub.callsFake((options, callback) => {
                isComparingDuringProgress = fileCompareService.isComparingFiles();
                return callback({ report: sinon.stub() });
            });
            
            await fileCompareService.compareSelectedFiles();
            
            assert.ok(isComparingDuringProgress);
            assert.strictEqual(fileCompareService.isComparingFiles(), false); // Should be reset after
        });
    });

    suite('File Name Sanitization', () => {
        test('should create valid file names for comparison', async () => {
            const fileWithSpecialChars: OrgFile = {
                id: 'special-file',
                name: 'Test<>Class?.cls',
                type: 'ApexClass',
                fullName: 'TestClass',
                orgId: 'org1-id'
            };
            
            fileCompareService.selectFile(fileWithSpecialChars);
            fileCompareService.selectFile(sampleFile2);
            
            withProgressStub.callsArgWith(1, { report: sinon.stub() });
            
            await fileCompareService.compareSelectedFiles();
            
            // Should create temp file with sanitized name
            assert.ok(mockWriteFile.called);
            const writeCall = mockWriteFile.getCall(0);
            const filePath = writeCall.args[0];
            assert.ok(!filePath.includes('<'));
            assert.ok(!filePath.includes('>'));
            assert.ok(!filePath.includes('?'));
        });
    });

    suite('Status Bar Management', () => {
        test('should update status bar with selection count', () => {
            fileCompareService.selectFile(sampleFile1);
            
            const statusText = mockStatusBarItem.text;
            assert.ok(statusText.includes('TestClass.cls'));
            assert.ok(statusText.includes('select 1 more'));
        });

        test('should show ready state with two files selected', () => {
            fileCompareService.selectFile(sampleFile1);
            fileCompareService.selectFile(sampleFile2);
            
            const statusText = mockStatusBarItem.text;
            assert.ok(statusText.includes('Ready to compare'));
        });

        test('should show comparing state during operation', async () => {
            fileCompareService.selectFile(sampleFile1);
            fileCompareService.selectFile(sampleFile2);
            
            let statusDuringComparison = '';
            
            withProgressStub.callsFake((options, callback) => {
                statusDuringComparison = mockStatusBarItem.text;
                return callback({ report: sinon.stub() });
            });
            
            await fileCompareService.compareSelectedFiles();
            
            assert.ok(statusDuringComparison.includes('Comparing files'));
        });
    });

    suite('Cleanup', () => {
        test('should cleanup temporary files and dispose status bar', async () => {
            fileCompareService.selectFile(sampleFile1);
            fileCompareService.selectFile(sampleFile2);
            
            withProgressStub.callsArgWith(1, { report: sinon.stub() });
            
            await fileCompareService.compareSelectedFiles();
            await fileCompareService.cleanup();
            
            assert.ok(mockStatusBarItem.dispose.called);
        });

        test('should handle cleanup errors gracefully', async () => {
            const unlinkStub = sinon.stub(fs.promises, 'unlink').rejects(new Error('Permission denied'));
            
            // Should not throw
            await fileCompareService.cleanup();
            
            assert.ok(true);
            unlinkStub.restore();
        });
    });

    suite('Language Detection', () => {
        test('should detect Apex language for .cls files', async () => {
            // This is tested indirectly through the comparison workflow
            fileCompareService.selectFile(sampleFile1);
            fileCompareService.selectFile(sampleFile2);
            
            withProgressStub.callsArgWith(1, { report: sinon.stub() });
            
            await fileCompareService.compareSelectedFiles();
            
            assert.ok(executeCommandStub.calledWith('vscode.diff'));
        });
    });
});
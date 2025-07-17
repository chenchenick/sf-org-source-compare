import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { FileCompareService } from '../../services/FileCompareService';
import { OrgManager } from '../../services/OrgManager';
import { OrgFile, SalesforceOrg } from '../../types';

suite('FileCompareService Test Suite', () => {
    let fileCompareService: FileCompareService;
    let mockOrgManager: sinon.SinonStubbedInstance<OrgManager>;
    let executeCommandStub: sinon.SinonStub;
    let openTextDocumentStub: sinon.SinonStub;
    let setStatusBarMessageStub: sinon.SinonStub;
    let showWarningMessageStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;

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
        name: 'TestClass.cls',
        type: 'ApexClass',
        fullName: 'TestClass',
        orgId: 'org2-id'
    };

    const sampleFile3: OrgFile = {
        id: 'file3-id',
        name: 'AnotherClass.cls',
        type: 'ApexClass',
        fullName: 'AnotherClass',
        orgId: 'org1-id'
    };

    setup(() => {
        // Reset all stubs
        sinon.reset();

        // Create stubbed OrgManager
        mockOrgManager = sinon.createStubInstance(OrgManager);

        // Mock VSCode methods
        executeCommandStub = sinon.stub(vscode.commands, 'executeCommand');
        openTextDocumentStub = sinon.stub(vscode.workspace, 'openTextDocument');
        setStatusBarMessageStub = sinon.stub(vscode.window, 'setStatusBarMessage');
        showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage');
        showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
        showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');

        // Set up default mock responses
        mockOrgManager.getOrg.withArgs('org1-id').returns(sampleOrg1);
        mockOrgManager.getOrg.withArgs('org2-id').returns(sampleOrg2);
        mockOrgManager.getFileContent.resolves('file content');

        // Create service instance
        fileCompareService = new FileCompareService(mockOrgManager as any);
    });

    teardown(() => {
        sinon.restore();
    });

    suite('selectFile', () => {
        test('should add first file to selection', () => {
            fileCompareService.selectFile(sampleFile1);
            
            const selectedFiles = fileCompareService.getSelectedFiles();
            assert.strictEqual(selectedFiles.length, 1);
            assert.deepStrictEqual(selectedFiles[0], sampleFile1);
            assert.ok(setStatusBarMessageStub.calledOnce);
            assert.ok(executeCommandStub.calledWith('sf-org-source-compare.refreshOrgs'));
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
    });

    suite('clearSelection', () => {
        test('should clear all selected files', () => {
            fileCompareService.selectFile(sampleFile1);
            fileCompareService.selectFile(sampleFile2);
            fileCompareService.clearSelection();
            
            const selectedFiles = fileCompareService.getSelectedFiles();
            assert.strictEqual(selectedFiles.length, 0);
            assert.ok(setStatusBarMessageStub.called);
            assert.ok(executeCommandStub.calledWith('sf-org-source-compare.refreshOrgs'));
        });

        test('should handle clearing empty selection', () => {
            fileCompareService.clearSelection();
            
            const selectedFiles = fileCompareService.getSelectedFiles();
            assert.strictEqual(selectedFiles.length, 0);
        });
    });

    suite('canCompare', () => {
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
    });

    suite('compareSelectedFiles', () => {
        test('should show warning when less than 2 files selected', async () => {
            fileCompareService.selectFile(sampleFile1);
            
            await fileCompareService.compareSelectedFiles();
            
            assert.ok(showWarningMessageStub.calledWith('Please select 2 files to compare.'));
            assert.ok(executeCommandStub.neverCalledWith('vscode.diff'));
        });

        test('should successfully compare two files', async () => {
            fileCompareService.selectFile(sampleFile1);
            fileCompareService.selectFile(sampleFile2);
            
            // Mock document creation
            const mockDocument = { uri: vscode.Uri.parse('untitled:TestClass.cls_org1') };
            openTextDocumentStub.resolves(mockDocument);
            executeCommandStub.withArgs('vscode.diff').resolves();
            
            await fileCompareService.compareSelectedFiles();
            
            assert.ok(showInformationMessageStub.calledWith('Loading file contents from Salesforce orgs...'));
            assert.ok(mockOrgManager.getFileContent.calledTwice);
            assert.ok(executeCommandStub.calledWith('vscode.diff'));
            assert.ok(showInformationMessageStub.calledWith('Files opened for comparison.'));
        });

        test('should handle file content retrieval errors', async () => {
            fileCompareService.selectFile(sampleFile1);
            fileCompareService.selectFile(sampleFile2);
            
            mockOrgManager.getFileContent.rejects(new Error('Network error'));
            
            await fileCompareService.compareSelectedFiles();
            
            assert.ok(showErrorMessageStub.calledOnce);
            assert.ok(showErrorMessageStub.args[0][0].includes('Failed to compare files'));
        });

        test('should handle VSCode diff command errors', async () => {
            fileCompareService.selectFile(sampleFile1);
            fileCompareService.selectFile(sampleFile2);
            
            const mockDocument = { uri: vscode.Uri.parse('untitled:TestClass.cls_org1') };
            openTextDocumentStub.resolves(mockDocument);
            executeCommandStub.withArgs('vscode.diff').rejects(new Error('Diff error'));
            
            await fileCompareService.compareSelectedFiles();
            
            assert.ok(showErrorMessageStub.calledOnce);
            assert.ok(showErrorMessageStub.args[0][0].includes('Failed to compare files'));
        });

        test('should create meaningful comparison title', async () => {
            fileCompareService.selectFile(sampleFile1);
            fileCompareService.selectFile(sampleFile2);
            
            const mockDocument = { uri: vscode.Uri.parse('untitled:TestClass.cls_org1') };
            openTextDocumentStub.resolves(mockDocument);
            executeCommandStub.withArgs('vscode.diff').resolves();
            
            await fileCompareService.compareSelectedFiles();
            
            // Check that the title includes both org names and file names
            const diffCall = executeCommandStub.getCalls().find(call => call.args[0] === 'vscode.diff');
            assert.ok(diffCall);
            const title = diffCall.args[3];
            assert.ok(title.includes('org1'));
            assert.ok(title.includes('org2'));
            assert.ok(title.includes('TestClass.cls'));
        });

        test('should handle missing org data gracefully', async () => {
            fileCompareService.selectFile(sampleFile1);
            fileCompareService.selectFile(sampleFile2);
            
            mockOrgManager.getOrg.withArgs('org1-id').returns(undefined);
            
            const mockDocument = { uri: vscode.Uri.parse('untitled:TestClass.cls_Unknown') };
            openTextDocumentStub.resolves(mockDocument);
            executeCommandStub.withArgs('vscode.diff').resolves();
            
            await fileCompareService.compareSelectedFiles();
            
            const diffCall = executeCommandStub.getCalls().find(call => call.args[0] === 'vscode.diff');
            assert.ok(diffCall);
            const title = diffCall.args[3];
            assert.ok(title.includes('Unknown Org'));
        });
    });

    suite('createNamedTempFile', () => {
        test('should create document with correct content and language', async () => {
            mockOrgManager.getFileContent.withArgs('org1-id', 'file1-id').resolves('public class TestClass {}');
            
            const mockDocument = { uri: vscode.Uri.parse('untitled:TestClass.cls_org1') };
            openTextDocumentStub.resolves(mockDocument);
            
            const uri = await (fileCompareService as any).createNamedTempFile(sampleFile1);
            
            assert.ok(openTextDocumentStub.calledOnce);
            const openCall = openTextDocumentStub.getCall(0);
            assert.strictEqual(openCall.args[0].content, 'public class TestClass {}');
            assert.strictEqual(openCall.args[0].language, 'apex');
            assert.deepStrictEqual(uri, mockDocument.uri);
        });

        test('should handle missing org gracefully', async () => {
            mockOrgManager.getOrg.withArgs('org1-id').returns(undefined);
            
            const mockDocument = { uri: vscode.Uri.parse('untitled:TestClass.cls_UnknownOrg') };
            openTextDocumentStub.resolves(mockDocument);
            
            await (fileCompareService as any).createNamedTempFile(sampleFile1);
            
            assert.ok(openTextDocumentStub.calledOnce);
        });
    });

    suite('getLanguageFromFileName', () => {
        const testCases = [
            { fileName: 'TestClass.cls', expected: 'apex' },
            { fileName: 'TestTrigger.trigger', expected: 'apex' },
            { fileName: 'script.js', expected: 'javascript' },
            { fileName: 'metadata.xml', expected: 'xml' },
            { fileName: 'page.html', expected: 'html' },
            { fileName: 'styles.css', expected: 'css' },
            { fileName: 'unknown.txt', expected: 'plaintext' },
            { fileName: 'noextension', expected: 'plaintext' }
        ];

        testCases.forEach(({ fileName, expected }) => {
            test(`should return ${expected} for ${fileName}`, () => {
                const language = (fileCompareService as any).getLanguageFromFileName(fileName);
                assert.strictEqual(language, expected);
            });
        });
    });

    suite('updateStatusBar', () => {
        test('should show correct message with no files selected', () => {
            (fileCompareService as any).updateStatusBar();
            
            assert.ok(setStatusBarMessageStub.calledOnce);
            const message = setStatusBarMessageStub.getCall(0).args[0];
            assert.ok(message.includes('No files selected'));
        });

        test('should show correct message with one file selected', () => {
            fileCompareService.selectFile(sampleFile1);
            
            const lastCall = setStatusBarMessageStub.lastCall;
            const message = lastCall.args[0];
            assert.ok(message.includes('TestClass.cls'));
            assert.ok(message.includes('select 1 more file'));
        });

        test('should show correct message with two files selected', () => {
            fileCompareService.selectFile(sampleFile1);
            fileCompareService.selectFile(sampleFile2);
            
            const lastCall = setStatusBarMessageStub.lastCall;
            const message = lastCall.args[0];
            assert.ok(message.includes('TestClass.cls'));
            assert.ok(message.includes('ready to compare'));
        });

        test('should set timeout for status bar message', () => {
            (fileCompareService as any).updateStatusBar();
            
            const lastCall = setStatusBarMessageStub.lastCall;
            assert.strictEqual(lastCall.args[1], 3000);
        });
    });

    suite('edge cases and error handling', () => {
        test('should handle file with same ID but different properties', () => {
            const file1 = { ...sampleFile1 };
            const file2 = { ...sampleFile1, name: 'DifferentName.cls' };
            
            fileCompareService.selectFile(file1);
            fileCompareService.selectFile(file2); // Same ID, should toggle off
            
            const selectedFiles = fileCompareService.getSelectedFiles();
            assert.strictEqual(selectedFiles.length, 0);
        });

        test('should handle null/undefined file gracefully', () => {
            try {
                fileCompareService.selectFile(null as any);
                assert.fail('Should throw error for null file');
            } catch (error) {
                // Expected behavior
            }
        });

        test('should handle comparison with files from same org', async () => {
            const sameOrgFile = { ...sampleFile2, orgId: 'org1-id' };
            
            fileCompareService.selectFile(sampleFile1);
            fileCompareService.selectFile(sameOrgFile);
            
            const mockDocument = { uri: vscode.Uri.parse('untitled:TestClass.cls_org1') };
            openTextDocumentStub.resolves(mockDocument);
            executeCommandStub.withArgs('vscode.diff').resolves();
            
            await fileCompareService.compareSelectedFiles();
            
            // Should still work with files from same org
            assert.ok(executeCommandStub.calledWith('vscode.diff'));
        });

        test('should handle very long file names', async () => {
            const longNameFile = {
                ...sampleFile1,
                name: 'VeryLongClassNameThatExceedsNormalLimits'.repeat(5) + '.cls'
            };
            
            fileCompareService.selectFile(longNameFile);
            
            const selectedFiles = fileCompareService.getSelectedFiles();
            assert.strictEqual(selectedFiles.length, 1);
            assert.ok(setStatusBarMessageStub.called);
        });
    });
});
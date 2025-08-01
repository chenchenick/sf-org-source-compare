import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { MultiFileCompareService, MultiCompareResult, DiffLine, FileDiffResult } from '../../services/MultiFileCompareService';
import { EnhancedOrgManager } from '../../metadata/EnhancedOrgManager';
import { OrgFile, MultiCompareSelection } from '../../types';

suite('MultiFileCompareService Tests', () => {
    let service: MultiFileCompareService;
    let mockOrgManager: sinon.SinonStubbedInstance<EnhancedOrgManager>;
    let sandbox: sinon.SinonSandbox;

    const mockOrgFile1: OrgFile = {
        id: 'file1',
        name: 'TestClass1.cls',
        orgId: 'org1',
        type: 'ApexClass',
        fullName: 'TestClass1',
        filePath: '/test/path1.cls'
    };

    const mockOrgFile2: OrgFile = {
        id: 'file2',
        name: 'TestClass2.cls',
        orgId: 'org2',
        type: 'ApexClass',
        fullName: 'TestClass2',
        filePath: '/test/path2.cls'
    };

    const mockOrgFile3: OrgFile = {
        id: 'file3',
        name: 'TestClass3.cls',
        orgId: 'org3',
        type: 'ApexClass',
        fullName: 'TestClass3',
        filePath: '/test/path3.cls'
    };

    setup(() => {
        sandbox = sinon.createSandbox();
        mockOrgManager = sandbox.createStubInstance(EnhancedOrgManager);
        service = new MultiFileCompareService(mockOrgManager as any);

        // Mock VSCode workspace
        sandbox.stub(vscode.workspace, 'openTextDocument').resolves({
            getText: () => 'public class TestClass1 {\n    // Method 1\n}'
        } as any);

        // Mock org manager responses
        mockOrgManager.getOrg.callsFake((orgId: string) => {
            switch (orgId) {
                case 'org1': return { alias: 'Dev Org', username: 'dev@test.com' } as any;
                case 'org2': return { alias: 'Test Org', username: 'test@test.com' } as any;
                case 'org3': return { alias: 'Prod Org', username: 'prod@test.com' } as any;
                default: return null;
            }
        });

        mockOrgManager.getFileContentById.callsFake(async (orgId: string, fileId: string) => {
            switch (fileId) {
                case 'file1': return 'public class TestClass1 {\n    // Method 1\n}';
                case 'file2': return 'public class TestClass2 {\n    // Method 2\n}';
                case 'file3': return 'public class TestClass3 {\n    // Method 3\n}';
                default: return '';
            }
        });
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('compareFiles', () => {
        test('should throw error for less than 2 files', async () => {
            const selection: MultiCompareSelection = {
                files: [mockOrgFile1],
                compareType: 'two-way',
                layout: 'horizontal',
                maxFiles: 4
            };

            await assert.rejects(
                () => service.compareFiles(selection),
                /At least 2 files are required for comparison/
            );
        });

        test('should throw error for more than max files', async () => {
            const files = Array(7).fill(0).map((_, i) => ({
                ...mockOrgFile1,
                id: `file${i}`,
                name: `TestClass${i}.cls`
            }));

            const selection: MultiCompareSelection = {
                files,
                compareType: 'multi-way',
                layout: 'grid',
                maxFiles: 7
            };

            await assert.rejects(
                () => service.compareFiles(selection),
                /Cannot compare more than 6 files/
            );
        });

        test('should perform two-way comparison successfully', async () => {
            const selection: MultiCompareSelection = {
                files: [mockOrgFile1, mockOrgFile2],
                compareType: 'two-way',
                layout: 'horizontal',
                maxFiles: 4
            };

            const result = await service.compareFiles(selection);

            assert.strictEqual(result.files.length, 2);
            assert.strictEqual(result.compareType, 'two-way');
            assert.strictEqual(result.layout, 'horizontal');
            assert.ok(result.totalLines > 0);
            assert.strictEqual(result.files[0].orgName, 'Dev Org');
            assert.strictEqual(result.files[1].orgName, 'Test Org');
        });

        test('should perform three-way comparison successfully', async () => {
            const selection: MultiCompareSelection = {
                files: [mockOrgFile1, mockOrgFile2, mockOrgFile3],
                compareType: 'three-way',
                layout: 'horizontal',
                maxFiles: 4
            };

            const result = await service.compareFiles(selection);

            assert.strictEqual(result.files.length, 3);
            assert.strictEqual(result.compareType, 'three-way');
            assert.strictEqual(result.layout, 'horizontal');
            assert.ok(result.totalLines > 0);
            assert.strictEqual(result.files[0].orgName, 'Dev Org');
            assert.strictEqual(result.files[1].orgName, 'Test Org');
            assert.strictEqual(result.files[2].orgName, 'Prod Org');
        });

        test('should use local file content when available', async () => {
            const selection: MultiCompareSelection = {
                files: [mockOrgFile1, mockOrgFile2],
                compareType: 'two-way',
                layout: 'horizontal',
                maxFiles: 4
            };

            await service.compareFiles(selection);

            // Verify workspace.openTextDocument was called (local file access)
            assert.ok((vscode.workspace.openTextDocument as sinon.SinonStub).calledTwice);
            // Verify org manager was NOT called for content (should use local files)
            assert.ok(mockOrgManager.getFileContentById.notCalled);
        });

        test('should fallback to org content when local file fails', async () => {
            // Mock file read failure
            (vscode.workspace.openTextDocument as sinon.SinonStub).rejects(new Error('File not found'));

            const selection: MultiCompareSelection = {
                files: [mockOrgFile1, mockOrgFile2],
                compareType: 'two-way',
                layout: 'horizontal',
                maxFiles: 4
            };

            await service.compareFiles(selection);

            // Verify fallback to org manager
            assert.ok(mockOrgManager.getFileContentById.calledTwice);
        });

        test('should handle files without local paths', async () => {
            const fileWithoutPath = { ...mockOrgFile1, filePath: undefined };
            const selection: MultiCompareSelection = {
                files: [fileWithoutPath, mockOrgFile2],
                compareType: 'two-way',
                layout: 'horizontal',
                maxFiles: 4
            };

            await service.compareFiles(selection);

            // Should call org manager for file without path
            assert.ok(mockOrgManager.getFileContentById.calledWith('org1', 'file1'));
        });
    });

    suite('diff algorithm', () => {
        test('should detect added lines correctly', async () => {
            mockOrgManager.getFileContentById.callsFake(async (orgId: string, fileId: string) => {
                switch (fileId) {
                    case 'file1': return 'line1\nline2';
                    case 'file2': return 'line1\nline2\nline3';
                    default: return '';
                }
            });

            const filesWithoutPath = [
                { ...mockOrgFile1, filePath: undefined },
                { ...mockOrgFile2, filePath: undefined }
            ];

            const selection: MultiCompareSelection = {
                files: filesWithoutPath,
                compareType: 'two-way',
                layout: 'horizontal',
                maxFiles: 4
            };

            const result = await service.compareFiles(selection);

            // File2 should have an added line
            const file2Lines = result.files[1].lines;
            const addedLines = file2Lines.filter(line => line.type === 'added');
            assert.ok(addedLines.length > 0);
        });

        test('should detect removed lines correctly', async () => {
            mockOrgManager.getFileContentById.callsFake(async (orgId: string, fileId: string) => {
                switch (fileId) {
                    case 'file1': return 'line1\nline2\nline3';
                    case 'file2': return 'line1\nline2';
                    default: return '';
                }
            });

            const filesWithoutPath = [
                { ...mockOrgFile1, filePath: undefined },
                { ...mockOrgFile2, filePath: undefined }
            ];

            const selection: MultiCompareSelection = {
                files: filesWithoutPath,
                compareType: 'two-way',
                layout: 'horizontal',
                maxFiles: 4
            };

            const result = await service.compareFiles(selection);

            // Should have some difference detected
            assert.ok(result.addedLines > 0 || result.removedLines > 0);
        });

        test('should calculate statistics correctly', async () => {
            const selection: MultiCompareSelection = {
                files: [mockOrgFile1, mockOrgFile2],
                compareType: 'two-way',
                layout: 'horizontal',
                maxFiles: 4
            };

            const result = await service.compareFiles(selection);

            assert.ok(typeof result.totalLines === 'number');
            assert.ok(typeof result.addedLines === 'number');
            assert.ok(typeof result.removedLines === 'number');
            assert.ok(typeof result.modifiedLines === 'number');
            assert.ok(result.totalLines >= 0);
            assert.ok(result.addedLines >= 0);
            assert.ok(result.removedLines >= 0);
            assert.ok(result.modifiedLines >= 0);
        });
    });

    suite('utility methods', () => {
        test('generateComparisonTitle should work for two files', () => {
            const title = service.generateComparisonTitle([mockOrgFile1, mockOrgFile2]);
            assert.strictEqual(title, 'TestClass1.cls ↔ TestClass2.cls');
        });

        test('generateComparisonTitle should work for three files', () => {
            const title = service.generateComparisonTitle([mockOrgFile1, mockOrgFile2, mockOrgFile3]);
            assert.strictEqual(title, 'TestClass1.cls ↔ TestClass2.cls ↔ TestClass3.cls');
        });

        test('generateComparisonTitle should work for multiple files', () => {
            const files = [mockOrgFile1, mockOrgFile2, mockOrgFile3, mockOrgFile1];
            const title = service.generateComparisonTitle(files);
            assert.strictEqual(title, 'Multi-way Comparison (4 files)');
        });

        test('getRecommendedLayout should return correct layouts', () => {
            assert.strictEqual(service.getRecommendedLayout(2), 'horizontal');
            assert.strictEqual(service.getRecommendedLayout(3), 'horizontal');
            assert.strictEqual(service.getRecommendedLayout(4), 'grid');
            assert.strictEqual(service.getRecommendedLayout(6), 'grid');
        });
    });

    suite('error handling', () => {
        test('should handle org manager errors gracefully', async () => {
            mockOrgManager.getFileContentById.rejects(new Error('Network error'));
            (vscode.workspace.openTextDocument as sinon.SinonStub).rejects(new Error('File not found'));

            const filesWithoutPath = [
                { ...mockOrgFile1, filePath: undefined },
                { ...mockOrgFile2, filePath: undefined }
            ];

            const selection: MultiCompareSelection = {
                files: filesWithoutPath,
                compareType: 'two-way',
                layout: 'horizontal',
                maxFiles: 4
            };

            const result = await service.compareFiles(selection);

            // Should complete without throwing, using empty content
            assert.strictEqual(result.files.length, 2);
            // Files should have empty content but still be processed
            assert.ok(result.files.every(file => Array.isArray(file.lines)));
        });

        test('should handle unknown orgs gracefully', async () => {
            mockOrgManager.getOrg.returns(undefined);

            const selection: MultiCompareSelection = {
                files: [mockOrgFile1, mockOrgFile2],
                compareType: 'two-way',
                layout: 'horizontal',
                maxFiles: 4
            };

            const result = await service.compareFiles(selection);

            // Should use 'Unknown Org' for missing orgs
            assert.ok(result.files.every(file => file.orgName === 'Unknown Org'));
        });
    });
});
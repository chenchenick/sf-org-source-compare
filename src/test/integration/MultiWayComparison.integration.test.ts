import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { FileCompareService } from '../../services/FileCompareService';
import { MultiFileCompareService } from '../../services/MultiFileCompareService';
import { MultiFileCompareWebview } from '../../webview/MultiFileCompareWebview';
import { SfOrgCompareProvider } from '../../providers/SfOrgCompareProvider';
import { EnhancedOrgManager } from '../../metadata/EnhancedOrgManager';
import { OrgFile, SalesforceOrg, MultiCompareSelection } from '../../types';
import { Container, ServiceTokens } from '../../di';

suite('Multi-Way Comparison Integration Tests', () => {
    let container: Container, 
        fileCompareService: FileCompareService;
    let multiFileCompareService: MultiFileCompareService;
    let multiFileCompareWebview: MultiFileCompareWebview;
    let sfOrgCompareProvider: SfOrgCompareProvider;
    let mockEnhancedOrgManager: sinon.SinonStubbedInstance<EnhancedOrgManager>;
    let mockContext: sinon.SinonStubbedInstance<vscode.ExtensionContext>;
    let sandbox: sinon.SinonSandbox;

    const mockOrgs: SalesforceOrg[] = [
        {
            id: 'org1',
            username: 'dev@test.com',
            alias: 'DevOrg',
            instanceUrl: 'https://dev.salesforce.com',
            accessToken: 'token1'
        },
        {
            id: 'org2', 
            username: 'test@test.com',
            alias: 'TestOrg',
            instanceUrl: 'https://test.salesforce.com',
            accessToken: 'token2'
        },
        {
            id: 'org3',
            username: 'prod@test.com',
            alias: 'ProdOrg',
            instanceUrl: 'https://prod.salesforce.com',
            accessToken: 'token3'
        }
    ];

    const mockFiles: OrgFile[] = [
        {
            id: 'file1',
            name: 'AccountService.cls',
            type: 'ApexClass',
            fullName: 'AccountService',
            orgId: 'org1',
            filePath: '/dev/AccountService.cls'
        },
        {
            id: 'file2',
            name: 'AccountService.cls',
            type: 'ApexClass',
            fullName: 'AccountService',
            orgId: 'org2',
            filePath: '/test/AccountService.cls'
        },
        {
            id: 'file3',
            name: 'AccountService.cls',
            type: 'ApexClass',
            fullName: 'AccountService',
            orgId: 'org3',
            filePath: '/prod/AccountService.cls'
        }
    ];

    const mockFileContents = {
        file1: `public class AccountService {
    public static void createAccount(String name) {
        Account acc = new Account(Name = name);
        insert acc;
    }
}`,
        file2: `public class AccountService {
    public static void createAccount(String name) {
        Account acc = new Account(Name = name, Type = 'Customer');
        insert acc;
    }
}`,
        file3: `public class AccountService {
    public static void createAccount(String name, String type) {
        Account acc = new Account(Name = name, Type = type);
        insert acc;
    }
}`
    };

    setup(() => {
        sandbox = sinon.createSandbox();

        // Mock VSCode APIs
        mockContext = {
            extensionPath: '/test/extension',
            subscriptions: [],
            globalState: {
                get: sandbox.stub(),
                update: sandbox.stub()
            },
            workspaceState: {
                get: sandbox.stub(),
                update: sandbox.stub()
            }
        } as any;

        // Mock enhanced org manager
        mockEnhancedOrgManager = sandbox.createStubInstance(EnhancedOrgManager);
        mockEnhancedOrgManager.getOrg.callsFake(orgId => mockOrgs.find(org => org.id === orgId) || undefined);
        mockEnhancedOrgManager.getFileContentById.callsFake(async (orgId, fileId) => {
            return mockFileContents[fileId as keyof typeof mockFileContents] || '';
        });

        // Mock VSCode workspace
        sandbox.stub(vscode.workspace, 'openTextDocument').resolves({
            getText: () => mockFileContents.file1
        } as any);

        // Mock VSCode window
        sandbox.stub(vscode.window, 'createWebviewPanel').returns({
            webview: {
                html: '',
                onDidReceiveMessage: sandbox.stub(),
                postMessage: sandbox.stub()
            },
            onDidDispose: sandbox.stub(),
            reveal: sandbox.stub()
        } as any);

        sandbox.stub(vscode.window, 'createStatusBarItem').returns({
            text: '',
            show: sandbox.stub(),
            dispose: sandbox.stub()
        } as any);

        sandbox.stub(vscode.window, 'showInformationMessage');
        sandbox.stub(vscode.window, 'setStatusBarMessage');
        sandbox.stub(vscode.commands, 'executeCommand');

        // Initialize container and services
        container = new Container(mockContext as any);
        container.registerInstance(ServiceTokens.ENHANCED_ORG_MANAGER, mockEnhancedOrgManager);

        fileCompareService = new FileCompareService(mockEnhancedOrgManager as any);
        multiFileCompareService = new MultiFileCompareService(mockEnhancedOrgManager as any);
        multiFileCompareWebview = new MultiFileCompareWebview(mockContext as any, multiFileCompareService);
        
        container.registerInstance(ServiceTokens.FILE_COMPARE_SERVICE, fileCompareService);
        container.registerInstance(ServiceTokens.MULTI_FILE_COMPARE_SERVICE, multiFileCompareService);
        container.registerInstance(ServiceTokens.MULTI_FILE_COMPARE_WEBVIEW, multiFileCompareWebview);
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('End-to-End Multi-Way Comparison Workflow', () => {
        test('should perform complete three-way comparison workflow', async () => {
            // Step 1: Select three files for comparison
            fileCompareService.selectFile(mockFiles[0]);
            fileCompareService.selectFile(mockFiles[1]);
            fileCompareService.selectFile(mockFiles[2]);

            assert.strictEqual(fileCompareService.getSelectedFiles().length, 3);
            assert.strictEqual(fileCompareService.getCompareType(), 'three-way');
            assert.strictEqual(fileCompareService.canCompare(), true);

            // Step 2: Create multi-way comparison selection
            const selection: MultiCompareSelection = {
                files: fileCompareService.getSelectedFiles(),
                compareType: fileCompareService.getCompareType(),
                layout: multiFileCompareService.getRecommendedLayout(3),
                maxFiles: fileCompareService.getMaxFiles()
            };

            assert.strictEqual(selection.compareType, 'three-way');
            assert.strictEqual(selection.layout, 'horizontal');
            assert.strictEqual(selection.files.length, 3);

            // Step 3: Perform comparison
            const result = await multiFileCompareService.compareFiles(selection);

            assert.strictEqual(result.files.length, 3);
            assert.strictEqual(result.compareType, 'three-way');
            assert.strictEqual(result.layout, 'horizontal');
            assert.ok(result.totalLines > 0);
            assert.strictEqual(result.files[0].orgName, 'DevOrg');
            assert.strictEqual(result.files[1].orgName, 'TestOrg');
            assert.strictEqual(result.files[2].orgName, 'ProdOrg');

            // Step 4: Display in webview
            await multiFileCompareWebview.show(selection);

            // Verify webview was created
            assert.ok((vscode.window.createWebviewPanel as sinon.SinonStub).calledOnce);
        });

        test('should handle layout switching during comparison', async () => {
            fileCompareService.selectFile(mockFiles[0]);
            fileCompareService.selectFile(mockFiles[1]);
            fileCompareService.selectFile(mockFiles[2]);

            const horizontalSelection: MultiCompareSelection = {
                files: fileCompareService.getSelectedFiles(),
                compareType: 'three-way',
                layout: 'horizontal',
                maxFiles: 4
            };

            const horizontalResult = await multiFileCompareService.compareFiles(horizontalSelection);
            assert.strictEqual(horizontalResult.layout, 'horizontal');

            const gridSelection: MultiCompareSelection = {
                ...horizontalSelection,
                layout: 'grid'
            };

            const gridResult = await multiFileCompareService.compareFiles(gridSelection);
            assert.strictEqual(gridResult.layout, 'grid');
        });

        test('should provide accurate diff statistics for real content', async () => {
            fileCompareService.selectFile(mockFiles[0]);
            fileCompareService.selectFile(mockFiles[1]);
            fileCompareService.selectFile(mockFiles[2]);

            const selection: MultiCompareSelection = {
                files: fileCompareService.getSelectedFiles(),
                compareType: 'three-way',
                layout: 'horizontal',
                maxFiles: 4
            };

            const result = await multiFileCompareService.compareFiles(selection);

            // Verify statistics are reasonable
            assert.ok(result.totalLines > 0);
            assert.ok(result.addedLines >= 0);
            assert.ok(result.removedLines >= 0);
            assert.ok(result.modifiedLines >= 0);

            // Since we have different content, we should see some differences
            const hasDifferences = result.addedLines > 0 || 
                                 result.removedLines > 0 || 
                                 result.modifiedLines > 0;
            assert.ok(hasDifferences);
        });

        test('should handle file selection limits correctly', async () => {
            // Test max files enforcement
            fileCompareService.setMaxFiles(3);

            fileCompareService.selectFile(mockFiles[0]);
            fileCompareService.selectFile(mockFiles[1]); 
            fileCompareService.selectFile(mockFiles[2]);

            assert.strictEqual(fileCompareService.getSelectedFiles().length, 3);

            // Adding fourth file should replace first
            const file4 = { ...mockFiles[0], id: 'file4', name: 'File4.cls' };
            fileCompareService.selectFile(file4);

            const selected = fileCompareService.getSelectedFiles();
            assert.strictEqual(selected.length, 3);
            assert.strictEqual(selected[2].id, 'file4');
        });

        test('should provide correct comparison titles', () => {
            const twoFileTitle = multiFileCompareService.generateComparisonTitle([mockFiles[0], mockFiles[1]]);
            assert.strictEqual(twoFileTitle, 'AccountService.cls ↔ AccountService.cls');

            const threeFileTitle = multiFileCompareService.generateComparisonTitle(mockFiles);
            assert.strictEqual(threeFileTitle, 'AccountService.cls ↔ AccountService.cls ↔ AccountService.cls');

            const manyFilesTitle = multiFileCompareService.generateComparisonTitle([...mockFiles, mockFiles[0]]);
            assert.strictEqual(manyFilesTitle, 'Multi-way Comparison (4 files)');
        });

        test('should recommend appropriate layouts', () => {
            assert.strictEqual(multiFileCompareService.getRecommendedLayout(2), 'horizontal');
            assert.strictEqual(multiFileCompareService.getRecommendedLayout(3), 'horizontal');
            assert.strictEqual(multiFileCompareService.getRecommendedLayout(4), 'grid');
            assert.strictEqual(multiFileCompareService.getRecommendedLayout(6), 'grid');
        });
    });

    suite('Integration with Existing Two-Way Comparison', () => {
        test('should fallback to two-way comparison when requested', async () => {
            fileCompareService.selectFile(mockFiles[0]);
            fileCompareService.selectFile(mockFiles[1]);
            fileCompareService.selectFile(mockFiles[2]);

            // Mock user choosing "Compare First 2" option
            sandbox.stub(vscode.window, 'showInformationMessage').resolves({ title: 'Compare First 2' } as any);

            // This should trigger the two-way comparison path
            await fileCompareService.compareSelectedFiles();

            // Verify vscode.diff was called (two-way comparison)
            assert.ok((vscode.commands.executeCommand as sinon.SinonStub).calledWith('vscode.diff'));
        });

        test('should offer multi-way comparison when more than 2 files selected', async () => {
            fileCompareService.selectFile(mockFiles[0]);
            fileCompareService.selectFile(mockFiles[1]);
            fileCompareService.selectFile(mockFiles[2]);

            sandbox.stub(vscode.window, 'showInformationMessage').resolves({ title: 'Open Multi-Way View' } as any);

            await fileCompareService.compareSelectedFiles();

            // Should show the multi-way comparison prompt
            const call = (vscode.window.showInformationMessage as sinon.SinonStub).getCall(0);
            assert.ok(call.args[0].includes('three-way comparison'));
            assert.ok(call.args[0].includes('3 files'));
        });
    });

    suite('Error Handling and Edge Cases', () => {
        test('should handle org manager failures gracefully', async () => {
            mockEnhancedOrgManager.getFileContentById.rejects(new Error('Network timeout'));
            mockEnhancedOrgManager.getOrg.returns(undefined);

            fileCompareService.selectFile(mockFiles[0]);
            fileCompareService.selectFile(mockFiles[1]);

            const selection: MultiCompareSelection = {
                files: fileCompareService.getSelectedFiles(),
                compareType: 'two-way',
                layout: 'horizontal',
                maxFiles: 4
            };

            // Should not throw, but handle gracefully
            const result = await multiFileCompareService.compareFiles(selection);
            
            assert.strictEqual(result.files.length, 2);
            assert.ok(result.files.every(file => file.orgName === 'Unknown Org'));
        });

        test('should handle webview creation failures', async () => {
            (vscode.window.createWebviewPanel as sinon.SinonStub).throws(new Error('Webview failed'));

            fileCompareService.selectFile(mockFiles[0]);
            fileCompareService.selectFile(mockFiles[1]);

            const selection: MultiCompareSelection = {
                files: fileCompareService.getSelectedFiles(),
                compareType: 'two-way',
                layout: 'horizontal',
                maxFiles: 4
            };

            // Should not throw
            await assert.doesNotReject(async () => {
                await multiFileCompareWebview.show(selection);
            });
        });

        test('should validate file count limits', async () => {
            const tooManyFiles = Array(7).fill(0).map((_, i) => ({
                ...mockFiles[0],
                id: `file${i}`,
                name: `File${i}.cls`
            }));

            const selection: MultiCompareSelection = {
                files: tooManyFiles,
                compareType: 'multi-way',
                layout: 'grid',
                maxFiles: 7
            };

            await assert.rejects(
                () => multiFileCompareService.compareFiles(selection),
                /Cannot compare more than 6 files/
            );
        });

        test('should handle mixed local and remote files', async () => {
            const localFile = { ...mockFiles[0], filePath: '/local/file.cls' };
            const remoteFile = { ...mockFiles[1], filePath: undefined };

            fileCompareService.selectFile(localFile);
            fileCompareService.selectFile(remoteFile);

            const selection: MultiCompareSelection = {
                files: fileCompareService.getSelectedFiles(),
                compareType: 'two-way',
                layout: 'horizontal',
                maxFiles: 4
            };

            const result = await multiFileCompareService.compareFiles(selection);

            assert.strictEqual(result.files.length, 2);
            // Should succeed with mixed file sources
            assert.ok(result.totalLines > 0);
        });
    });

    suite('Performance and Scalability', () => {
        test('should handle maximum file comparison efficiently', async () => {
            const maxFiles = Array(6).fill(0).map((_, i) => ({
                ...mockFiles[0],
                id: `file${i}`,
                name: `File${i}.cls`,
                orgId: `org${i % 3 + 1}`
            }));

            const selection: MultiCompareSelection = {
                files: maxFiles,
                compareType: 'multi-way',
                layout: 'grid',
                maxFiles: 6
            };

            const startTime = Date.now();
            const result = await multiFileCompareService.compareFiles(selection);
            const duration = Date.now() - startTime;

            assert.strictEqual(result.files.length, 6);
            // Should complete within reasonable time (2 seconds)
            assert.ok(duration < 2000);
        });

        test('should handle large file content efficiently', async () => {
            const largeContent = 'public class LargeClass {\n' + 
                                '    // Line content\n'.repeat(1000) + 
                                '}';

            mockEnhancedOrgManager.getFileContentById.resolves(largeContent);

            const selection: MultiCompareSelection = {
                files: [mockFiles[0], mockFiles[1]],
                compareType: 'two-way',
                layout: 'horizontal',
                maxFiles: 4
            };

            const result = await multiFileCompareService.compareFiles(selection);

            assert.strictEqual(result.files.length, 2);
            assert.ok(result.totalLines > 2000); // Should handle large content
        });
    });
});
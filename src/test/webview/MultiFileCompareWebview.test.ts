import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { MultiFileCompareWebview } from '../../webview/MultiFileCompareWebview';
import { MultiFileCompareService, MultiCompareResult } from '../../services/MultiFileCompareService';
import { OrgFile, MultiCompareSelection } from '../../types';

suite('MultiFileCompareWebview Tests', () => {
    let webview: MultiFileCompareWebview;
    let mockMultiCompareService: sinon.SinonStubbedInstance<MultiFileCompareService>;
    let mockContext: sinon.SinonStubbedInstance<vscode.ExtensionContext>;
    let mockPanel: sinon.SinonStubbedInstance<vscode.WebviewPanel>;
    let mockWebview: sinon.SinonStubbedInstance<vscode.Webview>;
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

    const mockSelection: MultiCompareSelection = {
        files: [mockOrgFile1, mockOrgFile2],
        compareType: 'two-way',
        layout: 'horizontal',
        maxFiles: 4
    };

    const mockCompareResult: MultiCompareResult = {
        files: [
            {
                file: mockOrgFile1,
                orgName: 'Dev Org',
                lines: [
                    { lineNumber: 1, content: 'public class TestClass1 {', type: 'unchanged' },
                    { lineNumber: 2, content: '    // Method 1', type: 'modified' },
                    { lineNumber: 3, content: '}', type: 'unchanged' }
                ]
            },
            {
                file: mockOrgFile2,
                orgName: 'Test Org',
                lines: [
                    { lineNumber: 1, content: 'public class TestClass2 {', type: 'unchanged' },
                    { lineNumber: 2, content: '    // Method 2', type: 'modified' },
                    { lineNumber: 3, content: '}', type: 'unchanged' }
                ]
            }
        ],
        compareType: 'two-way',
        layout: 'horizontal',
        totalLines: 6,
        addedLines: 0,
        removedLines: 0,
        modifiedLines: 2
    };

    setup(() => {
        sandbox = sinon.createSandbox();
        
        // Mock ExtensionContext
        mockContext = {
            extensionPath: '/test/extension/path',
            subscriptions: []
        } as any;

        // Mock MultiFileCompareService
        mockMultiCompareService = sandbox.createStubInstance(MultiFileCompareService);
        mockMultiCompareService.generateComparisonTitle.returns('TestClass1.cls ↔ TestClass2.cls');
        mockMultiCompareService.compareFiles.resolves(mockCompareResult);

        // Mock Webview
        mockWebview = {
            html: '',
            onDidReceiveMessage: sandbox.stub(),
            postMessage: sandbox.stub()
        } as any;

        // Mock WebviewPanel
        mockPanel = {
            webview: mockWebview,
            title: '',
            reveal: sandbox.stub(),
            onDidDispose: sandbox.stub(),
            dispose: sandbox.stub()
        } as any;

        // Mock vscode.window.createWebviewPanel
        sandbox.stub(vscode.window, 'createWebviewPanel').returns(mockPanel as any);
        sandbox.stub(vscode.window, 'showInformationMessage');
        sandbox.stub(vscode.window, 'showErrorMessage');

        webview = new MultiFileCompareWebview(mockContext as any, mockMultiCompareService as any);
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('show method', () => {
        test('should create new webview panel when none exists', async () => {
            await webview.show(mockSelection);

            assert.ok((vscode.window.createWebviewPanel as sinon.SinonStub).calledOnce);
            assert.ok(mockMultiCompareService.generateComparisonTitle.calledWith(mockSelection.files));
            assert.ok(mockMultiCompareService.compareFiles.calledWith(mockSelection));
        });

        test('should reveal existing panel when available', async () => {
            // First call creates panel
            await webview.show(mockSelection);
            
            // Reset stubs
            (vscode.window.createWebviewPanel as sinon.SinonStub).resetHistory();
            mockMultiCompareService.compareFiles.resetHistory();

            // Second call should reveal existing
            await webview.show(mockSelection);

            assert.ok((vscode.window.createWebviewPanel as sinon.SinonStub).notCalled);
            assert.ok(mockPanel.reveal.calledOnce);
            assert.ok(mockMultiCompareService.compareFiles.calledWith(mockSelection));
        });

        test('should set webview panel properties correctly', async () => {
            await webview.show(mockSelection);

            const createCall = (vscode.window.createWebviewPanel as sinon.SinonStub).getCall(0);
            assert.strictEqual(createCall.args[0], 'multiFileCompare');
            assert.strictEqual(createCall.args[1], 'Multi-Compare: TestClass1.cls ↔ TestClass2.cls');
            assert.strictEqual(createCall.args[2], vscode.ViewColumn.One);
            
            const options = createCall.args[3];
            assert.strictEqual(options.enableScripts, true);
            assert.strictEqual(options.retainContextWhenHidden, true);
            assert.ok(Array.isArray(options.localResourceRoots));
        });

        test('should register onDidDispose handler', async () => {
            await webview.show(mockSelection);
            
            assert.ok(mockPanel.onDidDispose.calledOnce);
        });

        test('should register onDidReceiveMessage handler', async () => {
            await webview.show(mockSelection);
            
            assert.ok(mockWebview.onDidReceiveMessage.calledOnce);
        });
    });

    suite('HTML generation', () => {
        test('should generate loading HTML initially', async () => {
            await webview.show(mockSelection);

            // Check that HTML was set (loading state first)
            assert.ok(mockWebview.html.length > 0);
        });

        test('should generate comparison HTML after service completes', async () => {
            await webview.show(mockSelection);

            // Verify the final HTML contains comparison data
            assert.ok(mockWebview.html.includes('TWO-WAY Comparison'));
            assert.ok(mockWebview.html.includes('TestClass1.cls'));
            assert.ok(mockWebview.html.includes('TestClass2.cls'));
            assert.ok(mockWebview.html.includes('Dev Org'));
            assert.ok(mockWebview.html.includes('Test Org'));
        });

        test('should include correct statistics in HTML', async () => {
            await webview.show(mockSelection);

            assert.ok(mockWebview.html.includes('+0')); // addedLines
            assert.ok(mockWebview.html.includes('-0')); // removedLines 
            assert.ok(mockWebview.html.includes('~2')); // modifiedLines
            assert.ok(mockWebview.html.includes('6 lines')); // totalLines
        });

        test('should include layout controls in HTML', async () => {
            await webview.show(mockSelection);

            assert.ok(mockWebview.html.includes('layoutSelect'));
            assert.ok(mockWebview.html.includes('Horizontal'));
            assert.ok(mockWebview.html.includes('Vertical'));
            assert.ok(mockWebview.html.includes('Grid'));
        });

        test('should include JavaScript for interactions', async () => {
            await webview.show(mockSelection);

            assert.ok(mockWebview.html.includes('syncScroll'));
            assert.ok(mockWebview.html.includes('switchLayout'));
            assert.ok(mockWebview.html.includes('exportResults'));
            assert.ok(mockWebview.html.includes('acquireVsCodeApi'));
        });

        test('should properly escape HTML in code content', async () => {
            const resultWithSpecialChars: MultiCompareResult = {
                ...mockCompareResult,
                files: [
                    {
                        ...mockCompareResult.files[0],
                        lines: [
                            { lineNumber: 1, content: 'String html = "<div>Test</div>";', type: 'unchanged' }
                        ]
                    }
                ]
            };

            mockMultiCompareService.compareFiles.resolves(resultWithSpecialChars);

            await webview.show(mockSelection);

            // HTML should be escaped
            assert.ok(mockWebview.html.includes('&lt;div&gt;'));
            assert.ok(mockWebview.html.includes('&lt;/div&gt;'));
        });
    });

    suite('error handling', () => {
        test('should show error HTML when comparison fails', async () => {
            const error = new Error('Comparison failed');
            mockMultiCompareService.compareFiles.rejects(error);

            await webview.show(mockSelection);

            assert.ok(mockWebview.html.includes('❌ Comparison Failed'));
            assert.ok(mockWebview.html.includes('Comparison failed'));
        });

        test('should handle missing service gracefully', async () => {
            mockMultiCompareService.compareFiles.rejects(new Error('Service unavailable'));

            await webview.show(mockSelection);

            assert.ok(mockWebview.html.includes('❌ Comparison Failed'));
        });
    });

    suite('message handling', () => {
        test('should handle scroll sync messages', async () => {
            await webview.show(mockSelection);

            // Get the message handler
            const messageHandler = mockWebview.onDidReceiveMessage.getCall(0).args[0];
            
            // Test scroll message
            messageHandler({ command: 'scroll', scrollTop: 100 });

            assert.ok(mockWebview.postMessage.calledWith({
                command: 'syncScroll',
                scrollTop: 100
            }));
        });

        test('should handle export results messages', async () => {
            await webview.show(mockSelection);

            const messageHandler = mockWebview.onDidReceiveMessage.getCall(0).args[0];
            
            messageHandler({ command: 'exportResults', data: { timestamp: '2024-01-01' } });

            assert.ok((vscode.window.showInformationMessage as sinon.SinonStub).calledWith(
                'Export functionality will be implemented in a future update.'
            ));
        });

        test('should handle switch layout messages', async () => {
            await webview.show(mockSelection);

            const messageHandler = mockWebview.onDidReceiveMessage.getCall(0).args[0];
            
            messageHandler({ command: 'switchLayout', layout: 'vertical' });

            assert.ok((vscode.window.showInformationMessage as sinon.SinonStub).calledWith(
                'Layout switched to vertical. Full implementation coming soon.'
            ));
        });
    });

    suite('cleanup', () => {
        test('should clear panel reference on dispose', async () => {
            await webview.show(mockSelection);

            // Get the dispose handler
            const disposeHandler = mockPanel.onDidDispose.getCall(0).args[0];
            
            // Call dispose handler
            disposeHandler();

            // Panel should be cleared, so next show should create new panel
            (vscode.window.createWebviewPanel as sinon.SinonStub).resetHistory();
            await webview.show(mockSelection);

            assert.ok((vscode.window.createWebviewPanel as sinon.SinonStub).calledOnce);
        });
    });

    suite('different comparison types', () => {
        test('should handle three-way comparison correctly', async () => {
            const threeWaySelection: MultiCompareSelection = {
                files: [mockOrgFile1, mockOrgFile2, { ...mockOrgFile1, id: 'file3', name: 'TestClass3.cls' }],
                compareType: 'three-way',
                layout: 'horizontal',
                maxFiles: 4
            };

            const threeWayResult: MultiCompareResult = {
                ...mockCompareResult,
                files: [...mockCompareResult.files, {
                    file: { ...mockOrgFile1, id: 'file3', name: 'TestClass3.cls' },
                    orgName: 'Prod Org',
                    lines: [{ lineNumber: 1, content: 'public class TestClass3 {', type: 'unchanged' }]
                }],
                compareType: 'three-way'
            };

            mockMultiCompareService.compareFiles.resolves(threeWayResult);

            await webview.show(threeWaySelection);

            assert.ok(mockWebview.html.includes('THREE-WAY Comparison'));
            assert.ok(mockWebview.html.includes('--file-count: 3'));
        });

        test('should handle grid layout correctly', async () => {
            const gridSelection: MultiCompareSelection = {
                ...mockSelection,
                layout: 'grid'
            };

            const gridResult: MultiCompareResult = {
                ...mockCompareResult,
                layout: 'grid'
            };

            mockMultiCompareService.compareFiles.resolves(gridResult);

            await webview.show(gridSelection);

            assert.ok(mockWebview.html.includes('layout-grid'));
            assert.ok(mockWebview.html.includes('selected="selected"'));
        });
    });
});
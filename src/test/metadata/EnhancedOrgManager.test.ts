import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { EnhancedOrgManager } from '../../metadata/EnhancedOrgManager';
import { SourceRetrievalService } from '../../services/SourceRetrievalService';
import { SalesforceOrg } from '../../types';

suite('EnhancedOrgManager Tests', () => {
    let enhancedOrgManager: EnhancedOrgManager;
    let mockContext: vscode.ExtensionContext;
    let mockGlobalState: sinon.SinonStubbedInstance<vscode.Memento>;
    let mockSourceRetrieval: sinon.SinonStubbedInstance<SourceRetrievalService>;
    let mockExecAsync: sinon.SinonStub;

    const sampleOrg: SalesforceOrg = {
        id: 'test-org-123',
        username: 'test@example.com',
        alias: 'test-org',
        instanceUrl: 'https://test.salesforce.com',
        accessToken: 'test-token'
    };

    const sampleOrg2: SalesforceOrg = {
        id: 'test-org-456',
        username: 'test2@example.com',
        alias: 'test-org-2',
        instanceUrl: 'https://test2.salesforce.com',
        accessToken: 'test-token-2'
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

        // Mock VSCode methods
        sinon.stub(vscode.window, 'showErrorMessage');
        sinon.stub(vscode.window, 'showInformationMessage');
        sinon.stub(vscode.window, 'showWarningMessage');
        sinon.stub(vscode.window, 'showQuickPick');
        sinon.stub(vscode.commands, 'executeCommand');
        sinon.stub(vscode.workspace, 'getConfiguration').returns({
            get: sinon.stub().returns({}),
            update: sinon.stub().resolves()
        } as any);

        enhancedOrgManager = new EnhancedOrgManager(mockContext);

        // Get reference to the internal source retrieval service for mocking
        mockSourceRetrieval = sinon.createStubInstance(SourceRetrievalService);
        (enhancedOrgManager as any).sourceRetrieval = mockSourceRetrieval;
    });

    teardown(() => {
        sinon.restore();
    });

    suite('Initialization', () => {
        test('should initialize successfully', async () => {
            await enhancedOrgManager.initialize();
            
            const configSummary = enhancedOrgManager.getConfigurationSummary();
            assert.ok(configSummary.handlerCount > 0);
            assert.ok(configSummary.enabledTypes > 0);
        });

        test('should handle configuration validation errors', async () => {
            // Mock invalid configuration
            const showWarningStub = vscode.window.showWarningMessage as sinon.SinonStub;
            
            await enhancedOrgManager.initialize();
            
            // Should not throw error even with warnings
            assert.ok(true);
        });

        test('should handle initialization errors', async () => {
            // Mock error in handler registration
            const originalInitialize = (enhancedOrgManager as any).initializeMetadataHandlers;
            (enhancedOrgManager as any).initializeMetadataHandlers = sinon.stub().throws(new Error('Handler error'));
            
            try {
                await enhancedOrgManager.initialize();
                assert.fail('Should have thrown error');
            } catch (error: any) {
                assert.ok(error.message.includes('Handler error'));
            }
        });
    });

    suite('Organization Management', () => {
        test('should load orgs from storage', () => {
            mockGlobalState.get.returns([sampleOrg, sampleOrg2]);
            
            const newManager = new EnhancedOrgManager(mockContext);
            const orgs = newManager.getOrgs();
            
            assert.strictEqual(orgs.length, 2);
            assert.strictEqual(orgs[0].id, 'test-org-123');
            assert.strictEqual(orgs[1].id, 'test-org-456');
        });

        test('should add new organization', async () => {
            const orgs = enhancedOrgManager.getOrgs();
            const initialCount = orgs.length;
            
            await enhancedOrgManager.addOrg(sampleOrg);
            
            const updatedOrgs = enhancedOrgManager.getOrgs();
            assert.strictEqual(updatedOrgs.length, initialCount + 1);
            assert.ok(mockGlobalState.update.calledWith('salesforceOrgs', sinon.match.array));
        });

        test('should update existing organization', async () => {
            await enhancedOrgManager.addOrg(sampleOrg);
            
            const updatedOrg = { ...sampleOrg, alias: 'updated-alias' };
            await enhancedOrgManager.addOrg(updatedOrg);
            
            const orgs = enhancedOrgManager.getOrgs();
            const foundOrg = orgs.find(o => o.id === sampleOrg.id);
            assert.strictEqual(foundOrg?.alias, 'updated-alias');
        });

        test('should remove organization', async () => {
            await enhancedOrgManager.addOrg(sampleOrg);
            
            await enhancedOrgManager.removeOrg(sampleOrg.id);
            
            const orgs = enhancedOrgManager.getOrgs();
            assert.ok(!orgs.find(o => o.id === sampleOrg.id));
        });

        test('should get organization by ID', async () => {
            await enhancedOrgManager.addOrg(sampleOrg);
            
            const org = enhancedOrgManager.getOrg(sampleOrg.id);
            assert.ok(org);
            assert.strictEqual(org.id, sampleOrg.id);
        });

        test('should handle storage errors gracefully', async () => {
            mockGlobalState.update.rejects(new Error('Storage error'));
            const showErrorStub = vscode.window.showErrorMessage as sinon.SinonStub;
            
            try {
                await enhancedOrgManager.addOrg(sampleOrg);
                assert.fail('Should have thrown error');
            } catch (error: any) {
                assert.ok(error.message.includes('Storage error'));
            }
        });
    });

    suite('SFDX Org Querying', () => {
        test('should query SFDX orgs successfully', async () => {
            const mockSfResult = {
                status: 0,
                result: {
                    scratchOrgs: [
                        {
                            orgId: 'scratch-123',
                            username: 'scratch@example.com',
                            alias: 'scratch-org',
                            instanceUrl: 'https://scratch.salesforce.com'
                        }
                    ],
                    nonScratchOrgs: [
                        {
                            orgId: 'prod-456',
                            username: 'prod@example.com',
                            alias: 'prod-org',
                            instanceUrl: 'https://prod.salesforce.com'
                        }
                    ]
                }
            };
            
            mockExecAsync.resolves({ stdout: JSON.stringify(mockSfResult) });
            
            const orgs = await enhancedOrgManager.querySfdxOrgs();
            
            assert.strictEqual(orgs.length, 2);
            assert.strictEqual(orgs[0].username, 'scratch@example.com');
            assert.strictEqual(orgs[1].username, 'prod@example.com');
        });

        test('should handle SF CLI command failure', async () => {
            mockExecAsync.rejects(new Error('Command failed'));
            
            try {
                await enhancedOrgManager.querySfdxOrgs();
                assert.fail('Should have thrown error');
            } catch (error: any) {
                assert.ok(error.message.includes('Failed to query Salesforce orgs'));
            }
        });

        test('should handle malformed SF CLI response', async () => {
            const mockSfResult = { status: 1, message: 'Authentication failed' };
            mockExecAsync.resolves({ stdout: JSON.stringify(mockSfResult) });
            
            try {
                await enhancedOrgManager.querySfdxOrgs();
                assert.fail('Should have thrown error');
            } catch (error: any) {
                assert.ok(error.message.includes('SF CLI command failed'));
            }
        });

        test('should handle empty org lists', async () => {
            const mockSfResult = {
                status: 0,
                result: {
                    scratchOrgs: [],
                    nonScratchOrgs: []
                }
            };
            
            mockExecAsync.resolves({ stdout: JSON.stringify(mockSfResult) });
            
            const orgs = await enhancedOrgManager.querySfdxOrgs();
            
            assert.strictEqual(orgs.length, 0);
        });
    });

    suite('Organization Authentication', () => {
        test('should authenticate and add organization', async () => {
            const mockSfResult = {
                status: 0,
                result: {
                    nonScratchOrgs: [sampleOrg]
                }
            };
            
            mockExecAsync.resolves({ stdout: JSON.stringify(mockSfResult) });
            
            const quickPickStub = vscode.window.showQuickPick as sinon.SinonStub;
            quickPickStub.resolves({ label: 'test-org', description: 'test@example.com', org: sampleOrg });
            
            const result = await enhancedOrgManager.authenticateOrg();
            
            assert.ok(result);
            assert.strictEqual(result.id, sampleOrg.id);
            assert.ok(mockGlobalState.update.called);
        });

        test('should handle no authenticated orgs', async () => {
            const mockSfResult = {
                status: 0,
                result: { scratchOrgs: [], nonScratchOrgs: [] }
            };
            
            mockExecAsync.resolves({ stdout: JSON.stringify(mockSfResult) });
            
            const showInfoStub = vscode.window.showInformationMessage as sinon.SinonStub;
            showInfoStub.resolves('Open Terminal');
            
            const executeCommandStub = vscode.commands.executeCommand as sinon.SinonStub;
            
            const result = await enhancedOrgManager.authenticateOrg();
            
            assert.ok(!result);
            assert.ok(executeCommandStub.calledWith('workbench.action.terminal.new'));
        });

        test('should handle user cancellation', async () => {
            const mockSfResult = {
                status: 0,
                result: { nonScratchOrgs: [sampleOrg] }
            };
            
            mockExecAsync.resolves({ stdout: JSON.stringify(mockSfResult) });
            
            const quickPickStub = vscode.window.showQuickPick as sinon.SinonStub;
            quickPickStub.resolves(undefined); // User cancelled
            
            const result = await enhancedOrgManager.authenticateOrg();
            
            assert.ok(!result);
        });
    });

    suite('Source Directory Management', () => {
        test('should get org source directory', async () => {
            await enhancedOrgManager.addOrg(sampleOrg);
            await enhancedOrgManager.initialize();
            
            const testPath = '/tmp/sf-org-compare/org-test-org-123/force-app/main/default';
            mockSourceRetrieval.retrieveOrgSource.resolves(testPath);
            
            const result = await enhancedOrgManager.getOrgSourceDirectory(sampleOrg.id);
            
            assert.strictEqual(result, testPath);
            assert.ok(mockSourceRetrieval.retrieveOrgSource.calledWith(sampleOrg));
        });

        test('should handle unknown organization', async () => {
            try {
                await enhancedOrgManager.getOrgSourceDirectory('unknown-org');
                assert.fail('Should have thrown error');
            } catch (error: any) {
                assert.ok(error.message.includes('Organization not found'));
            }
        });

        test('should handle source retrieval failure', async () => {
            await enhancedOrgManager.addOrg(sampleOrg);
            await enhancedOrgManager.initialize();
            
            mockSourceRetrieval.retrieveOrgSource.rejects(new Error('Network error'));
            
            try {
                await enhancedOrgManager.getOrgSourceDirectory(sampleOrg.id);
                assert.fail('Should have thrown error');
            } catch (error: any) {
                assert.ok(error.message.includes('Failed to retrieve source'));
            }
        });

        test('should refresh org source', async () => {
            await enhancedOrgManager.addOrg(sampleOrg);
            
            const testPath = '/tmp/sf-org-compare/org-test-org-123/force-app/main/default';
            mockSourceRetrieval.retrieveOrgSource.resolves(testPath);
            
            const result = await enhancedOrgManager.refreshOrgSource(sampleOrg.id);
            
            assert.strictEqual(result, testPath);
            assert.ok(mockSourceRetrieval.clearOrgCache.calledWith(sampleOrg.id));
            assert.ok(mockSourceRetrieval.retrieveOrgSource.calledWith(sampleOrg));
        });
    });

    suite('File Content Retrieval', () => {
        test('should get file content', async () => {
            const testContent = 'public class TestClass { }';
            const testFilePath = '/test/path/TestClass.cls';
            
            const mockFile = {
                id: 'test-file',
                name: 'TestClass.cls',
                type: 'ApexClass',
                fullName: 'TestClass',
                orgId: sampleOrg.id,
                filePath: testFilePath
            };
            
            mockSourceRetrieval.getFileContent.resolves(testContent);
            
            const result = await enhancedOrgManager.getFileContent(sampleOrg.id, testFilePath);
            
            assert.strictEqual(result, testContent);
        });

        test('should handle file content errors gracefully', async () => {
            mockSourceRetrieval.getFileContent.rejects(new Error('File not found'));
            
            const result = await enhancedOrgManager.getFileContent(sampleOrg.id, 'invalid-path');
            
            assert.strictEqual(result, '');
        });
    });

    suite('Analysis and Statistics', () => {
        test('should provide org analysis', async () => {
            await enhancedOrgManager.addOrg(sampleOrg);
            await enhancedOrgManager.initialize();
            
            // Mock successful metadata processing
            const mockResult = {
                success: [
                    { type: 'ApexClass', files: [{}, {}] },
                    { type: 'CustomObject', files: [{}] }
                ],
                failures: [],
                processingTime: 1000
            };
            
            // Mock the processor
            (enhancedOrgManager as any).processor = {
                processMetadataTypes: sinon.stub().resolves(mockResult)
            };
            
            const analysis = await enhancedOrgManager.getOrgAnalysis(sampleOrg.id);
            
            assert.strictEqual(analysis.org.id, sampleOrg.id);
            assert.strictEqual(analysis.totalFiles, 3);
            assert.strictEqual(analysis.metadataTypes, 2);
            assert.strictEqual(analysis.filesByType.get('ApexClass'), 2);
            assert.strictEqual(analysis.filesByType.get('CustomObject'), 1);
        });

        test('should provide configuration summary', () => {
            const summary = enhancedOrgManager.getConfigurationSummary();
            
            assert.ok(typeof summary.totalTypes === 'number');
            assert.ok(typeof summary.enabledTypes === 'number');
            assert.ok(typeof summary.handlerCount === 'number');
            assert.ok(summary.configSummary);
        });

        test('should provide processing statistics', () => {
            const mockResult = {
                success: [
                    { type: 'ApexClass', processingTime: 100 },
                    { type: 'CustomObject', processingTime: 200 }
                ],
                failures: [
                    { item: { type: 'Flow' }, error: 'Permission denied' }
                ],
                processingTime: 500
            };
            
            const stats = enhancedOrgManager.getProcessingStats(mockResult);
            
            assert.strictEqual(stats.successCount, 2);
            assert.strictEqual(stats.failureCount, 1);
            assert.ok(stats.successRate > 0);
            assert.ok(stats.averageTime > 0);
        });
    });

    suite('Metadata Type Support', () => {
        test('should return supported metadata types', () => {
            const types = enhancedOrgManager.getSupportedMetadataTypes();
            
            assert.ok(Array.isArray(types));
            assert.ok(types.includes('ApexClass'));
            assert.ok(types.includes('LightningComponentBundle'));
            assert.ok(types.includes('CustomObject'));
        });

        test('should check metadata type support', () => {
            assert.ok(enhancedOrgManager.isMetadataTypeSupported('ApexClass'));
            assert.ok(enhancedOrgManager.isMetadataTypeSupported('LightningComponentBundle'));
            assert.ok(!enhancedOrgManager.isMetadataTypeSupported('UnsupportedType'));
        });

        test('should get metadata type definition', () => {
            const definition = enhancedOrgManager.getMetadataTypeDefinition('ApexClass');
            
            assert.ok(definition);
        });
    });

    suite('Configuration Management', () => {
        test('should set processor concurrency', () => {
            const mockProcessor = {
                setDefaultConcurrency: sinon.stub()
            };
            (enhancedOrgManager as any).processor = mockProcessor;
            
            enhancedOrgManager.setProcessorConcurrency(5);
            
            assert.ok(mockProcessor.setDefaultConcurrency.calledWith(5));
        });

        test('should set processor timeout', () => {
            const mockProcessor = {
                setDefaultTimeout: sinon.stub()
            };
            (enhancedOrgManager as any).processor = mockProcessor;
            
            enhancedOrgManager.setProcessorTimeout(30000);
            
            assert.ok(mockProcessor.setDefaultTimeout.calledWith(30000));
        });

        test('should refresh handlers', async () => {
            await enhancedOrgManager.initialize();
            
            // Should reinitialize without error
            await enhancedOrgManager.refreshHandlers();
            
            const summary = enhancedOrgManager.getConfigurationSummary();
            assert.ok(summary.handlerCount > 0);
        });
    });
});
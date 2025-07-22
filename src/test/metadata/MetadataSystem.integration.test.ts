import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { MetadataRegistry } from '../../metadata/MetadataRegistry';
import { ParallelProcessor } from '../../metadata/ParallelProcessor';
import { MetadataConfiguration } from '../../metadata/MetadataConfiguration';
import { EnhancedOrgManager } from '../../metadata/EnhancedOrgManager';
import { ApexHandler } from '../../metadata/handlers/ApexHandler';
import { CustomObjectHandler } from '../../metadata/handlers/CustomObjectHandler';
import { LwcHandler } from '../../metadata/handlers/LwcHandler';
import { AuraHandler } from '../../metadata/handlers/AuraHandler';
import { GeneralMetadataHandler } from '../../metadata/handlers/GeneralMetadataHandler';
import { SalesforceOrg, MetadataQueryOptions } from '../../types';

suite('Metadata System Integration Tests', () => {
    let mockContext: vscode.ExtensionContext;
    let mockGlobalState: sinon.SinonStubbedInstance<vscode.Memento>;
    let mockExecAsync: sinon.SinonStub;
    let registry: MetadataRegistry;
    let processor: ParallelProcessor;
    let configuration: MetadataConfiguration;
    let enhancedOrgManager: EnhancedOrgManager;

    // Test data
    const sampleOrg: SalesforceOrg = {
        id: 'test-org-id',
        username: 'test@example.com',
        alias: 'test-org',
        instanceUrl: 'https://test.salesforce.com',
        accessToken: 'test-token'
    };

    const mockApexClassResponse = {
        status: 0,
        result: [
            { fullName: 'AccountController' },
            { fullName: 'ContactController' }
        ]
    };

    const mockCustomObjectResponse = {
        status: 0,
        result: [
            { fullName: 'CustomObject__c' },
            { fullName: 'AnotherObject__c' }
        ]
    };

    const mockLwcResponse = {
        status: 0,
        result: [
            { fullName: 'testComponent' },
            { fullName: 'anotherComponent' }
        ]
    };

    const mockApexContent = {
        status: 0,
        result: {
            records: [{
                Id: '01p000000000001',
                Name: 'AccountController',
                Body: 'public class AccountController { }',
                ApiVersion: '58.0',
                Status: 'Active',
                IsValid: true
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

        // Mock VSCode methods
        sinon.stub(vscode.window, 'showErrorMessage');
        sinon.stub(vscode.window, 'showInformationMessage');
        sinon.stub(vscode.window, 'showWarningMessage');
        sinon.stub(vscode.workspace, 'getConfiguration').returns({
            get: sinon.stub().returns({}),
            update: sinon.stub().resolves()
        } as any);

        // Create fresh instances for each test
        registry = MetadataRegistry.getInstance();
        registry.clear(); // Clear for testing
        processor = new ParallelProcessor(registry);
        configuration = MetadataConfiguration.getInstance();
        enhancedOrgManager = new EnhancedOrgManager(mockContext);
    });

    teardown(() => {
        sinon.restore();
    });

    suite('Metadata Registry Tests', () => {
        test('should initialize with default metadata type definitions', () => {
            const supportedTypes = registry.getSupportedTypes();
            
            assert.ok(supportedTypes.includes('ApexClass'));
            assert.ok(supportedTypes.includes('ApexTrigger'));
            assert.ok(supportedTypes.includes('CustomObject'));
            assert.ok(supportedTypes.includes('LightningComponentBundle'));
            assert.ok(supportedTypes.includes('AuraDefinitionBundle'));
            assert.ok(supportedTypes.includes('PermissionSet'));
            assert.ok(supportedTypes.includes('Profile'));
            assert.ok(supportedTypes.includes('CustomLabels'));
            assert.ok(supportedTypes.includes('Flow'));
            assert.ok(supportedTypes.includes('Layout'));
        });

        test('should register and retrieve metadata handlers', () => {
            const apexHandler = new ApexHandler(configuration.getHandlerConfig('ApexClass'));
            registry.registerHandler('ApexClass', apexHandler);

            const retrievedHandler = registry.getHandler('ApexClass');
            assert.strictEqual(retrievedHandler, apexHandler);
        });

        test('should support bundle and non-bundle metadata types', () => {
            const bundleTypes = registry.getBundleTypes();
            const nonBundleTypes = registry.getSupportedTypes().filter(type => !bundleTypes.includes(type));

            assert.ok(bundleTypes.includes('LightningComponentBundle'));
            assert.ok(bundleTypes.includes('AuraDefinitionBundle'));
            assert.ok(nonBundleTypes.includes('ApexClass'));
            assert.ok(nonBundleTypes.includes('CustomObject'));
        });

        test('should retrieve metadata types by retrieval strategy', () => {
            const toolingTypes = registry.getTypesByStrategy('tooling');
            const retrieveTypes = registry.getTypesByStrategy('retrieve');

            assert.ok(toolingTypes.includes('ApexClass'));
            assert.ok(toolingTypes.includes('ApexTrigger'));
            assert.ok(retrieveTypes.includes('CustomObject'));
            assert.ok(retrieveTypes.includes('LightningComponentBundle'));
        });
    });

    suite('Parallel Processor Tests', () => {
        test('should process multiple metadata types in parallel', async () => {
            // Register mock handlers
            const apexHandler = new ApexHandler(configuration.getHandlerConfig('ApexClass'));
            const objectHandler = new CustomObjectHandler(configuration.getHandlerConfig('CustomObject'));
            
            registry.registerHandler('ApexClass', apexHandler);
            registry.registerHandler('CustomObject', objectHandler);

            // Mock SF CLI responses
            mockExecAsync.withArgs(sinon.match(/ApexClass/)).resolves({
                stdout: JSON.stringify(mockApexClassResponse)
            });
            mockExecAsync.withArgs(sinon.match(/CustomObject/)).resolves({
                stdout: JSON.stringify(mockCustomObjectResponse)
            });

            const options: MetadataQueryOptions = {
                orgId: 'test-org',
                metadataTypes: ['ApexClass', 'CustomObject'],
                parallel: true,
                maxConcurrency: 2
            };

            const result = await processor.processMetadataTypes('test-org', 'test@example.com', options);

            assert.strictEqual(result.success.length, 2);
            assert.strictEqual(result.failures.length, 0);
            assert.ok(result.processingTime > 0);

            // Verify results contain expected data
            const apexResult = result.success.find(r => r.type === 'ApexClass');
            const objectResult = result.success.find(r => r.type === 'CustomObject');

            assert.ok(apexResult);
            assert.ok(objectResult);
            assert.strictEqual(apexResult.files.length, 2);
            assert.strictEqual(objectResult.files.length, 2);
        });

        test('should handle failures gracefully in parallel processing', async () => {
            // Register handler that will fail
            const apexHandler = new ApexHandler(configuration.getHandlerConfig('ApexClass'));
            registry.registerHandler('ApexClass', apexHandler);

            // Mock SF CLI to fail
            mockExecAsync.rejects(new Error('SF CLI error'));

            const options: MetadataQueryOptions = {
                orgId: 'test-org',
                metadataTypes: ['ApexClass'],
                parallel: true,
                maxConcurrency: 1
            };

            const result = await processor.processMetadataTypes('test-org', 'test@example.com', options);

            assert.strictEqual(result.success.length, 0);
            assert.strictEqual(result.failures.length, 1);
            assert.ok(result.failures[0].error.includes('SF CLI error'));
        });

        test('should respect concurrency limits', async () => {
            const apexHandler = new ApexHandler(configuration.getHandlerConfig('ApexClass'));
            registry.registerHandler('ApexClass', apexHandler);

            // Mock delayed responses
            const delayedResponse = (delay: number) => new Promise(resolve => {
                setTimeout(() => {
                    resolve({ stdout: JSON.stringify(mockApexClassResponse) });
                }, delay);
            });

            mockExecAsync.returns(delayedResponse(100));

            const options: MetadataQueryOptions = {
                orgId: 'test-org',
                metadataTypes: ['ApexClass', 'ApexClass', 'ApexClass'], // Multiple same type
                parallel: true,
                maxConcurrency: 2
            };

            const startTime = Date.now();
            const result = await processor.processMetadataTypes('test-org', 'test@example.com', options);
            const endTime = Date.now();

            // With concurrency limit of 2, processing 3 items should take at least 200ms
            assert.ok(endTime - startTime >= 200);
            assert.strictEqual(result.success.length, 3);
        });
    });

    suite('Handler Integration Tests', () => {
        test('should handle Apex classes and triggers', async () => {
            const apexHandler = new ApexHandler(configuration.getHandlerConfig('ApexClass'));
            registry.registerHandler('ApexClass', apexHandler);
            registry.registerHandler('ApexTrigger', apexHandler);

            mockExecAsync.withArgs(sinon.match(/ApexClass/)).resolves({
                stdout: JSON.stringify(mockApexClassResponse)
            });
            mockExecAsync.withArgs(sinon.match(/ApexTrigger/)).resolves({
                stdout: JSON.stringify({ status: 0, result: [{ fullName: 'TestTrigger' }] })
            });

            const classFiles = await apexHandler.getFiles('test-org', 'test@example.com');
            assert.strictEqual(classFiles.length, 2);
            assert.ok(classFiles.every(f => f.type === 'ApexClass'));
            assert.ok(classFiles.every(f => f.name.endsWith('.cls')));
        });

        test('should handle LWC bundles', async () => {
            const lwcHandler = new LwcHandler(configuration.getHandlerConfig('LightningComponentBundle'));
            registry.registerHandler('LightningComponentBundle', lwcHandler);

            mockExecAsync.withArgs(sinon.match(/LightningComponentBundle/)).resolves({
                stdout: JSON.stringify(mockLwcResponse)
            });

            const lwcFiles = await lwcHandler.getFiles('test-org', 'test@example.com');
            assert.strictEqual(lwcFiles.length, 2);
            assert.ok(lwcFiles.every(f => f.type === 'LightningComponentBundle'));
            assert.ok(lwcFiles.every(f => !f.name.includes('.')));
        });

        test('should handle Aura components', async () => {
            const auraHandler = new AuraHandler(configuration.getHandlerConfig('AuraDefinitionBundle'));
            registry.registerHandler('AuraDefinitionBundle', auraHandler);

            mockExecAsync.withArgs(sinon.match(/AuraDefinitionBundle/)).resolves({
                stdout: JSON.stringify({ status: 0, result: [{ fullName: 'TestComponent' }] })
            });

            const auraFiles = await auraHandler.getFiles('test-org', 'test@example.com');
            assert.strictEqual(auraFiles.length, 1);
            assert.strictEqual(auraFiles[0].type, 'AuraDefinitionBundle');
            assert.strictEqual(auraFiles[0].name, 'TestComponent');
        });

        test('should handle general metadata types', async () => {
            const generalHandlers = GeneralMetadataHandler.createHandlers(configuration.getHandlerConfig('PermissionSet'));
            const permissionSetHandler = generalHandlers.get('PermissionSet');
            
            assert.ok(permissionSetHandler);
            registry.registerHandler('PermissionSet', permissionSetHandler);

            mockExecAsync.withArgs(sinon.match(/PermissionSet/)).resolves({
                stdout: JSON.stringify({ status: 0, result: [{ fullName: 'TestPermissionSet' }] })
            });

            const permissionSetFiles = await permissionSetHandler.getFiles('test-org', 'test@example.com');
            assert.strictEqual(permissionSetFiles.length, 1);
            assert.strictEqual(permissionSetFiles[0].type, 'PermissionSet');
            assert.ok(permissionSetFiles[0].name.endsWith('.permissionset-meta.xml'));
        });
    });

    suite('Configuration System Tests', () => {
        test('should provide default configuration for metadata types', () => {
            const apexConfig = configuration.getConfiguration('ApexClass');
            assert.ok(apexConfig);
            assert.strictEqual(apexConfig.enabled, true);
            assert.strictEqual(apexConfig.priority, 'high');
            assert.strictEqual(apexConfig.parallel, true);
        });

        test('should allow enabling and disabling metadata types', () => {
            configuration.disableType('ApexClass');
            let apexConfig = configuration.getConfiguration('ApexClass');
            assert.strictEqual(apexConfig?.enabled, false);

            configuration.enableType('ApexClass');
            apexConfig = configuration.getConfiguration('ApexClass');
            assert.strictEqual(apexConfig?.enabled, true);
        });

        test('should return enabled metadata types', () => {
            const enabledTypes = configuration.getEnabledTypes();
            assert.ok(enabledTypes.includes('ApexClass'));
            assert.ok(enabledTypes.includes('CustomObject'));
            assert.ok(enabledTypes.includes('LightningComponentBundle'));
        });

        test('should validate configuration', () => {
            // Create invalid configuration
            configuration.setConfiguration('TestType', {
                enabled: true,
                priority: 'high',
                parallel: true,
                maxConcurrency: -1, // Invalid
                timeout: 500 // Invalid (too low)
            });

            const errors = configuration.validateConfiguration();
            assert.ok(errors.length > 0);
            assert.ok(errors.some(e => e.error.includes('Max concurrency')));
            assert.ok(errors.some(e => e.error.includes('Timeout')));
        });
    });

    suite('Enhanced Org Manager Integration Tests', () => {
        test('should initialize with all metadata handlers', async () => {
            mockGlobalState.get.returns([sampleOrg]);
            
            await enhancedOrgManager.initialize();
            
            const configSummary = enhancedOrgManager.getConfigurationSummary();
            assert.ok(configSummary.handlerCount > 0);
            assert.ok(configSummary.enabledTypes > 0);
        });

        test('should retrieve files using enhanced metadata system', async () => {
            mockGlobalState.get.returns([sampleOrg]);
            await enhancedOrgManager.initialize();

            // Mock various metadata type responses
            mockExecAsync.withArgs(sinon.match(/ApexClass/)).resolves({
                stdout: JSON.stringify(mockApexClassResponse)
            });
            mockExecAsync.withArgs(sinon.match(/CustomObject/)).resolves({
                stdout: JSON.stringify(mockCustomObjectResponse)
            });

            const sourceDirectory = await enhancedOrgManager.getOrgSourceDirectory('test-org-id');
            
            assert.ok(typeof sourceDirectory === 'string');
            assert.ok(sourceDirectory.length > 0);
        });

        test('should retrieve file content using appropriate handlers', async () => {
            mockGlobalState.get.returns([sampleOrg]);
            await enhancedOrgManager.initialize();

            // Mock file listing
            mockExecAsync.withArgs(sinon.match(/ApexClass/)).resolves({
                stdout: JSON.stringify(mockApexClassResponse)
            });

            // Mock content retrieval
            mockExecAsync.withArgs(sinon.match(/SELECT.*FROM ApexClass/)).resolves({
                stdout: JSON.stringify(mockApexContent)
            });

            const content = await enhancedOrgManager.getFileContent('test-org-id', 'apexclass-AccountController');
            
            assert.ok(content.includes('AccountController'));
            assert.ok(content.includes('API Version: 58.0'));
            assert.ok(content.includes('public class AccountController'));
        });

        test('should provide comprehensive org analysis', async () => {
            mockGlobalState.get.returns([sampleOrg]);
            await enhancedOrgManager.initialize();

            mockExecAsync.withArgs(sinon.match(/ApexClass/)).resolves({
                stdout: JSON.stringify(mockApexClassResponse)
            });
            mockExecAsync.withArgs(sinon.match(/CustomObject/)).resolves({
                stdout: JSON.stringify(mockCustomObjectResponse)
            });

            const analysis = await enhancedOrgManager.getOrgAnalysis('test-org-id');
            
            assert.strictEqual(analysis.org.id, 'test-org-id');
            assert.ok(analysis.totalFiles > 0);
            assert.ok(analysis.metadataTypes > 0);
            assert.ok(analysis.filesByType.size > 0);
            assert.ok(analysis.retrievalStats.success.length > 0);
        });
    });

    suite('End-to-End Workflow Tests', () => {
        test('should complete full metadata retrieval workflow', async () => {
            mockGlobalState.get.returns([sampleOrg]);
            await enhancedOrgManager.initialize();

            // Mock all required SF CLI calls
            mockExecAsync.withArgs(sinon.match(/ApexClass/)).resolves({
                stdout: JSON.stringify(mockApexClassResponse)
            });
            mockExecAsync.withArgs(sinon.match(/LightningComponentBundle/)).resolves({
                stdout: JSON.stringify(mockLwcResponse)
            });
            mockExecAsync.withArgs(sinon.match(/SELECT.*FROM ApexClass/)).resolves({
                stdout: JSON.stringify(mockApexContent)
            });

            // 1. Get source directory
            const sourceDirectory = await enhancedOrgManager.getOrgSourceDirectory('test-org-id');
            assert.ok(typeof sourceDirectory === 'string');
            assert.ok(sourceDirectory.length > 0);

            // 2. Get specific file content (using mock file path)
            const mockFilePath = '/test/file/path.cls';
            const fileContent = await enhancedOrgManager.getFileContent('test-org-id', mockFilePath);
            assert.ok(fileContent.includes('AccountController'));

            // 3. Get analysis
            const analysis = await enhancedOrgManager.getOrgAnalysis('test-org-id');
            assert.ok(analysis.totalFiles > 0);
        });

        test('should handle mixed success and failure scenarios', async () => {
            mockGlobalState.get.returns([sampleOrg]);
            await enhancedOrgManager.initialize();

            // Mock mixed responses - some succeed, some fail
            mockExecAsync.withArgs(sinon.match(/ApexClass/)).resolves({
                stdout: JSON.stringify(mockApexClassResponse)
            });
            mockExecAsync.withArgs(sinon.match(/CustomObject/)).rejects(new Error('Permission denied'));

            const sourceDirectory = await enhancedOrgManager.getOrgSourceDirectory('test-org-id');
            
            // Should return a valid source directory path
            assert.ok(typeof sourceDirectory === 'string');
            assert.ok(sourceDirectory.length > 0);
        });
    });

    suite('Performance Tests', () => {
        test('should process large number of metadata types efficiently', async () => {
            const largeMetadataResponse = {
                status: 0,
                result: Array.from({ length: 100 }, (_, i) => ({ fullName: `Item${i}` }))
            };

            const apexHandler = new ApexHandler(configuration.getHandlerConfig('ApexClass'));
            registry.registerHandler('ApexClass', apexHandler);

            mockExecAsync.resolves({
                stdout: JSON.stringify(largeMetadataResponse)
            });

            const startTime = Date.now();
            const files = await apexHandler.getFiles('test-org', 'test@example.com');
            const endTime = Date.now();

            assert.strictEqual(files.length, 100);
            assert.ok(endTime - startTime < 1000); // Should complete within 1 second
        });

        test('should handle concurrent metadata retrievals', async () => {
            const handlers = GeneralMetadataHandler.createHandlers(configuration.getHandlerConfig('PermissionSet'));
            
            for (const [type, handler] of handlers) {
                registry.registerHandler(type, handler);
            }

            mockExecAsync.resolves({
                stdout: JSON.stringify({ status: 0, result: [{ fullName: 'TestItem' }] })
            });

            const options: MetadataQueryOptions = {
                orgId: 'test-org',
                metadataTypes: Array.from(handlers.keys()),
                parallel: true,
                maxConcurrency: 5
            };

            const startTime = Date.now();
            const result = await processor.processMetadataTypes('test-org', 'test@example.com', options);
            const endTime = Date.now();

            assert.ok(result.success.length > 0);
            assert.ok(endTime - startTime < 5000); // Should complete within 5 seconds
        });
    });
});
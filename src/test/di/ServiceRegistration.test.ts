import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { Container, ServiceTokens } from '../../di/Container';
import { registerServices, ServiceFactory, initializeContainer } from '../../di/ServiceRegistration';
import { EnhancedOrgManager } from '../../metadata/EnhancedOrgManager';
import { FileCompareService } from '../../services/FileCompareService';
import { SfOrgCompareProvider } from '../../providers/SfOrgCompareProvider';

suite('Service Registration Test Suite', () => {
    let container: Container;
    let mockContext: vscode.ExtensionContext;

    setup(() => {
        mockContext = {
            subscriptions: [],
            workspaceState: {
                get: sinon.stub().returns(undefined),
                update: sinon.stub().resolves(),
                keys: sinon.stub().returns([])
            } as any,
            globalState: {
                get: sinon.stub().returns([]),
                update: sinon.stub().resolves(),
                keys: sinon.stub().returns([])
            } as any,
            extensionUri: {} as any,
            extensionPath: '/test/path',
            storageUri: {} as any,
            storagePath: '/test/storage',
            globalStorageUri: {} as any,
            globalStoragePath: '/test/global-storage',
            logUri: {} as any,
            logPath: '/test/log',
            extensionMode: vscode.ExtensionMode.Test,
            secrets: {} as any,
            environmentVariableCollection: {} as any,
            asAbsolutePath: sinon.stub().returns('/test/absolute'),
            extension: {} as any,
            languageModelAccessInformation: {} as any
        };
        container = new Container(mockContext);
    });

    teardown(() => {
        container.clear();
        sinon.restore();
    });

    suite('registerServices', () => {
        test('should register all core services', () => {
            registerServices(container);

            // Check that all expected services are registered
            const expectedServices = [
                ServiceTokens.CONFIGURATION_MANAGER,
                ServiceTokens.ERROR_HANDLER,
                ServiceTokens.SECURE_COMMAND_EXECUTOR,
                ServiceTokens.METADATA_REGISTRY,
                ServiceTokens.METADATA_CONFIGURATION,
                ServiceTokens.PARALLEL_PROCESSOR,
                ServiceTokens.SOURCE_RETRIEVAL_SERVICE,
                ServiceTokens.ENHANCED_ORG_MANAGER,
                ServiceTokens.FILE_COMPARE_SERVICE,
                ServiceTokens.SF_ORG_COMPARE_PROVIDER
            ];

            for (const service of expectedServices) {
                assert.ok(container.isRegistered(service), `Service ${service} should be registered`);
            }
        });

        test('should register singleton services properly', () => {
            registerServices(container);

            // Test that singleton services return the same instance
            const configManager1 = container.resolve(ServiceTokens.CONFIGURATION_MANAGER);
            const configManager2 = container.resolve(ServiceTokens.CONFIGURATION_MANAGER);
            
            assert.strictEqual(configManager1, configManager2, 'Configuration manager should be singleton');
        });

        test('should resolve services with proper dependencies', () => {
            registerServices(container);

            // Test that services with dependencies can be resolved
            const orgManager = container.resolve<EnhancedOrgManager>(ServiceTokens.ENHANCED_ORG_MANAGER);
            assert.ok(orgManager instanceof EnhancedOrgManager);

            const fileCompareService = container.resolve<FileCompareService>(ServiceTokens.FILE_COMPARE_SERVICE);
            assert.ok(fileCompareService instanceof FileCompareService);

            const provider = container.resolve<SfOrgCompareProvider>(ServiceTokens.SF_ORG_COMPARE_PROVIDER);
            assert.ok(provider instanceof SfOrgCompareProvider);
        });
    });

    suite('ServiceFactory', () => {
        let serviceFactory: ServiceFactory;

        setup(() => {
            registerServices(container);
            serviceFactory = new ServiceFactory(container);
        });

        test('should create enhanced org manager with initialization', async () => {
            // Mock the initialize method to avoid real initialization
            const mockOrgManager = container.resolve<EnhancedOrgManager>(ServiceTokens.ENHANCED_ORG_MANAGER);
            const initializeStub = sinon.stub(mockOrgManager, 'initialize').resolves();
            const configSummaryStub = sinon.stub(mockOrgManager, 'getConfigurationSummary').returns({
                enabledTypes: 5,
                handlerCount: 10,
                totalTypes: 20,
                configSummary: {}
            });

            const orgManager = await serviceFactory.createEnhancedOrgManager();
            
            assert.ok(initializeStub.calledOnce);
            assert.ok(configSummaryStub.calledOnce);
            assert.strictEqual(orgManager, mockOrgManager);
        });

        test('should handle enhanced org manager initialization failure', async () => {
            const mockOrgManager = container.resolve<EnhancedOrgManager>(ServiceTokens.ENHANCED_ORG_MANAGER);
            const initializeStub = sinon.stub(mockOrgManager, 'initialize').rejects(new Error('Init failed'));

            try {
                await serviceFactory.createEnhancedOrgManager();
                assert.fail('Should have thrown error');
            } catch (error) {
                assert.strictEqual((error as Error).message, 'Init failed');
            }

            assert.ok(initializeStub.calledOnce);
        });

        test('should create file compare service with cleanup', async () => {
            const cleanupStub = sinon.stub(FileCompareService, 'cleanupOldSessions').resolves();

            const fileCompareService = await serviceFactory.createFileCompareService();
            
            assert.ok(fileCompareService instanceof FileCompareService);
            assert.ok(cleanupStub.calledOnce);
            
            cleanupStub.restore();
        });

        test('should handle file compare service cleanup failure', async () => {
            const cleanupStub = sinon.stub(FileCompareService, 'cleanupOldSessions').rejects(new Error('Cleanup failed'));
            const consoleWarnStub = sinon.stub(console, 'warn');

            const fileCompareService = await serviceFactory.createFileCompareService();
            
            assert.ok(fileCompareService instanceof FileCompareService);
            assert.ok(cleanupStub.calledOnce);
            assert.ok(consoleWarnStub.calledOnce);
            
            cleanupStub.restore();
            consoleWarnStub.restore();
        });

        test('should create sf org compare provider', () => {
            const provider = serviceFactory.createSfOrgCompareProvider();
            
            assert.ok(provider instanceof SfOrgCompareProvider);
        });

        test('should create all core services together', async () => {
            // Mock dependencies to avoid real initialization
            const mockOrgManager = container.resolve<EnhancedOrgManager>(ServiceTokens.ENHANCED_ORG_MANAGER);
            sinon.stub(mockOrgManager, 'initialize').resolves();
            sinon.stub(mockOrgManager, 'getConfigurationSummary').returns({
                enabledTypes: 5,
                handlerCount: 10,
                totalTypes: 20,
                configSummary: {}
            });
            
            const cleanupStub = sinon.stub(FileCompareService, 'cleanupOldSessions').resolves();

            const coreServices = await serviceFactory.createCoreServices();
            
            assert.ok(coreServices.enhancedOrgManager instanceof EnhancedOrgManager);
            assert.ok(coreServices.fileCompareService instanceof FileCompareService);
            assert.ok(coreServices.sfOrgCompareProvider instanceof SfOrgCompareProvider);
            
            cleanupStub.restore();
        });
    });

    suite('initializeContainer', () => {
        test('should initialize container with all services', () => {
            const consoleLogStub = sinon.stub(console, 'log');
            
            const result = initializeContainer(mockContext);
            
            assert.ok(result.container instanceof Container);
            assert.ok(result.serviceFactory instanceof ServiceFactory);
            assert.ok(result.container.isRegistered(ServiceTokens.EXTENSION_CONTEXT));
            
            // Should log initialization messages
            assert.ok(consoleLogStub.calledWith('🏗️ Dependency injection container initialized'));
            
            consoleLogStub.restore();
        });

        test('should register extension context', () => {
            const result = initializeContainer(mockContext);
            
            const context = result.container.resolve(ServiceTokens.EXTENSION_CONTEXT);
            assert.strictEqual(context, mockContext);
        });

        test('should count registered services', () => {
            const consoleLogStub = sinon.stub(console, 'log');
            
            const result = initializeContainer(mockContext);
            
            const serviceCount = result.container.getRegisteredServices().length;
            assert.ok(serviceCount > 10, 'Should have registered multiple services');
            
            // Should log service count
            const logCalls = consoleLogStub.getCalls();
            const countLogCall = logCalls.find(call => 
                call.args[0] && call.args[0].includes('Registered services:')
            );
            assert.ok(countLogCall, 'Should log registered service count');
            
            consoleLogStub.restore();
        });
    });

    suite('Integration Tests', () => {
        test('should resolve complex dependency chain', () => {
            registerServices(container);

            // This should work because all dependencies are properly registered
            const provider = container.resolve<SfOrgCompareProvider>(ServiceTokens.SF_ORG_COMPARE_PROVIDER);
            
            assert.ok(provider instanceof SfOrgCompareProvider);
            
            // Verify that the provider has access to its dependencies
            // Note: We can't easily test private fields, but we can verify the service resolves
        });

        test('should handle service disposal in proper order', async () => {
            registerServices(container);
            
            // Resolve some services to create instances
            container.resolve(ServiceTokens.ENHANCED_ORG_MANAGER);
            container.resolve(ServiceTokens.FILE_COMPARE_SERVICE);
            container.resolve(ServiceTokens.SF_ORG_COMPARE_PROVIDER);
            
            // Should dispose without errors
            await container.dispose();
        });
    });
});
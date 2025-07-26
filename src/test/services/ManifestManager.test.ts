import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { ManifestManager, AVAILABLE_METADATA_TYPES, DEFAULT_MANIFEST_CONFIG } from '../../services/ManifestManager';

suite('ManifestManager Test Suite', () => {
    let manifestManager: ManifestManager;
    let mockContext: vscode.ExtensionContext;
    let mockGlobalState: sinon.SinonStubbedInstance<vscode.Memento>;

    const testOrgId = 'test-org-123';
    const testOrgAlias = 'test-org';

    setup(() => {
        mockGlobalState = {
            get: sinon.stub(),
            update: sinon.stub().resolves(),
            keys: sinon.stub().returns([]),
            setKeysForSync: sinon.stub()
        } as any;

        mockContext = {
            subscriptions: [],
            workspaceState: {} as any,
            globalState: mockGlobalState as any,
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

        // Set up default mock responses
        mockGlobalState.get.withArgs('orgManifestConfigs', {}).returns({});

        manifestManager = new ManifestManager(mockContext);
    });

    teardown(() => {
        sinon.restore();
    });

    suite('Configuration Management', () => {
        test('should create default configuration for new org', () => {
            const config = manifestManager.getOrgManifestConfig(testOrgId, testOrgAlias);
            
            assert.strictEqual(config.orgId, testOrgId);
            assert.strictEqual(config.orgAlias, testOrgAlias);
            assert.ok(Array.isArray(config.enabledMetadataTypes));
            assert.ok(config.enabledMetadataTypes.length > 0);
            assert.ok(config.customMembers instanceof Map);
            assert.ok(config.lastModified instanceof Date);
        });

        test('should return same configuration for existing org', () => {
            const config1 = manifestManager.getOrgManifestConfig(testOrgId, testOrgAlias);
            const config2 = manifestManager.getOrgManifestConfig(testOrgId, testOrgAlias);
            
            assert.strictEqual(config1, config2);
            assert.strictEqual(config1.orgId, config2.orgId);
        });

        test('should update org configuration', async () => {
            const originalConfig = manifestManager.getOrgManifestConfig(testOrgId, testOrgAlias);
            const originalEnabledTypes = [...originalConfig.enabledMetadataTypes];
            
            const newEnabledTypes = ['ApexClass', 'ApexTrigger'];
            await manifestManager.updateOrgManifestConfig(testOrgId, {
                enabledMetadataTypes: newEnabledTypes
            });
            
            const updatedConfig = manifestManager.getOrgManifestConfig(testOrgId);
            assert.deepStrictEqual(updatedConfig.enabledMetadataTypes, newEnabledTypes);
            assert.notDeepStrictEqual(updatedConfig.enabledMetadataTypes, originalEnabledTypes);
            assert.ok(mockGlobalState.update.calledWith('orgManifestConfigs'));
        });

        test('should load existing configurations from storage', () => {
            const storedConfig = {
                [testOrgId]: {
                    orgAlias: testOrgAlias,
                    lastModified: new Date().toISOString(),
                    enabledMetadataTypes: ['ApexClass', 'ApexTrigger'],
                    customMembers: {},
                    apiVersion: '58.0'
                }
            };
            
            mockGlobalState.get.withArgs('orgManifestConfigs', {}).returns(storedConfig);
            
            const newManager = new ManifestManager(mockContext);
            const config = newManager.getOrgManifestConfig(testOrgId);
            
            assert.strictEqual(config.orgId, testOrgId);
            assert.strictEqual(config.orgAlias, testOrgAlias);
            assert.deepStrictEqual(config.enabledMetadataTypes, ['ApexClass', 'ApexTrigger']);
        });
    });

    suite('Metadata Types Management', () => {
        test('should get enabled metadata types for org', () => {
            const enabledTypes = manifestManager.getEnabledMetadataTypes(testOrgId);
            
            assert.ok(Array.isArray(enabledTypes));
            assert.ok(enabledTypes.length > 0);
            assert.ok(enabledTypes.every(type => 
                AVAILABLE_METADATA_TYPES.some(available => available.name === type.name)
            ));
        });

        test('should get metadata types grouped by category', () => {
            const categorizedTypes = manifestManager.getMetadataTypesByCategory();
            
            assert.ok(categorizedTypes instanceof Map);
            assert.ok(categorizedTypes.size > 0);
            
            // Check that all categories exist and have types
            for (const [category, types] of categorizedTypes) {
                assert.ok(typeof category === 'string');
                assert.ok(Array.isArray(types));
                assert.ok(types.length > 0);
                assert.ok(types.every(type => type.category === category));
            }
        });

        test('should enable all metadata types', async () => {
            await manifestManager.enableAllTypes(testOrgId);
            
            const config = manifestManager.getOrgManifestConfig(testOrgId);
            const allAvailableTypes = AVAILABLE_METADATA_TYPES.map(type => type.name);
            
            assert.deepStrictEqual(config.enabledMetadataTypes.sort(), allAvailableTypes.sort());
        });

        test('should enable only core types', async () => {
            const coreTypes = ['ApexClass', 'ApexTrigger', 'LightningComponentBundle', 'AuraDefinitionBundle', 'CustomObject'];
            
            await manifestManager.enableCoreTypesOnly(testOrgId);
            
            const config = manifestManager.getOrgManifestConfig(testOrgId);
            assert.deepStrictEqual(config.enabledMetadataTypes.sort(), coreTypes.sort());
        });

        test('should reset to default configuration', async () => {
            // First modify the configuration
            await manifestManager.updateOrgManifestConfig(testOrgId, {
                enabledMetadataTypes: ['ApexClass']
            });
            
            // Then reset to default
            await manifestManager.resetToDefault(testOrgId);
            
            const config = manifestManager.getOrgManifestConfig(testOrgId);
            assert.deepStrictEqual(
                config.enabledMetadataTypes.sort(),
                DEFAULT_MANIFEST_CONFIG.enabledMetadataTypes.sort()
            );
        });
    });

    suite('Manifest Generation', () => {
        test('should generate valid XML manifest', () => {
            const manifest = manifestManager.generateManifest(testOrgId);
            
            assert.ok(manifest.includes('<?xml version="1.0" encoding="UTF-8"?>'));
            assert.ok(manifest.includes('<Package xmlns="http://soap.sforce.com/2006/04/metadata">'));
            assert.ok(manifest.includes('<version>'));
            assert.ok(manifest.includes('</Package>'));
        });

        test('should include enabled metadata types in manifest', () => {
            const enabledTypes = ['ApexClass', 'ApexTrigger'];
            manifestManager.updateOrgManifestConfig(testOrgId, {
                enabledMetadataTypes: enabledTypes
            });
            
            const manifest = manifestManager.generateManifest(testOrgId);
            
            enabledTypes.forEach(type => {
                assert.ok(manifest.includes(`<name>${type}</name>`));
                assert.ok(manifest.includes('<members>*</members>'));
            });
        });

        test('should exclude disabled metadata types from manifest', () => {
            const enabledTypes = ['ApexClass'];
            const disabledType = 'ApexTrigger';
            
            manifestManager.updateOrgManifestConfig(testOrgId, {
                enabledMetadataTypes: enabledTypes
            });
            
            const manifest = manifestManager.generateManifest(testOrgId);
            
            assert.ok(manifest.includes(`<name>${enabledTypes[0]}</name>`));
            assert.ok(!manifest.includes(`<name>${disabledType}</name>`));
        });

        test('should save manifest to file', async () => {
            const testFilePath = '/tmp/test-manifest.xml';
            const writeFileStub = sinon.stub(fs.promises, 'writeFile').resolves();
            
            await manifestManager.saveManifestToFile(testOrgId, testFilePath);
            
            assert.ok(writeFileStub.calledOnce);
            assert.strictEqual(writeFileStub.getCall(0).args[0], testFilePath);
            const manifestContent = writeFileStub.getCall(0).args[1] as string;
            assert.ok(manifestContent.includes('<?xml version="1.0"'));
            assert.strictEqual(writeFileStub.getCall(0).args[2], 'utf8');
            
            writeFileStub.restore();
        });

        test('should handle custom members in manifest', async () => {
            const customMembers = new Map([
                ['ApexClass', ['TestClass1', 'TestClass2']],
                ['ApexTrigger', ['TestTrigger1']]
            ]);
            
            await manifestManager.updateOrgManifestConfig(testOrgId, {
                enabledMetadataTypes: ['ApexClass', 'ApexTrigger'],
                customMembers
            });
            
            const manifest = manifestManager.generateManifest(testOrgId);
            
            assert.ok(manifest.includes('<members>TestClass1</members>'));
            assert.ok(manifest.includes('<members>TestClass2</members>'));
            assert.ok(manifest.includes('<members>TestTrigger1</members>'));
            assert.ok(!manifest.includes('<members>*</members>'));
        });
    });

    suite('Statistics and Analysis', () => {
        test('should get manifest statistics', () => {
            const stats = manifestManager.getManifestStats(testOrgId);
            
            assert.ok(typeof stats.totalAvailableTypes === 'number');
            assert.ok(typeof stats.enabledTypes === 'number');
            assert.ok(typeof stats.disabledTypes === 'number');
            assert.ok(typeof stats.categoriesUsed === 'number');
            assert.ok(stats.lastModified instanceof Date);
            
            assert.strictEqual(stats.enabledTypes + stats.disabledTypes, stats.totalAvailableTypes);
            assert.strictEqual(stats.totalAvailableTypes, AVAILABLE_METADATA_TYPES.length);
        });

        test('should calculate categories used correctly', async () => {
            // Enable types from specific categories
            const enabledTypes = ['ApexClass', 'LightningComponentBundle', 'PermissionSet'];
            await manifestManager.updateOrgManifestConfig(testOrgId, {
                enabledMetadataTypes: enabledTypes
            });
            
            const stats = manifestManager.getManifestStats(testOrgId);
            
            // Should have at least 3 categories (Apex, Components, Security)
            assert.ok(stats.categoriesUsed >= 3);
        });
    });

    suite('Org Management', () => {
        test('should remove org configuration', async () => {
            // First create a configuration
            manifestManager.getOrgManifestConfig(testOrgId);
            
            // Then remove it
            await manifestManager.removeOrgConfig(testOrgId);
            
            assert.ok(mockGlobalState.update.calledWith('orgManifestConfigs'));
            
            // New configuration should be created if requested again
            const newConfig = manifestManager.getOrgManifestConfig(testOrgId);
            assert.ok(newConfig.lastModified);
        });

        test('should get configured org IDs', () => {
            manifestManager.getOrgManifestConfig(testOrgId);
            manifestManager.getOrgManifestConfig('another-org');
            
            const configuredIds = manifestManager.getConfiguredOrgIds();
            
            assert.ok(configuredIds.includes(testOrgId));
            assert.ok(configuredIds.includes('another-org'));
            assert.strictEqual(configuredIds.length, 2);
        });
    });

    suite('Error Handling', () => {
        test('should handle storage errors gracefully', () => {
            mockGlobalState.get.throws(new Error('Storage error'));
            
            // Should not throw during construction
            assert.doesNotThrow(() => {
                new ManifestManager(mockContext);
            });
        });

        test('should handle save errors gracefully', async () => {
            mockGlobalState.update.rejects(new Error('Update error'));
            
            // Should not throw during update
            await assert.doesNotReject(async () => {
                await manifestManager.updateOrgManifestConfig(testOrgId, {
                    enabledMetadataTypes: ['ApexClass']
                });
            });
        });

        test('should handle file save errors', async () => {
            const writeFileStub = sinon.stub(fs.promises, 'writeFile').rejects(new Error('File error'));
            
            await assert.rejects(async () => {
                await manifestManager.saveManifestToFile(testOrgId, '/tmp/test.xml');
            });
            
            writeFileStub.restore();
        });
    });
});
import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ManifestConfigurationWebview } from '../../webview/ManifestConfigurationWebview';
import { ManifestManager } from '../../services/ManifestManager';
import { EnhancedOrgManager } from '../../metadata/EnhancedOrgManager';
import { SalesforceOrg } from '../../types';

suite('ManifestConfigurationWebview Test Suite', () => {
    let webview: ManifestConfigurationWebview;
    let mockContext: sinon.SinonStubbedInstance<vscode.ExtensionContext>;
    let mockManifestManager: sinon.SinonStubbedInstance<ManifestManager>;
    let mockEnhancedOrgManager: sinon.SinonStubbedInstance<EnhancedOrgManager>;
    let mockPanel: sinon.SinonStubbedInstance<vscode.WebviewPanel>;
    let mockWebviewObj: sinon.SinonStubbedInstance<vscode.Webview>;
    let createWebviewPanelStub: sinon.SinonStub;

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

    const sampleOrg3: SalesforceOrg = {
        id: 'org3-id',
        username: 'org3@example.com',
        alias: 'org3',
        instanceUrl: 'https://org3.salesforce.com',
        accessToken: 'token3'
    };

    setup(() => {
        sinon.reset();

        // Mock ExtensionContext
        mockContext = {
            extensionPath: '/path/to/extension'
        } as any;

        // Mock ManifestManager
        mockManifestManager = sinon.createStubInstance(ManifestManager);
        
        // Mock EnhancedOrgManager
        mockEnhancedOrgManager = sinon.createStubInstance(EnhancedOrgManager);

        // Mock Webview
        mockWebviewObj = {
            html: '',
            onDidReceiveMessage: sinon.stub(),
            postMessage: sinon.stub().resolves()
        } as any;

        // Mock WebviewPanel
        mockPanel = {
            webview: mockWebviewObj as any,
            reveal: sinon.stub(),
            onDidDispose: sinon.stub(),
            dispose: sinon.stub()
        } as any;

        // Mock vscode.window.createWebviewPanel
        createWebviewPanelStub = sinon.stub(vscode.window, 'createWebviewPanel').returns(mockPanel as any);

        webview = new ManifestConfigurationWebview(
            mockContext as any,
            mockManifestManager as any,
            mockEnhancedOrgManager as any
        );
    });

    teardown(() => {
        sinon.restore();
    });

    suite('constructor', () => {
        test('should initialize with correct dependencies', () => {
            assert.ok(webview);
        });
    });

    suite('show - new panel creation', () => {
        test('should create new panel when none exists', async () => {
            mockEnhancedOrgManager.getOrgs.returns([sampleOrg1, sampleOrg2]);
            mockManifestManager.getOrgManifestConfig.returns({
                orgId: 'org1-id',
                orgAlias: 'org1',
                apiVersion: '58.0',
                enabledMetadataTypes: ['ApexClass'],
                customMembers: new Map(),
                lastModified: new Date()
            });
            mockManifestManager.getManifestStats.returns({
                enabledTypes: 1,
                totalAvailableTypes: 25,
                categoriesUsed: 1,
                disabledTypes: 24,
                lastModified: new Date()
            });

            await webview.show();

            assert.ok(createWebviewPanelStub.calledOnce);
            assert.strictEqual(createWebviewPanelStub.firstCall.args[0], 'manifestConfiguration');
            assert.strictEqual(createWebviewPanelStub.firstCall.args[1], 'Manifest Configuration');
            assert.ok(mockWebviewObj.postMessage.called);
        });

        test('should send all orgs data and then specific org data when orgId provided', async () => {
            const targetOrgId = 'org1-id';
            mockEnhancedOrgManager.getOrgs.returns([sampleOrg1, sampleOrg2]);
            mockEnhancedOrgManager.getOrg.withArgs(targetOrgId).returns(sampleOrg1);
            mockManifestManager.getOrgManifestConfig.returns({
                orgId: 'org1-id',
                orgAlias: 'org1',
                apiVersion: '58.0',
                enabledMetadataTypes: ['ApexClass'],
                customMembers: new Map(),
                lastModified: new Date()
            });
            mockManifestManager.getManifestStats.returns({
                enabledTypes: 1,
                totalAvailableTypes: 25,
                categoriesUsed: 1,
                disabledTypes: 24,
                lastModified: new Date()
            });
            mockManifestManager.getMetadataTypesByCategory.returns(new Map([
                ['Apex', [{ name: 'ApexClass', displayName: 'Apex Classes', description: 'Apex class files', category: 'Apex', enabled: true }]]
            ]));

            await webview.show(targetOrgId);

            // Should call postMessage twice: once for all orgs, once for specific org
            assert.strictEqual(mockWebviewObj.postMessage.callCount, 2);
            
            // First call should be updateOrgsList
            const firstCall = mockWebviewObj.postMessage.firstCall.args[0];
            assert.strictEqual(firstCall.command, 'updateOrgsList');
            assert.ok(Array.isArray(firstCall.orgs));
            
            // Second call should be updateOrgConfig
            const secondCall = mockWebviewObj.postMessage.secondCall.args[0];
            assert.strictEqual(secondCall.command, 'updateOrgConfig');
            assert.strictEqual(secondCall.org.id, targetOrgId);
        });

        test('should auto-select last modified org when no orgId provided', async () => {
            // Set up orgs with different last modified times
            const oldDate = new Date('2024-01-01T10:00:00Z');
            const recentDate = new Date('2024-12-01T15:30:00Z');
            
            mockEnhancedOrgManager.getOrgs.returns([sampleOrg1, sampleOrg2, sampleOrg3]);
            mockEnhancedOrgManager.getOrg.withArgs('org2-id').returns(sampleOrg2);
            
            // Mock different last modified times
            mockManifestManager.getOrgManifestConfig.withArgs('org1-id', 'org1').returns({
                orgId: 'org1-id',
                orgAlias: 'org1',
                apiVersion: '58.0',
                enabledMetadataTypes: ['ApexClass'],
                customMembers: new Map(),
                lastModified: oldDate
            });
            mockManifestManager.getOrgManifestConfig.withArgs('org2-id', 'org2').returns({
                orgId: 'org2-id',
                orgAlias: 'org2',
                apiVersion: '58.0',
                enabledMetadataTypes: ['ApexClass'],
                customMembers: new Map(),
                lastModified: recentDate // Most recent
            });
            mockManifestManager.getOrgManifestConfig.withArgs('org3-id', 'org3').returns({
                orgId: 'org3-id',
                orgAlias: 'org3',
                apiVersion: '58.0',
                enabledMetadataTypes: ['ApexClass'],
                customMembers: new Map(),
                lastModified: new Date(0) // Default date for undefined case
            });

            mockManifestManager.getManifestStats.returns({
                enabledTypes: 1,
                totalAvailableTypes: 25,
                categoriesUsed: 1,
                disabledTypes: 24,
                lastModified: new Date()
            });
            mockManifestManager.getMetadataTypesByCategory.returns(new Map([
                ['Apex', [{ name: 'ApexClass', displayName: 'Apex Classes', description: 'Apex class files', category: 'Apex', enabled: true }]]
            ]));

            await webview.show();

            // Should call postMessage twice: once for all orgs, once for most recent org
            assert.strictEqual(mockWebviewObj.postMessage.callCount, 2);
            
            // Second call should be for org2 (most recent)
            const secondCall = mockWebviewObj.postMessage.secondCall.args[0];
            assert.strictEqual(secondCall.command, 'updateOrgConfig');
            assert.strictEqual(secondCall.org.id, 'org2-id');
        });

        test('should send only all orgs data when no last modified org found', async () => {
            // All orgs have no last modified time
            mockEnhancedOrgManager.getOrgs.returns([sampleOrg1, sampleOrg2]);
            mockManifestManager.getOrgManifestConfig.returns({
                orgId: 'default-org-id',
                orgAlias: 'default-org',
                apiVersion: '58.0',
                enabledMetadataTypes: ['ApexClass'],
                customMembers: new Map(),
                lastModified: new Date(0)
            });
            mockManifestManager.getManifestStats.returns({
                enabledTypes: 1,
                totalAvailableTypes: 25,
                categoriesUsed: 1,
                disabledTypes: 24,
                lastModified: new Date()
            });

            await webview.show();

            // Should call postMessage only once for all orgs
            assert.strictEqual(mockWebviewObj.postMessage.callCount, 1);
            const call = mockWebviewObj.postMessage.firstCall.args[0];
            assert.strictEqual(call.command, 'updateOrgsList');
        });
    });

    suite('show - existing panel', () => {
        test('should reveal existing panel and send data when orgId provided', async () => {
            // First call creates panel
            await webview.show();
            
            // Reset call counts
            mockWebviewObj.postMessage.resetHistory();
            mockPanel.reveal.resetHistory();

            // Mock org data
            mockEnhancedOrgManager.getOrgs.returns([sampleOrg1, sampleOrg2]);
            mockEnhancedOrgManager.getOrg.withArgs('org1-id').returns(sampleOrg1);
            mockManifestManager.getOrgManifestConfig.returns({
                orgId: 'org1-id',
                orgAlias: 'org1',
                apiVersion: '58.0',
                enabledMetadataTypes: ['ApexClass'],
                customMembers: new Map(),
                lastModified: new Date()
            });
            mockManifestManager.getManifestStats.returns({
                enabledTypes: 1,
                totalAvailableTypes: 25,
                categoriesUsed: 1,
                disabledTypes: 24,
                lastModified: new Date()
            });
            mockManifestManager.getMetadataTypesByCategory.returns(new Map([
                ['Apex', [{ name: 'ApexClass', displayName: 'Apex Classes', description: 'Apex class files', category: 'Apex', enabled: true }]]
            ]));

            // Second call should reveal existing panel
            await webview.show('org1-id');

            assert.ok(mockPanel.reveal.calledOnce);
            assert.strictEqual(mockWebviewObj.postMessage.callCount, 2); // All orgs + specific org
        });

        test('should only reveal existing panel when no orgId provided', async () => {
            // First call creates panel
            await webview.show();
            
            // Reset call counts
            mockPanel.reveal.resetHistory();

            // Second call should only reveal
            await webview.show();

            assert.ok(mockPanel.reveal.calledOnce);
        });
    });

    suite('getLastModifiedOrgId', () => {
        test('should return org with most recent last modified time', () => {
            const oldDate = new Date('2024-01-01T10:00:00Z');
            const recentDate = new Date('2024-12-01T15:30:00Z');
            const middleDate = new Date('2024-06-01T12:00:00Z');
            
            mockEnhancedOrgManager.getOrgs.returns([sampleOrg1, sampleOrg2, sampleOrg3]);
            
            mockManifestManager.getOrgManifestConfig.withArgs('org1-id', 'org1').returns({
                orgId: 'org1-id',
                orgAlias: 'org1',
                apiVersion: '58.0',
                enabledMetadataTypes: [],
                customMembers: new Map(),
                lastModified: oldDate
            });
            mockManifestManager.getOrgManifestConfig.withArgs('org2-id', 'org2').returns({
                orgId: 'org2-id',
                orgAlias: 'org2',
                apiVersion: '58.0',
                enabledMetadataTypes: [],
                customMembers: new Map(),
                lastModified: recentDate // Most recent
            });
            mockManifestManager.getOrgManifestConfig.withArgs('org3-id', 'org3').returns({
                orgId: 'org3-id',
                orgAlias: 'org3',
                apiVersion: '58.0',
                enabledMetadataTypes: [],
                customMembers: new Map(),
                lastModified: middleDate
            });

            const result = (webview as any).getLastModifiedOrgId();

            assert.strictEqual(result, 'org2-id');
        });

        test('should return null when no orgs have last modified time', () => {
            mockEnhancedOrgManager.getOrgs.returns([sampleOrg1, sampleOrg2]);
            
            mockManifestManager.getOrgManifestConfig.returns({
                orgId: 'default-org-id',
                orgAlias: 'default-org',
                apiVersion: '58.0',
                enabledMetadataTypes: [],
                customMembers: new Map(),
                lastModified: new Date(0)
            });

            const result = (webview as any).getLastModifiedOrgId();

            assert.strictEqual(result, null);
        });

        test('should return null when no orgs exist', () => {
            mockEnhancedOrgManager.getOrgs.returns([]);

            const result = (webview as any).getLastModifiedOrgId();

            assert.strictEqual(result, null);
        });

        test('should handle mixed scenarios with some orgs having last modified time', () => {
            const recentDate = new Date('2024-12-01T15:30:00Z');
            
            mockEnhancedOrgManager.getOrgs.returns([sampleOrg1, sampleOrg2, sampleOrg3]);
            
            // Only org2 has last modified time
            mockManifestManager.getOrgManifestConfig.withArgs('org1-id', 'org1').returns({
                orgId: 'org1-id',
                orgAlias: 'org1',
                apiVersion: '58.0',
                enabledMetadataTypes: [],
                customMembers: new Map(),
                lastModified: new Date(0)
            });
            mockManifestManager.getOrgManifestConfig.withArgs('org2-id', 'org2').returns({
                orgId: 'org2-id',
                orgAlias: 'org2',
                apiVersion: '58.0',
                enabledMetadataTypes: [],
                customMembers: new Map(),
                lastModified: recentDate
            });
            mockManifestManager.getOrgManifestConfig.withArgs('org3-id', 'org3').returns({
                orgId: 'org3-id',
                orgAlias: 'org3',
                apiVersion: '58.0',
                enabledMetadataTypes: [],
                customMembers: new Map(),
                lastModified: new Date(0)
            });

            const result = (webview as any).getLastModifiedOrgId();

            assert.strictEqual(result, 'org2-id');
        });
    });

    suite('sendOrgData', () => {
        test('should send org configuration data correctly', () => {
            const orgId = 'org1-id';
            mockEnhancedOrgManager.getOrg.withArgs(orgId).returns(sampleOrg1);
            mockManifestManager.getOrgManifestConfig.returns({
                orgId: 'org1-id',
                orgAlias: 'org1',
                apiVersion: '58.0',
                enabledMetadataTypes: ['ApexClass', 'ApexTrigger'],
                customMembers: new Map(),
                lastModified: new Date()
            });
            mockManifestManager.getMetadataTypesByCategory.returns(new Map([
                ['Apex', [
                    { name: 'ApexClass', displayName: 'Apex Classes', description: 'Apex class files', category: 'Apex', enabled: true },
                    { name: 'ApexTrigger', displayName: 'Apex Triggers', description: 'Apex trigger files', category: 'Apex', enabled: true }
                ]]
            ]));
            mockManifestManager.getManifestStats.returns({
                enabledTypes: 2,
                totalAvailableTypes: 25,
                categoriesUsed: 1,
                disabledTypes: 23,
                lastModified: new Date()
            });

            (webview as any).sendOrgData(orgId);

            assert.ok(mockWebviewObj.postMessage.calledOnce);
            const message = mockWebviewObj.postMessage.firstCall.args[0];
            assert.strictEqual(message.command, 'updateOrgConfig');
            assert.strictEqual(message.org.id, orgId);
            assert.strictEqual(message.org.alias, 'org1');
            assert.ok(Array.isArray(message.config.enabledMetadataTypes));
            assert.strictEqual(message.config.enabledMetadataTypes.length, 2);
            assert.ok(Array.isArray(message.metadataTypes));
            assert.strictEqual(message.stats.enabledTypes, 2);
        });

        test('should handle non-existent org gracefully', () => {
            const showErrorStub = sinon.stub(vscode.window, 'showErrorMessage');
            mockEnhancedOrgManager.getOrg.withArgs('non-existent').returns(undefined);

            (webview as any).sendOrgData('non-existent');

            assert.ok(showErrorStub.calledOnce);
            assert.ok(showErrorStub.args[0][0].includes('Organization not found'));
            assert.ok(mockWebviewObj.postMessage.notCalled);
        });
    });

    suite('sendAllOrgsData', () => {
        test('should send all organizations data correctly', () => {
            mockEnhancedOrgManager.getOrgs.returns([sampleOrg1, sampleOrg2]);
            mockManifestManager.getOrgManifestConfig.returns({
                orgId: 'org1-id',
                orgAlias: 'org1',
                apiVersion: '58.0',
                enabledMetadataTypes: ['ApexClass'],
                customMembers: new Map(),
                lastModified: new Date()
            });
            mockManifestManager.getManifestStats.returns({
                enabledTypes: 1,
                totalAvailableTypes: 25,
                categoriesUsed: 1,
                disabledTypes: 24,
                lastModified: new Date()
            });

            (webview as any).sendAllOrgsData();

            assert.ok(mockWebviewObj.postMessage.calledOnce);
            const message = mockWebviewObj.postMessage.firstCall.args[0];
            assert.strictEqual(message.command, 'updateOrgsList');
            assert.ok(Array.isArray(message.orgs));
            assert.strictEqual(message.orgs.length, 2);
            assert.strictEqual(message.orgs[0].id, 'org1-id');
            assert.strictEqual(message.orgs[1].id, 'org2-id');
        });

        test('should handle empty orgs list', () => {
            mockEnhancedOrgManager.getOrgs.returns([]);

            (webview as any).sendAllOrgsData();

            assert.ok(mockWebviewObj.postMessage.calledOnce);
            const message = mockWebviewObj.postMessage.firstCall.args[0];
            assert.strictEqual(message.command, 'updateOrgsList');
            assert.strictEqual(message.orgs.length, 0);
        });
    });

    suite('error handling', () => {
        test('should handle webview creation errors gracefully', async () => {
            createWebviewPanelStub.throws(new Error('Webview creation failed'));

            try {
                await webview.show();
                assert.fail('Should have thrown error');
            } catch (error) {
                assert.ok(error instanceof Error);
                assert.ok(error.message.includes('Webview creation failed'));
            }
        });

        test('should handle postMessage errors gracefully', async () => {
            mockWebviewObj.postMessage.rejects(new Error('Message send failed'));
            mockEnhancedOrgManager.getOrgs.returns([sampleOrg1]);
            mockManifestManager.getOrgManifestConfig.returns({
                orgId: 'default-org-id',
                orgAlias: 'default-org',
                apiVersion: '58.0',
                enabledMetadataTypes: [],
                customMembers: new Map(),
                lastModified: new Date(0)
            });

            // Should not throw despite postMessage failing
            await webview.show();

            assert.ok(mockWebviewObj.postMessage.called);
        });
    });

    suite('webview content generation', () => {
        test('should generate HTML content with correct structure', () => {
            const html = (webview as any).getWebviewContent();

            assert.ok(typeof html === 'string');
            assert.ok(html.includes('<!DOCTYPE html>'));
            assert.ok(html.includes('Manifest Configuration'));
            assert.ok(html.includes('org-select'));
            assert.ok(html.includes('updateOrgsList'));
            assert.ok(html.includes('updateOrgConfig'));
        });
    });
});
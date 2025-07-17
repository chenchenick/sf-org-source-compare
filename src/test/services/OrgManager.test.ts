import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { OrgManager } from '../../services/OrgManager';
import { SalesforceOrg, OrgFile } from '../../types';

// Mock child_process
const mockExec = sinon.stub();
const mockExecAsync = sinon.stub();

// Mock dependencies
sinon.stub(require('child_process'), 'exec').callsFake(mockExec);
sinon.stub(require('util'), 'promisify').returns(mockExecAsync);

suite('OrgManager Test Suite', () => {
    let orgManager: OrgManager;
    let mockContext: vscode.ExtensionContext;
    let mockGlobalState: sinon.SinonStubbedInstance<vscode.Memento>;
    let showErrorMessageStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;
    let showQuickPickStub: sinon.SinonStub;

    const sampleOrg: SalesforceOrg = {
        id: 'test-org-id',
        username: 'test@example.com',
        alias: 'test-org',
        instanceUrl: 'https://test.salesforce.com',
        accessToken: 'fake-token'
    };

    const sampleOrgFile: OrgFile = {
        id: 'test-file-id',
        name: 'TestClass.cls',
        type: 'ApexClass',
        fullName: 'TestClass',
        orgId: 'test-org-id'
    };

    setup(() => {
        // Reset all stubs
        sinon.reset();

        // Mock VSCode context and global state
        mockGlobalState = {
            get: sinon.stub(),
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

        // Mock VSCode window methods
        showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
        showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
        showQuickPickStub = sinon.stub(vscode.window, 'showQuickPick');

        orgManager = new OrgManager(mockContext);
    });

    teardown(() => {
        sinon.restore();
    });

    suite('Constructor and Initialization', () => {
        test('should initialize with empty orgs when no stored data', () => {
            mockGlobalState.get.returns([]);
            const newOrgManager = new OrgManager(mockContext);
            assert.strictEqual(newOrgManager.getOrgs().length, 0);
        });

        test('should load existing orgs from global state', () => {
            mockGlobalState.get.returns([sampleOrg]);
            const newOrgManager = new OrgManager(mockContext);
            const orgs = newOrgManager.getOrgs();
            assert.strictEqual(orgs.length, 1);
            assert.deepStrictEqual(orgs[0], sampleOrg);
        });

        test('should handle corrupted global state gracefully', () => {
            mockGlobalState.get.throws(new Error('Corrupted data'));
            const newOrgManager = new OrgManager(mockContext);
            assert.ok(showErrorMessageStub.calledOnce);
            assert.strictEqual(newOrgManager.getOrgs().length, 0);
        });
    });

    suite('addOrg', () => {
        test('should add new org successfully', async () => {
            await orgManager.addOrg(sampleOrg);
            assert.strictEqual(orgManager.getOrgs().length, 1);
            assert.ok(mockGlobalState.update.calledOnce);
        });

        test('should update existing org when ID matches', async () => {
            await orgManager.addOrg(sampleOrg);
            
            const updatedOrg = { ...sampleOrg, alias: 'updated-alias' };
            await orgManager.addOrg(updatedOrg);
            
            const orgs = orgManager.getOrgs();
            assert.strictEqual(orgs.length, 1);
            assert.strictEqual(orgs[0].alias, 'updated-alias');
        });

        test('should handle save errors gracefully', async () => {
            mockGlobalState.update.rejects(new Error('Save failed'));
            
            try {
                await orgManager.addOrg(sampleOrg);
                assert.fail('Should have thrown error');
            } catch (error: any) {
                assert.ok(showErrorMessageStub.calledOnce);
            }
        });
    });

    suite('removeOrg', () => {
        test('should remove existing org successfully', async () => {
            await orgManager.addOrg(sampleOrg);
            await orgManager.removeOrg(sampleOrg.id);
            
            assert.strictEqual(orgManager.getOrgs().length, 0);
            assert.ok(mockGlobalState.update.calledTwice);
        });

        test('should handle removal of non-existent org', async () => {
            await orgManager.removeOrg('non-existent-id');
            assert.strictEqual(orgManager.getOrgs().length, 0);
        });

        test('should handle save errors during removal', async () => {
            await orgManager.addOrg(sampleOrg);
            mockGlobalState.update.onSecondCall().rejects(new Error('Save failed'));
            
            try {
                await orgManager.removeOrg(sampleOrg.id);
                assert.fail('Should have thrown error');
            } catch (error: any) {
                assert.ok(showErrorMessageStub.calledOnce);
            }
        });
    });

    suite('getOrg', () => {
        test('should return org when ID exists', async () => {
            await orgManager.addOrg(sampleOrg);
            const foundOrg = orgManager.getOrg(sampleOrg.id);
            assert.deepStrictEqual(foundOrg, sampleOrg);
        });

        test('should return undefined when ID does not exist', () => {
            const foundOrg = orgManager.getOrg('non-existent-id');
            assert.strictEqual(foundOrg, undefined);
        });
    });

    suite('querySfdxOrgs', () => {
        test('should parse SF CLI response with scratch orgs', async () => {
            const mockResponse = {
                status: 0,
                result: {
                    scratchOrgs: [{
                        orgId: 'scratch-org-id',
                        username: 'scratch@example.com',
                        alias: 'scratch-org',
                        instanceUrl: 'https://scratch.salesforce.com'
                    }],
                    nonScratchOrgs: []
                }
            };
            
            mockExecAsync.resolves({ stdout: JSON.stringify(mockResponse) });
            
            const orgs = await orgManager.querySfdxOrgs();
            assert.strictEqual(orgs.length, 1);
            assert.strictEqual(orgs[0].username, 'scratch@example.com');
        });

        test('should parse SF CLI response with non-scratch orgs', async () => {
            const mockResponse = {
                status: 0,
                result: {
                    scratchOrgs: [],
                    nonScratchOrgs: [{
                        orgId: 'prod-org-id',
                        username: 'prod@example.com',
                        alias: 'prod-org',
                        instanceUrl: 'https://prod.salesforce.com'
                    }]
                }
            };
            
            mockExecAsync.resolves({ stdout: JSON.stringify(mockResponse) });
            
            const orgs = await orgManager.querySfdxOrgs();
            assert.strictEqual(orgs.length, 1);
            assert.strictEqual(orgs[0].username, 'prod@example.com');
        });

        test('should handle SF CLI error response', async () => {
            const mockResponse = {
                status: 1,
                message: 'SF CLI error'
            };
            
            mockExecAsync.resolves({ stdout: JSON.stringify(mockResponse) });
            
            try {
                await orgManager.querySfdxOrgs();
                assert.fail('Should have thrown error');
            } catch (error: any) {
                assert.ok(error.message.includes('SF CLI error'));
            }
        });

        test('should handle SF CLI command failure', async () => {
            mockExecAsync.rejects(new Error('Command not found'));
            
            try {
                await orgManager.querySfdxOrgs();
                assert.fail('Should have thrown error');
            } catch (error: any) {
                assert.ok(error.message.includes('Failed to query Salesforce orgs'));
            }
        });

        test('should handle malformed JSON response', async () => {
            mockExecAsync.resolves({ stdout: 'invalid json' });
            
            try {
                await orgManager.querySfdxOrgs();
                assert.fail('Should have thrown error');
            } catch (error: any) {
                assert.ok(error.message.includes('Failed to query Salesforce orgs'));
            }
        });

        test('should generate IDs when orgId is missing', async () => {
            const mockResponse = {
                status: 0,
                result: {
                    scratchOrgs: [{
                        username: 'test@example.com',
                        alias: 'test-org'
                    }],
                    nonScratchOrgs: []
                }
            };
            
            mockExecAsync.resolves({ stdout: JSON.stringify(mockResponse) });
            
            const orgs = await orgManager.querySfdxOrgs();
            assert.strictEqual(orgs.length, 1);
            assert.ok(orgs[0].id.includes('test@example.com'));
        });
    });

    suite('authenticateOrg', () => {
        test('should show org selection when orgs are available', async () => {
            const mockOrgs = [sampleOrg];
            sinon.stub(orgManager, 'querySfdxOrgs').resolves(mockOrgs);
            showQuickPickStub.resolves({ org: sampleOrg });
            
            const result = await orgManager.authenticateOrg();
            
            assert.ok(showQuickPickStub.calledOnce);
            assert.deepStrictEqual(result, sampleOrg);
        });

        test('should show terminal option when no orgs available', async () => {
            sinon.stub(orgManager, 'querySfdxOrgs').resolves([]);
            showInformationMessageStub.resolves('Open Terminal');
            
            const result = await orgManager.authenticateOrg();
            
            assert.ok(showInformationMessageStub.calledOnce);
            assert.strictEqual(result, undefined);
        });

        test('should return undefined when user cancels selection', async () => {
            const mockOrgs = [sampleOrg];
            sinon.stub(orgManager, 'querySfdxOrgs').resolves(mockOrgs);
            showQuickPickStub.resolves(undefined);
            
            const result = await orgManager.authenticateOrg();
            
            assert.strictEqual(result, undefined);
        });

        test('should handle query errors gracefully', async () => {
            sinon.stub(orgManager, 'querySfdxOrgs').rejects(new Error('Query failed'));
            
            const result = await orgManager.authenticateOrg();
            
            assert.ok(showErrorMessageStub.calledOnce);
            assert.strictEqual(result, undefined);
        });
    });

    suite('getOrgFilesByType', () => {
        test('should retrieve metadata for all types', async () => {
            await orgManager.addOrg(sampleOrg);
            
            const mockApexResponse = {
                status: 0,
                result: [{
                    fullName: 'TestClass'
                }]
            };
            
            mockExecAsync.resolves({ stdout: JSON.stringify(mockApexResponse) });
            
            const filesByType = await orgManager.getOrgFilesByType(sampleOrg.id);
            
            assert.ok(filesByType.size > 0);
            // Should be called for each metadata type
            assert.ok(mockExecAsync.callCount >= 6);
        });

        test('should handle metadata type with no results', async () => {
            await orgManager.addOrg(sampleOrg);
            
            const mockEmptyResponse = {
                status: 0,
                result: []
            };
            
            mockExecAsync.resolves({ stdout: JSON.stringify(mockEmptyResponse) });
            
            const filesByType = await orgManager.getOrgFilesByType(sampleOrg.id);
            
            // Should not include metadata types with no files
            assert.strictEqual(filesByType.size, 0);
        });

        test('should handle single result as object instead of array', async () => {
            await orgManager.addOrg(sampleOrg);
            
            const mockSingleResponse = {
                status: 0,
                result: {
                    fullName: 'TestClass'
                }
            };
            
            mockExecAsync.resolves({ stdout: JSON.stringify(mockSingleResponse) });
            
            const filesByType = await orgManager.getOrgFilesByType(sampleOrg.id);
            
            // Should handle single result wrapped in array
            if (filesByType.size > 0) {
                const apexFiles = filesByType.get('ApexClass');
                assert.ok(apexFiles && apexFiles.length === 1);
            }
        });

        test('should throw error for non-existent org', async () => {
            try {
                await orgManager.getOrgFilesByType('non-existent-id');
                assert.fail('Should have thrown error');
            } catch (error: any) {
                assert.ok(error.message.includes('Organization not found'));
            }
        });

        test('should handle SF CLI metadata query failures gracefully', async () => {
            await orgManager.addOrg(sampleOrg);
            
            mockExecAsync.rejects(new Error('Metadata API error'));
            
            try {
                await orgManager.getOrgFilesByType(sampleOrg.id);
                assert.fail('Should have thrown error');
            } catch (error: any) {
                assert.ok(error.message.includes('Failed to fetch files for org'));
            }
        });
    });

    suite('getFileContent', () => {
        test('should retrieve Apex class content via Tooling API', async () => {
            await orgManager.addOrg(sampleOrg);
            
            // Mock org files response
            sinon.stub(orgManager, 'getOrgFiles').resolves([sampleOrgFile]);
            
            const mockApexContent = {
                status: 0,
                result: {
                    records: [{
                        Body: 'public class TestClass { }'
                    }]
                }
            };
            
            mockExecAsync.resolves({ stdout: JSON.stringify(mockApexContent) });
            
            const content = await orgManager.getFileContent(sampleOrg.id, sampleOrgFile.id);
            
            assert.strictEqual(content, 'public class TestClass { }');
        });

        test('should handle CustomObject metadata retrieval', async () => {
            await orgManager.addOrg(sampleOrg);
            
            const customObjectFile: OrgFile = {
                ...sampleOrgFile,
                type: 'CustomObject',
                name: 'Account.object',
                fullName: 'Account'
            };
            
            sinon.stub(orgManager, 'getOrgFiles').resolves([customObjectFile]);
            
            // Mock fs.existsSync and fs.readFileSync
            const fsStub = sinon.stub(require('fs'), 'existsSync').returns(true);
            const readFileStub = sinon.stub(require('fs'), 'readFileSync').returns('<?xml version="1.0"?>');
            
            const mockRetrieveResponse = { status: 0 };
            mockExecAsync.resolves({ stdout: JSON.stringify(mockRetrieveResponse) });
            
            const content = await orgManager.getFileContent(sampleOrg.id, customObjectFile.id);
            
            assert.ok(content.includes('<?xml version="1.0"?>'));
            
            fsStub.restore();
            readFileStub.restore();
        });

        test('should handle file not found error', async () => {
            await orgManager.addOrg(sampleOrg);
            
            sinon.stub(orgManager, 'getOrgFiles').resolves([]);
            
            const content = await orgManager.getFileContent(sampleOrg.id, 'non-existent-file');
            
            assert.ok(content.includes('Error retrieving content'));
        });

        test('should handle org not found error', async () => {
            const content = await orgManager.getFileContent('non-existent-org', sampleOrgFile.id);
            
            assert.ok(content.includes('Error retrieving content'));
        });

        test('should handle Tooling API query failures', async () => {
            await orgManager.addOrg(sampleOrg);
            
            sinon.stub(orgManager, 'getOrgFiles').resolves([sampleOrgFile]);
            mockExecAsync.rejects(new Error('Tooling API error'));
            
            const content = await orgManager.getFileContent(sampleOrg.id, sampleOrgFile.id);
            
            assert.ok(content.includes('Error retrieving via Tooling API'));
        });
    });

    suite('getFileExtension', () => {
        const testCases = [
            { type: 'ApexClass', expected: '.cls' },
            { type: 'ApexTrigger', expected: '.trigger' },
            { type: 'CustomObject', expected: '.object' },
            { type: 'Flow', expected: '.flow' },
            { type: 'Layout', expected: '.layout' },
            { type: 'PermissionSet', expected: '.permissionset' },
            { type: 'UnknownType', expected: '.xml' }
        ];

        testCases.forEach(({ type, expected }) => {
            test(`should return ${expected} for ${type}`, () => {
                // Access private method through any type
                const extension = (orgManager as any).getFileExtension(type);
                assert.strictEqual(extension, expected);
            });
        });
    });
});
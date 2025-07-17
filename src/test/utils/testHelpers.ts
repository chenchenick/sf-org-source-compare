import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { SalesforceOrg, OrgFile } from '../../types';

/**
 * Test utilities for mocking VSCode and SF CLI interactions
 */

/**
 * Creates a mock VSCode extension context for testing
 */
export function createMockContext(initialData: any[] = []): vscode.ExtensionContext {
    const mockGlobalState = {
        get: sinon.stub().returns(initialData),
        update: sinon.stub().resolves(),
        keys: sinon.stub().returns([]),
        setKeysForSync: sinon.stub()
    } as any;

    return {
        globalState: mockGlobalState,
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
}

/**
 * Creates sample Salesforce org data for testing
 */
export function createSampleOrg(id: string, username: string, alias?: string): SalesforceOrg {
    return {
        id,
        username,
        alias: alias || username.split('@')[0],
        instanceUrl: `https://${username.split('@')[0]}.salesforce.com`,
        accessToken: `token-${id}`
    };
}

/**
 * Creates sample org file data for testing
 */
export function createSampleOrgFile(
    id: string,
    name: string,
    type: string,
    orgId: string,
    fullName?: string
): OrgFile {
    return {
        id,
        name,
        type,
        fullName: fullName || name.split('.')[0],
        orgId
    };
}

/**
 * Mock SF CLI responses for different commands
 */
export const MockSfCliResponses = {
    /**
     * Mock response for 'sf org list --json'
     */
    orgList: (orgs: Partial<SalesforceOrg>[] = []) => ({
        status: 0,
        result: {
            scratchOrgs: orgs.filter(org => org.username?.includes('scratch')).map(org => ({
                orgId: org.id,
                username: org.username,
                alias: org.alias,
                instanceUrl: org.instanceUrl
            })),
            nonScratchOrgs: orgs.filter(org => !org.username?.includes('scratch')).map(org => ({
                orgId: org.id,
                username: org.username,
                alias: org.alias,
                instanceUrl: org.instanceUrl
            }))
        }
    }),

    /**
     * Mock response for 'sf org list metadata --metadata-type X'
     */
    metadata: (items: string[] = []) => ({
        status: 0,
        result: items.map(name => ({ fullName: name }))
    }),

    /**
     * Mock response for 'sf data query --use-tooling-api'
     */
    toolingQuery: (body: string = 'public class TestClass {}') => ({
        status: 0,
        result: {
            records: [{ Body: body }]
        }
    }),

    /**
     * Mock response for 'sf project retrieve start'
     */
    projectRetrieve: (success: boolean = true) => ({
        status: success ? 0 : 1,
        message: success ? undefined : 'Retrieve failed'
    }),

    /**
     * Mock response for 'sf sobject describe'
     */
    sobjectDescribe: (objectName: string = 'Account') => ({
        status: 0,
        result: {
            name: objectName,
            label: objectName,
            custom: false,
            createable: true,
            deletable: true,
            updateable: true,
            queryable: true,
            searchable: true,
            mruEnabled: true,
            fields: [
                {
                    name: 'Id',
                    type: 'id',
                    label: 'Account ID',
                    custom: false,
                    required: true,
                    nillable: false
                },
                {
                    name: 'Name',
                    type: 'string',
                    label: 'Account Name',
                    custom: false,
                    required: true,
                    nillable: false
                }
            ],
            childRelationships: [
                {
                    relationshipName: 'Contacts',
                    childSObject: 'Contact'
                }
            ]
        }
    }),

    /**
     * Mock error response
     */
    error: (message: string = 'Command failed') => ({
        status: 1,
        message
    })
};

/**
 * Sets up common VSCode mocks for testing
 */
export function setupVSCodeMocks() {
    const mocks = {
        showErrorMessage: sinon.stub(vscode.window, 'showErrorMessage'),
        showInformationMessage: sinon.stub(vscode.window, 'showInformationMessage'),
        showWarningMessage: sinon.stub(vscode.window, 'showWarningMessage'),
        showQuickPick: sinon.stub(vscode.window, 'showQuickPick'),
        setStatusBarMessage: sinon.stub(vscode.window, 'setStatusBarMessage'),
        executeCommand: sinon.stub(vscode.commands, 'executeCommand'),
        openTextDocument: sinon.stub(vscode.workspace, 'openTextDocument')
    };

    // Set up default resolved values
    mocks.openTextDocument.resolves({ 
        uri: vscode.Uri.parse('untitled:test'),
        fileName: 'test',
        isUntitled: true,
        languageId: 'plaintext',
        version: 1,
        isDirty: false,
        isClosed: false,
        save: sinon.stub(),
        eol: vscode.EndOfLine.LF,
        lineCount: 1,
        getText: sinon.stub().returns(''),
        getWordRangeAtPosition: sinon.stub(),
        lineAt: sinon.stub(),
        offsetAt: sinon.stub(),
        positionAt: sinon.stub(),
        validatePosition: sinon.stub(),
        validateRange: sinon.stub()
    } as any);
    mocks.executeCommand.resolves();

    return mocks;
}

/**
 * Creates a mock for child_process exec functionality
 */
export function createMockExec() {
    const mockExecAsync = sinon.stub();
    sinon.stub(require('util'), 'promisify').returns(mockExecAsync);
    return mockExecAsync;
}

/**
 * Test data generators
 */
export const TestData = {
    /**
     * Generates multiple sample orgs
     */
    multipleOrgs: (count: number = 3): SalesforceOrg[] => {
        return Array.from({ length: count }, (_, i) => 
            createSampleOrg(`org${i + 1}-id`, `org${i + 1}@example.com`, `org${i + 1}`)
        );
    },

    /**
     * Generates multiple sample files
     */
    multipleFiles: (count: number = 5, orgId: string = 'test-org-id'): OrgFile[] => {
        const types = ['ApexClass', 'ApexTrigger', 'CustomObject', 'Flow', 'Layout'];
        const extensions = ['.cls', '.trigger', '.object', '.flow', '.layout'];
        
        return Array.from({ length: count }, (_, i) => {
            const typeIndex = i % types.length;
            return createSampleOrgFile(
                `file${i + 1}-id`,
                `TestItem${i + 1}${extensions[typeIndex]}`,
                types[typeIndex],
                orgId,
                `TestItem${i + 1}`
            );
        });
    },

    /**
     * Generates metadata by type map
     */
    metadataByType: (orgId: string = 'test-org-id'): Map<string, OrgFile[]> => {
        const map = new Map<string, OrgFile[]>();
        
        map.set('ApexClass', [
            createSampleOrgFile('apex1-id', 'AccountController.cls', 'ApexClass', orgId),
            createSampleOrgFile('apex2-id', 'ContactController.cls', 'ApexClass', orgId)
        ]);
        
        map.set('ApexTrigger', [
            createSampleOrgFile('trigger1-id', 'AccountTrigger.trigger', 'ApexTrigger', orgId)
        ]);
        
        map.set('CustomObject', [
            createSampleOrgFile('obj1-id', 'Custom_Object__c.object', 'CustomObject', orgId)
        ]);
        
        return map;
    }
};

/**
 * Assertion helpers for common test scenarios
 */
export const TestAssertions = {
    /**
     * Asserts that a stub was called with SF CLI command
     */
    calledWithSfCommand: (stub: sinon.SinonStub, command: string) => {
        const calls = stub.getCalls();
        const matchingCall = calls.find(call => 
            call.args[0] && call.args[0].includes(command)
        );
        if (!matchingCall) {
            throw new Error(`Expected stub to be called with command containing "${command}"`);
        }
    },

    /**
     * Asserts that VSCode diff was called correctly
     */
    diffCalled: (executeCommandStub: sinon.SinonStub, expectedTitle?: string) => {
        const diffCall = executeCommandStub.getCalls().find(call => 
            call.args[0] === 'vscode.diff'
        );
        if (!diffCall) {
            throw new Error('Expected vscode.diff command to be called');
        }
        
        if (expectedTitle) {
            const title = diffCall.args[3];
            if (!title.includes(expectedTitle)) {
                throw new Error(`Expected diff title to contain "${expectedTitle}", got "${title}"`);
            }
        }
    },

    /**
     * Asserts that status bar was updated with expected message
     */
    statusBarUpdated: (setStatusBarStub: sinon.SinonStub, expectedContent: string) => {
        const lastCall = setStatusBarStub.lastCall;
        if (!lastCall) {
            throw new Error('Expected status bar to be updated');
        }
        
        const message = lastCall.args[0];
        if (!message.includes(expectedContent)) {
            throw new Error(`Expected status bar message to contain "${expectedContent}", got "${message}"`);
        }
    }
};

/**
 * Performance testing helpers
 */
export const PerformanceHelpers = {
    /**
     * Measures execution time of an async function
     */
    async measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
        const start = Date.now();
        const result = await fn();
        const duration = Date.now() - start;
        return { result, duration };
    },

    /**
     * Asserts that an operation completes within expected time
     */
    async assertPerformance<T>(
        fn: () => Promise<T>, 
        maxDuration: number, 
        operation: string
    ): Promise<T> {
        const { result, duration } = await this.measureTime(fn);
        if (duration > maxDuration) {
            throw new Error(`${operation} took ${duration}ms, expected < ${maxDuration}ms`);
        }
        return result;
    }
};

/**
 * Error simulation helpers
 */
export const ErrorHelpers = {
    /**
     * Creates a mock that fails after N successful calls
     */
    createFailAfterN: (n: number, errorMessage: string = 'Simulated failure') => {
        let callCount = 0;
        return sinon.stub().callsFake(() => {
            callCount++;
            if (callCount > n) {
                throw new Error(errorMessage);
            }
            return Promise.resolve({ stdout: JSON.stringify(MockSfCliResponses.metadata()) });
        });
    },

    /**
     * Creates a mock that randomly fails with given probability
     */
    createRandomFailure: (failureProbability: number = 0.3, errorMessage: string = 'Random failure') => {
        return sinon.stub().callsFake(() => {
            if (Math.random() < failureProbability) {
                throw new Error(errorMessage);
            }
            return Promise.resolve({ stdout: JSON.stringify(MockSfCliResponses.metadata()) });
        });
    }
};

/**
 * Cleanup helper for tests
 */
export function cleanupTest() {
    sinon.restore();
}
import * as assert from 'assert';
import * as sinon from 'sinon';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SourceRetrievalService } from '../../services/SourceRetrievalService';
import { ManifestManager } from '../../services/ManifestManager';
import { SalesforceOrg, OrgFile } from '../../types';
import * as vscode from 'vscode';

suite('SourceRetrievalService Tests', () => {
    let sourceRetrieval: SourceRetrievalService;
    let mockSpawn: sinon.SinonStub;
    let mockExists: sinon.SinonStub;
    let mockMkdir: sinon.SinonStub;
    let mockWriteFile: sinon.SinonStub;
    let mockReadFile: sinon.SinonStub;
    let mockRmSync: sinon.SinonStub;
    let mockReaddir: sinon.SinonStub;
    let mockStat: sinon.SinonStub;

    const sampleOrg: SalesforceOrg = {
        id: 'test-org-123',
        username: 'test@example.com',
        alias: 'test-org',
        instanceUrl: 'https://test.salesforce.com',
        accessToken: 'test-token'
    };

    const sampleOrgFile: OrgFile = {
        id: 'test-file-123',
        name: 'TestClass.cls',
        type: 'ApexClass',
        fullName: 'TestClass',
        orgId: 'test-org-123',
        filePath: '/tmp/sf-org-compare/org-test-org-123/force-app/main/default/classes/TestClass.cls'
    };

    setup(() => {
        sinon.reset();
        
        // Create mock context
        const mockContext = {
            globalState: {
                get: sinon.stub().returns({}),
                update: sinon.stub().resolves()
            }
        } as any as vscode.ExtensionContext;
        
        const manifestManager = new ManifestManager(mockContext);
        sourceRetrieval = new SourceRetrievalService(manifestManager);

        // Mock spawn for SF CLI commands
        mockSpawn = sinon.stub(require('child_process'), 'spawn');
        
        // Mock file system operations
        mockExists = sinon.stub(fs, 'existsSync');
        mockMkdir = sinon.stub(fs, 'mkdirSync');
        mockWriteFile = sinon.stub(fs.promises, 'writeFile');
        mockReadFile = sinon.stub(fs.promises, 'readFile');
        mockRmSync = sinon.stub(fs, 'rmSync');
        mockReaddir = sinon.stub(fs.promises, 'readdir');
        mockStat = sinon.stub(fs.promises, 'stat');
    });

    teardown(() => {
        sinon.restore();
    });

    suite('CLI Detection', () => {
        test('should detect sf CLI command', async () => {
            // Mock successful sf --version call
            const mockProcess = {
                on: sinon.stub(),
                kill: sinon.stub(),
                stdout: { on: sinon.stub() },
                stderr: { on: sinon.stub() }
            };
            
            mockSpawn.returns(mockProcess);
            
            // Simulate successful process completion
            mockProcess.on.withArgs('close').callsArgWith(1, 0);
            
            try {
                await sourceRetrieval.retrieveOrgSource(sampleOrg);
            } catch (error) {
                // Expected to fail at later stage, but should pass CLI detection
            }
            
            assert.ok(mockSpawn.calledWith('sf', ['--version']));
        });

        test('should detect sfdx CLI as fallback', async () => {
            // Mock sf failing, sfdx succeeding
            let callCount = 0;
            const mockProcessFail = {
                on: sinon.stub(),
                kill: sinon.stub(),
                stdout: { on: sinon.stub() },
                stderr: { on: sinon.stub() }
            };
            
            const mockProcessSuccess = {
                on: sinon.stub(),
                kill: sinon.stub(),
                stdout: { on: sinon.stub() },
                stderr: { on: sinon.stub() }
            };
            
            mockSpawn.callsFake((cmd) => {
                if (cmd === 'sf' && callCount === 0) {
                    callCount++;
                    mockProcessFail.on.withArgs('close').callsArgWith(1, 1); // Fail
                    return mockProcessFail;
                } else if (cmd === 'sfdx') {
                    mockProcessSuccess.on.withArgs('close').callsArgWith(1, 0); // Success
                    return mockProcessSuccess;
                }
                return mockProcessFail;
            });
            
            try {
                await sourceRetrieval.retrieveOrgSource(sampleOrg);
            } catch (error) {
                // Expected to fail at later stage
            }
            
            assert.ok(mockSpawn.calledWith('sf', ['--version']));
            assert.ok(mockSpawn.calledWith('sfdx', ['--version']));
        });

        test('should throw error when no CLI found', async () => {
            // Mock both sf and sfdx failing
            const mockProcess = {
                on: sinon.stub(),
                kill: sinon.stub(),
                stdout: { on: sinon.stub() },
                stderr: { on: sinon.stub() }
            };
            
            mockSpawn.returns(mockProcess);
            mockProcess.on.withArgs('close').callsArgWith(1, 1); // Both fail
            
            try {
                await sourceRetrieval.retrieveOrgSource(sampleOrg);
                assert.fail('Should have thrown error');
            } catch (error: any) {
                assert.ok(error.message.includes('Salesforce CLI not found'));
            }
        });
    });

    suite('Project Structure Creation', () => {
        test('should create sfdx-project.json', async () => {
            // Mock CLI detection success
            const mockProcess = {
                on: sinon.stub(),
                kill: sinon.stub(),
                stdout: { on: sinon.stub() },
                stderr: { on: sinon.stub() }
            };
            
            mockSpawn.returns(mockProcess);
            mockProcess.on.withArgs('close').callsArgWith(1, 0);
            
            mockExists.returns(false); // sfdx-project.json doesn't exist
            mockWriteFile.resolves();
            mockMkdir.returns(true);
            
            try {
                await sourceRetrieval.retrieveOrgSource(sampleOrg);
            } catch (error) {
                // Expected to fail at SF CLI execution
            }
            
            // Verify sfdx-project.json creation
            assert.ok(mockWriteFile.called);
            const writeFileCall = mockWriteFile.getCall(0);
            const projectConfig = JSON.parse(writeFileCall.args[1]);
            assert.ok(projectConfig.sourceApiVersion); // Should use configured API version
            assert.strictEqual(projectConfig.packageDirectories[0].path, 'force-app');
        });

        test('should create directory structure', async () => {
            const mockProcess = {
                on: sinon.stub(),
                kill: sinon.stub(),
                stdout: { on: sinon.stub() },
                stderr: { on: sinon.stub() }
            };
            
            mockSpawn.returns(mockProcess);
            mockProcess.on.withArgs('close').callsArgWith(1, 0);
            
            mockExists.returns(true); // Directories exist
            mockWriteFile.resolves();
            
            try {
                await sourceRetrieval.retrieveOrgSource(sampleOrg);
            } catch (error) {
                // Expected to fail at SF CLI execution
            }
            
            // Verify directory creation calls
            assert.ok(mockMkdir.called);
        });
    });

    suite('Manifest Creation', () => {
        test('should create comprehensive package.xml', async () => {
            const mockProcess = {
                on: sinon.stub(),
                kill: sinon.stub(),
                stdout: { on: sinon.stub() },
                stderr: { on: sinon.stub() }
            };
            
            mockSpawn.returns(mockProcess);
            mockProcess.on.withArgs('close').callsArgWith(1, 0);
            
            mockExists.returns(true);
            mockWriteFile.resolves();
            
            try {
                await sourceRetrieval.retrieveOrgSource(sampleOrg);
            } catch (error) {
                // Expected to fail at SF CLI execution
            }
            
            // Verify manifest creation
            const manifestCall = mockWriteFile.getCalls().find(call => 
                call.args[0].includes('package.xml')
            );
            assert.ok(manifestCall);
            
            const manifestContent = manifestCall.args[1];
            assert.ok(manifestContent.includes('<name>ApexClass</name>'));
            assert.ok(manifestContent.includes('<name>LightningComponentBundle</name>'));
            assert.ok(manifestContent.includes('<name>CustomObject</name>'));
            assert.ok(manifestContent.includes('<version>')); // Should use configured API version
        });
    });

    suite('Source Retrieval Execution', () => {
        test('should execute sf project retrieve start command', async () => {
            // Mock CLI detection
            let callCount = 0;
            const mockVersionProcess = {
                on: sinon.stub(),
                kill: sinon.stub(),
                stdout: { on: sinon.stub() },
                stderr: { on: sinon.stub() }
            };
            
            const mockRetrievalProcess = {
                on: sinon.stub(),
                kill: sinon.stub(),
                stdout: { on: sinon.stub() },
                stderr: { on: sinon.stub() }
            };
            
            mockSpawn.callsFake((cmd, args) => {
                if (args && args[0] === '--version') {
                    mockVersionProcess.on.withArgs('close').callsArgWith(1, 0);
                    return mockVersionProcess;
                } else if (args && args[0] === 'project') {
                    mockRetrievalProcess.on.withArgs('close').callsArgWith(1, 0);
                    return mockRetrievalProcess;
                }
                return mockVersionProcess;
            });
            
            mockExists.returns(true);
            mockWriteFile.resolves();
            
            const result = await sourceRetrieval.retrieveOrgSource(sampleOrg);
            
            // Verify SF CLI command execution
            const retrievalCall = mockSpawn.getCalls().find(call => 
                call.args[1] && call.args[1][0] === 'project'
            );
            assert.ok(retrievalCall);
            assert.deepStrictEqual(retrievalCall.args[1], [
                'project', 'retrieve', 'start',
                '--manifest', sinon.match.string,
                '--target-org', 'test-org',
                '--json'
            ]);
            
            // Verify return path
            assert.ok(result.includes('force-app/main/default'));
        });

        test('should handle retrieval timeout', async () => {
            const mockVersionProcess = {
                on: sinon.stub(),
                kill: sinon.stub(),
                stdout: { on: sinon.stub() },
                stderr: { on: sinon.stub() }
            };
            
            const mockRetrievalProcess = {
                on: sinon.stub(),
                kill: sinon.stub(),
                stdout: { on: sinon.stub() },
                stderr: { on: sinon.stub() }
            };
            
            mockSpawn.callsFake((cmd, args) => {
                if (args && args[0] === '--version') {
                    mockVersionProcess.on.withArgs('close').callsArgWith(1, 0);
                    return mockVersionProcess;
                } else {
                    // Don't call close to simulate timeout
                    return mockRetrievalProcess;
                }
            });
            
            mockExists.returns(true);
            mockWriteFile.resolves();
            
            try {
                await sourceRetrieval.retrieveOrgSource(sampleOrg);
                assert.fail('Should have thrown timeout error');
            } catch (error: any) {
                assert.ok(error.message.includes('timeout'));
            }
        });
    });

    suite('File Content Retrieval', () => {
        test('should read file content from local path', async () => {
            const testContent = 'public class TestClass { }';
            mockExists.withArgs(sampleOrgFile.filePath).returns(true);
            mockReadFile.resolves(testContent);
            
            const content = await sourceRetrieval.getFileContent('test-org-123', sampleOrgFile);
            
            assert.strictEqual(content, testContent);
            assert.ok(mockReadFile.calledWith(sampleOrgFile.filePath, 'utf8'));
        });

        test('should return empty string when file not found', async () => {
            mockExists.returns(false);
            mockReadFile.rejects(new Error('File not found'));
            
            const content = await sourceRetrieval.getFileContent('test-org-123', sampleOrgFile);
            
            assert.strictEqual(content, '');
        });

        test('should handle missing file path', async () => {
            const fileWithoutPath = { ...sampleOrgFile, filePath: undefined };
            
            try {
                await sourceRetrieval.getFileContent('test-org-123', fileWithoutPath as any);
                assert.fail('Should have thrown error');
            } catch (error: any) {
                assert.ok(error.message.includes('No file path available'));
            }
        });
    });

    suite('Cache Management', () => {
        test('should clear org cache and directory path', () => {
            // First, simulate having a cached directory
            mockExists.returns(true);
            mockRmSync.returns(true);
            
            // Set up internal state by calling getOrgTempDirectory indirectly
            sourceRetrieval.clearOrgCache('test-org-123');
            
            assert.ok(mockRmSync.calledOnce);
        });

        test('should handle cache clear when directory does not exist', () => {
            mockExists.returns(false);
            
            // Should not throw error
            sourceRetrieval.clearOrgCache('test-org-123');
            
            assert.ok(!mockRmSync.called);
        });

        test('should handle cache clear errors gracefully', () => {
            mockExists.returns(true);
            mockRmSync.throws(new Error('Permission denied'));
            
            // Should not throw error, just log warning
            sourceRetrieval.clearOrgCache('test-org-123');
            
            assert.ok(mockRmSync.calledOnce);
        });
    });

    suite('Deduplication', () => {
        test('should deduplicate concurrent retrievals for same org', async () => {
            const mockVersionProcess = {
                on: sinon.stub(),
                kill: sinon.stub(),
                stdout: { on: sinon.stub() },
                stderr: { on: sinon.stub() }
            };
            
            const mockRetrievalProcess = {
                on: sinon.stub(),
                kill: sinon.stub(),
                stdout: { on: sinon.stub() },
                stderr: { on: sinon.stub() }
            };
            
            mockSpawn.callsFake((cmd, args) => {
                if (args && args[0] === '--version') {
                    mockVersionProcess.on.withArgs('close').callsArgWith(1, 0);
                    return mockVersionProcess;
                } else {
                    // Simulate slow retrieval
                    setTimeout(() => {
                        mockRetrievalProcess.on.withArgs('close').callsArgWith(1, 0);
                    }, 100);
                    return mockRetrievalProcess;
                }
            });
            
            mockExists.returns(true);
            mockWriteFile.resolves();
            
            // Start two concurrent retrievals
            const promise1 = sourceRetrieval.retrieveOrgSource(sampleOrg);
            const promise2 = sourceRetrieval.retrieveOrgSource(sampleOrg);
            
            const [result1, result2] = await Promise.all([promise1, promise2]);
            
            // Both should return the same result
            assert.strictEqual(result1, result2);
            
            // But SF CLI should only be called once for retrieval
            const retrievalCalls = mockSpawn.getCalls().filter(call => 
                call.args[1] && call.args[1][0] === 'project'
            );
            assert.strictEqual(retrievalCalls.length, 1);
        });
    });

    suite('Error Handling', () => {
        test('should handle SF CLI execution errors', async () => {
            const mockVersionProcess = {
                on: sinon.stub(),
                kill: sinon.stub(),
                stdout: { on: sinon.stub() },
                stderr: { on: sinon.stub() }
            };
            
            const mockRetrievalProcess = {
                on: sinon.stub(),
                kill: sinon.stub(),
                stdout: { on: sinon.stub() },
                stderr: { on: sinon.stub() }
            };
            
            mockSpawn.callsFake((cmd, args) => {
                if (args && args[0] === '--version') {
                    mockVersionProcess.on.withArgs('close').callsArgWith(1, 0);
                    return mockVersionProcess;
                } else {
                    mockRetrievalProcess.on.withArgs('close').callsArgWith(1, 1); // Exit code 1
                    mockRetrievalProcess.stderr.on.withArgs('data').callsArgWith(1, 'Authentication failed');
                    return mockRetrievalProcess;
                }
            });
            
            mockExists.returns(true);
            mockWriteFile.resolves();
            
            try {
                await sourceRetrieval.retrieveOrgSource(sampleOrg);
                assert.fail('Should have thrown error');
            } catch (error: any) {
                assert.ok(error.message.includes('SFDX source retrieval failed'));
            }
        });

        test('should handle manifest creation errors', async () => {
            const mockProcess = {
                on: sinon.stub(),
                kill: sinon.stub(),
                stdout: { on: sinon.stub() },
                stderr: { on: sinon.stub() }
            };
            
            mockSpawn.returns(mockProcess);
            mockProcess.on.withArgs('close').callsArgWith(1, 0);
            
            mockExists.returns(true);
            mockWriteFile.rejects(new Error('Permission denied'));
            
            try {
                await sourceRetrieval.retrieveOrgSource(sampleOrg);
                assert.fail('Should have thrown error');
            } catch (error: any) {
                assert.ok(error.message.includes('Error retrieving source'));
            }
        });
    });

    suite('Cleanup', () => {
        test('should cleanup all temp directories', () => {
            mockExists.returns(true);
            mockRmSync.returns(true);
            
            sourceRetrieval.cleanup();
            
            assert.ok(mockRmSync.called);
        });

        test('should handle cleanup errors gracefully', () => {
            mockExists.returns(true);
            mockRmSync.throws(new Error('Permission denied'));
            
            // Should not throw error
            sourceRetrieval.cleanup();
            
            assert.ok(mockRmSync.called);
        });
    });
});
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { SalesforceOrg, OrgFile } from '../types';
import { ConfigurationManager, SF_CONFIG } from '../config';
import { ErrorHandler, ErrorType, ErrorHandlingStrategy, ErrorUtils } from '../errors/ErrorHandler';
import { ManifestManager } from './ManifestManager';

/**
 * Service for retrieving source code from Salesforce orgs using SFDX manifest approach
 */
export class SourceRetrievalService {
    private tempDir: string;
    private orgTempDirs: Map<string, string> = new Map();
    private cliCommand: string | null = null;
    private activeRetrievals: Map<string, Promise<string>> = new Map();
    private config: ConfigurationManager;
    private errorHandler: ErrorHandler;
    private manifestManager: ManifestManager;

    constructor(manifestManager: ManifestManager) {
        this.manifestManager = manifestManager;
        this.config = ConfigurationManager.getInstance();
        this.errorHandler = ErrorHandler.getInstance();
        this.tempDir = path.join(os.tmpdir(), SF_CONFIG.FS.TEMP_DIR_PREFIX);
        this.ensureTempDirectory();
    }

    /**
     * Retrieve all source files for an org using SFDX manifest and return the directory path
     */
    public async retrieveOrgSource(org: SalesforceOrg): Promise<string> {
        // Check if there's already an active retrieval for this org
        if (this.activeRetrievals.has(org.id)) {
            console.log(`⏳ DEDUPLICATION: Using existing active retrieval for org: ${org.alias || org.username}`);
            return this.activeRetrievals.get(org.id)!;
        }

        console.log(`🚀 STARTING NEW RETRIEVAL for org: ${org.alias || org.username}`);
        
        // Create the retrieval promise
        const retrievalPromise = this.performOrgRetrieval(org);
        
        // Store it as active
        this.activeRetrievals.set(org.id, retrievalPromise);
        
        try {
            const result = await retrievalPromise;
            console.log(`✅ COMPLETED RETRIEVAL for org: ${org.alias || org.username}`);
            return result;
        } catch (error) {
            // Use standardized error handling
            const standardError = this.errorHandler.standardizeError(error as Error, `retrieveOrgSource for ${org.alias || org.username}`);
            throw standardError;
        } finally {
            // Remove from active retrievals when done
            this.activeRetrievals.delete(org.id);
            console.log(`🧹 CLEANED UP RETRIEVAL for org: ${org.alias || org.username}`);
        }
    }

    /**
     * Perform the actual org source retrieval and return the directory path
     */
    private async performOrgRetrieval(org: SalesforceOrg): Promise<string> {
        const orgTempDir = this.getOrgTempDirectory(org.id);
        console.log(`Starting source retrieval for org: ${org.alias || org.username}`);

        try {
            // Ensure CLI is available
            await this.ensureCLIAvailable();

            // Initialize SFDX project structure if needed
            await this.ensureProjectStructure(orgTempDir);

            // Create package.xml manifest using ManifestManager
            console.log(`🚨 ABOUT TO CALL createManifest for org: ${org.alias || org.username}`);
            const manifestPath = await this.createManifest(org, orgTempDir);
            console.log(`🚨 RETURNED FROM createManifest: ${manifestPath}`);

            // Retrieve source using manifest
            await this.executeSourceRetrieval(org, manifestPath, orgTempDir);

            // Return the path to the source directory
            const sourceDir = path.join(orgTempDir, 'force-app', 'main', 'default');
            console.log(`Source retrieval complete for ${org.alias || org.username}: ${sourceDir}`);
            
            // Debug: Log what was actually retrieved
            try {
                if (fs.existsSync(sourceDir)) {
                    const retrievedDirs = fs.readdirSync(sourceDir);
                    console.log(`📁 Retrieved directories: ${retrievedDirs.join(', ')}`);
                    
                    // Look for testSuites directory specifically
                    const testSuitesDir = path.join(sourceDir, 'testSuites');
                    if (fs.existsSync(testSuitesDir)) {
                        const testSuites = fs.readdirSync(testSuitesDir);
                        console.log(`🧪 Test suites found: ${testSuites.join(', ')}`);
                    } else {
                        console.log(`❌ No testSuites directory found at: ${testSuitesDir}`);
                    }
                } else {
                    console.log(`❌ Source directory does not exist: ${sourceDir}`);
                }
            } catch (error) {
                console.warn('Error during retrieval debugging:', error);
            }

            return sourceDir;
        } catch (error) {
            console.error(`Error retrieving source for org ${org.alias || org.username}:`, error);
            
            // Create a standardized metadata retrieval error
            const standardError = ErrorUtils.createMetadataError(
                `Failed to retrieve source for org: ${error instanceof Error ? error.message : String(error)}`,
                {
                    orgId: org.id,
                    orgAlias: org.alias,
                    orgUsername: org.username
                }
            );
            
            throw new Error(standardError.userMessage || standardError.message);
        }
    }

    /**
     * Ensure proper SFDX project structure exists
     */
    private async ensureProjectStructure(orgTempDir: string): Promise<void> {
        try {
            // Create sfdx-project.json if it doesn't exist
            const projectConfigPath = path.join(orgTempDir, 'sfdx-project.json');
            if (!fs.existsSync(projectConfigPath)) {
                const projectConfig = {
                    packageDirectories: [
                        {
                            path: 'force-app',
                            default: true
                        }
                    ],
                    namespace: '',
                    sourceApiVersion: this.config.getApiVersion()
                };
                await fs.promises.writeFile(projectConfigPath, JSON.stringify(projectConfig, null, 2), 'utf8');
                console.log(`Created sfdx-project.json at: ${projectConfigPath}`);
            }

            // Create force-app directory structure
            const forceAppDir = path.join(orgTempDir, 'force-app');
            const mainDir = path.join(forceAppDir, 'main');
            const defaultDir = path.join(mainDir, 'default');
            
            this.ensureDirectory(forceAppDir);
            this.ensureDirectory(mainDir);
            this.ensureDirectory(defaultDir);
            
            console.log(`Ensured project structure in: ${orgTempDir}`);
        } catch (error) {
            console.warn('Failed to create project structure:', error);
            // Don't throw - try to continue without it
        }
    }

    /**
     * Create package.xml manifest using ManifestManager or default fallback
     */
    private async createManifest(org: SalesforceOrg, orgTempDir: string): Promise<string> {
        // Ensure the directory exists before creating the manifest
        this.ensureDirectory(orgTempDir);
        
        try {
            // EXPLICIT DEBUG: Verify ManifestManager is being used
            console.log(`🚨 USING MANIFESTMANAGER FOR ORG: ${org.alias || org.username} (${org.id})`);
            console.log(`🚨 ManifestManager instance:`, !!this.manifestManager);
            
            // Use ManifestManager to generate manifest content based on org configuration
            const manifestContent = this.manifestManager.generateManifest(org.id);
            const manifestPath = path.join(orgTempDir, 'package.xml');
            
            await fs.promises.writeFile(manifestPath, manifestContent, 'utf8');
            console.log(`📝 Manifest written to: ${manifestPath} using ManifestManager`);
            
            // Log enabled metadata types for debugging
            const enabledTypes = this.manifestManager.getEnabledMetadataTypes(org.id);
            console.log(`🔧 Enabled metadata types for ${org.alias || org.username}:`, 
                enabledTypes.map(t => t.name).join(', '));
            
            // Log the actual manifest content for debugging
            console.log(`📄 Generated manifest content:\n${manifestContent}`);
            
            // EXPLICIT DEBUG: List available metadata types from org
            await this.listOrgMetadataTypes(org, orgTempDir);
            
            return manifestPath;
        } catch (error) {
            console.error('🚨 MANIFESTMANAGER FAILED! Using fallback manifest:', error);
            console.error('🚨 This means TestSuite will NOT be included!');
            // Fallback to default manifest if ManifestManager fails
            return this.createDefaultManifest(org, orgTempDir);
        }
    }

    /**
     * Create default manifest as fallback
     */
    private async createDefaultManifest(org: SalesforceOrg, orgTempDir: string): Promise<string> {
        console.log(`🚨 CREATING DEFAULT MANIFEST (NOT using ManifestManager configuration!)`);
        const manifestContent = this.generateDefaultManifest();
        const manifestPath = path.join(orgTempDir, 'package.xml');
        
        await fs.promises.writeFile(manifestPath, manifestContent, 'utf8');
        console.log(`📝 Default manifest written to: ${manifestPath}`);
        console.log(`🚨 DEFAULT MANIFEST CONTENT:\n${manifestContent}`);
        
        return manifestPath;
    }

    /**
     * List available metadata types from the org for debugging
     */
    private async listOrgMetadataTypes(org: SalesforceOrg, orgTempDir: string): Promise<void> {
        try {
            console.log(`🔍 Listing metadata types available in org: ${org.alias || org.username}`);
            
            if (!this.cliCommand) {
                console.warn('CLI command not available for metadata type listing');
                return;
            }

            const orgIdentifier = org.alias || org.username;
            const args = [
                'org', 'list', 'metadata-types',
                '--target-org', orgIdentifier,
                '--json'
            ];

            console.log(`Executing: ${this.cliCommand} ${args.join(' ')}`);

            return new Promise((resolve) => {
                const childProcess = spawn(this.cliCommand!, args, { 
                    cwd: orgTempDir,
                    stdio: 'pipe',
                    env: { ...process.env },
                    shell: true
                });

                let stdout = '';
                let stderr = '';

                childProcess.stdout?.on('data', (data) => {
                    stdout += data.toString();
                });

                childProcess.stderr?.on('data', (data) => {
                    stderr += data.toString();
                });

                childProcess.on('close', (code: number) => {
                    if (code === 0 && stdout.trim()) {
                        try {
                            const response = JSON.parse(stdout);
                            if (response.result && response.result.metadataTypes) {
                                const testSuiteTypes = response.result.metadataTypes.filter((type: any) => 
                                    type.xmlName && type.xmlName.toLowerCase().includes('test')
                                );
                                
                                console.log(`🧪 Test-related metadata types found:`, 
                                    testSuiteTypes.map((t: any) => `${t.xmlName} (${t.directoryName})`).join(', '));
                                
                                const apexTestSuite = response.result.metadataTypes.find((type: any) => 
                                    type.xmlName === 'ApexTestSuite'
                                );
                                
                                if (apexTestSuite) {
                                    console.log(`✅ ApexTestSuite found! Directory: ${apexTestSuite.directoryName}, Suffix: ${apexTestSuite.suffix}`);
                                } else {
                                    console.log(`❌ ApexTestSuite NOT found in org metadata types`);
                                }
                            }
                        } catch (parseError) {
                            console.warn('Could not parse metadata types response:', parseError);
                        }
                    } else {
                        console.warn('Failed to list metadata types:', stderr);
                    }
                    resolve();
                });

                childProcess.on('error', (error) => {
                    console.warn('Error listing metadata types:', error);
                    resolve();
                });
                
                // Timeout after 10 seconds
                setTimeout(() => {
                    childProcess.kill();
                    resolve();
                }, 10000);
            });
        } catch (error) {
            console.warn('Error in listOrgMetadataTypes:', error);
        }
    }

    /**
     * Generate default comprehensive manifest (fallback when ManifestManager is not available)
     */
    private generateDefaultManifest(): string {
        return `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <!-- Apex Classes and Triggers -->
    <types>
        <members>*</members>
        <name>ApexClass</name>
    </types>
    <types>
        <members>*</members>
        <name>ApexTrigger</name>
    </types>
    
    <!-- Lightning Components -->
    <types>
        <members>*</members>
        <name>LightningComponentBundle</name>
    </types>
    <types>
        <members>*</members>
        <name>AuraDefinitionBundle</name>
    </types>
    
    <!-- Objects and Fields -->
    <types>
        <members>*</members>
        <name>CustomObject</name>
    </types>
    
    <!-- Flows -->
    <types>
        <members>*</members>
        <name>Flow</name>
    </types>
    
    <!-- Layouts -->
    <types>
        <members>*</members>
        <name>Layout</name>
    </types>
    
    <!-- Permission Sets -->
    <types>
        <members>*</members>
        <name>PermissionSet</name>
    </types>
    
    <version>${this.config.getApiVersion()}</version>
</Package>`;
    }

    /**
     * Ensure Salesforce CLI is available
     */
    private async ensureCLIAvailable(): Promise<void> {
        if (this.cliCommand) {
            return; // Already detected
        }

        // Try common CLI commands with shell enabled for proper PATH resolution
        const possibleCommands = ['sf', 'sfdx'];

        for (const cmd of possibleCommands) {
            if (await this.testCLICommand(cmd)) {
                this.cliCommand = cmd;
                console.log(`Found CLI command: ${cmd}`);
                return;
            }
        }

        throw new Error('Salesforce CLI not found. Please install SF CLI or ensure it is in your PATH.');
    }

    /**
     * Test if a CLI command works
     */
    private async testCLICommand(command: string): Promise<boolean> {
        return new Promise((resolve) => {
            const childProcess = spawn(command, ['--version'], { 
                stdio: 'pipe',
                env: { ...process.env }, // Inherit all environment variables including PATH
                shell: true // Enable shell for better command resolution
            });
            let resolved = false;
            
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    childProcess.kill();
                    resolve(false);
                }
            }, SF_CONFIG.TIMEOUTS.PROCESS_KILL);

            childProcess.on('close', (code: number) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    resolve(code === 0);
                }
            });

            childProcess.on('error', () => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    resolve(false);
                }
            });
        });
    }

    /**
     * Execute SFDX source retrieval using manifest
     */
    private async executeSourceRetrieval(org: SalesforceOrg, manifestPath: string, orgTempDir: string): Promise<void> {
        const orgIdentifier = org.alias || org.username;
        
        if (!this.cliCommand) {
            throw new Error('CLI command not available');
        }

        const args = [
            'project', 'retrieve', 'start',
            '--manifest', manifestPath,
            '--target-org', orgIdentifier,
            '--json'
        ];

        console.log(`Executing: ${this.cliCommand} ${args.join(' ')}`);

        return new Promise((resolve, reject) => {
            const childProcess = spawn(this.cliCommand!, args, { 
                cwd: orgTempDir,
                stdio: 'pipe',
                env: { ...process.env }, // Inherit all environment variables including PATH
                shell: true // Enable shell for better command resolution
            });

            let stdout = '';
            let stderr = '';
            let processCompleted = false;

            // Add timeout to prevent hanging
            const timeout = setTimeout(() => {
                if (!processCompleted) {
                    console.error(`Command timeout after 60 seconds for ${orgIdentifier}`);
                    childProcess.kill();
                    processCompleted = true;
                    reject(new Error('Command timeout - SF CLI command took too long to execute'));
                }
            }, this.config.getTimeout('cli_command')); // CLI command timeout

            childProcess.stdout?.on('data', (data: any) => {
                const chunk = data.toString();
                stdout += chunk;
                console.log(`STDOUT chunk: ${chunk.substring(0, 200)}...`); // Log first 200 chars
            });

            childProcess.stderr?.on('data', (data: any) => {
                const chunk = data.toString();
                stderr += chunk;
                console.log(`STDERR chunk: ${chunk.substring(0, 200)}...`); // Log first 200 chars
            });

            childProcess.on('close', (code: number) => {
                if (!processCompleted) {
                    processCompleted = true;
                    clearTimeout(timeout);
                    
                    console.log(`Process closed with code: ${code} for ${orgIdentifier}`);
                    console.log(`Full STDOUT length: ${stdout.length}`);
                    console.log(`Full STDERR length: ${stderr.length}`);
                    
                    if (code === 0) {
                        console.log(`Source retrieval successful for ${orgIdentifier}`);
                        
                        // Parse and log the JSON response for debugging
                        try {
                            if (stdout.trim()) {
                                const response = JSON.parse(stdout);
                                console.log(`📊 SFDX Response Status: ${response.status}`);
                                if (response.result) {
                                    console.log(`📦 Retrieved files count: ${response.result.length || 0}`);
                                    if (response.result.length > 0) {
                                        console.log(`📄 Retrieved files:`, response.result.map((f: any) => f.fullName || f.fileName).join(', '));
                                    }
                                }
                            }
                        } catch (parseError) {
                            console.warn('Could not parse SFDX JSON response:', parseError);
                            console.log(`Raw STDOUT: ${stdout.substring(0, 500)}...`);
                        }
                        
                        resolve();
                    } else {
                        console.error(`Source retrieval failed for ${orgIdentifier}. Exit code: ${code}`);
                        console.error(`STDERR: ${stderr}`);
                        reject(new Error(`SFDX source retrieval failed: ${stderr}`));
                    }
                }
            });

            childProcess.on('error', (error: any) => {
                if (!processCompleted) {
                    processCompleted = true;
                    clearTimeout(timeout);
                    console.error(`Process error for ${orgIdentifier}:`, error);
                    reject(new Error(`Failed to execute SFDX command: ${error.message}`));
                }
            });

            childProcess.on('exit', (code: number, signal: string) => {
                console.log(`Process exited with code: ${code}, signal: ${signal} for ${orgIdentifier}`);
            });
        });
    }


    /**
     * Get file content from retrieved source
     */
    public async getFileContent(orgId: string, file: OrgFile): Promise<string> {
        if (!file.filePath) {
            throw new Error(`No file path available for: ${file.name}`);
        }

        try {
            const content = await fs.promises.readFile(file.filePath, 'utf8');
            console.log(`Retrieved content for ${file.name}: ${content.length} characters`);
            return content;
        } catch (error) {
            console.error(`Error reading file ${file.filePath}:`, error);
            return '';
        }
    }

    /**
     * Get or create temp directory for an org
     */
    private getOrgTempDirectory(orgId: string): string {
        if (!this.orgTempDirs.has(orgId)) {
            const orgDir = path.join(this.tempDir, `org-${orgId}`);
            this.orgTempDirs.set(orgId, orgDir);
            this.ensureDirectory(orgDir);
        }
        return this.orgTempDirs.get(orgId)!;
    }

    /**
     * Ensure temp directory exists
     */
    private ensureTempDirectory(): void {
        this.ensureDirectory(this.tempDir);
    }

    /**
     * Ensure a directory exists
     */
    private ensureDirectory(dirPath: string): void {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            console.log(`Created directory: ${dirPath}`);
        }
    }

    /**
     * Clear cached files for an org (for refresh)
     */
    public clearOrgCache(orgId: string): void {
        // Clear active retrieval if any
        this.activeRetrievals.delete(orgId);
        
        const orgDir = this.orgTempDirs.get(orgId);
        if (orgDir && fs.existsSync(orgDir)) {
            try {
                fs.rmSync(orgDir, { recursive: true, force: true });
                console.log(`Cleared cache for org: ${orgId}`);
            } catch (error) {
                console.warn(`Failed to clear cache for org ${orgId}:`, error);
            }
        }
        
        // Remove the cached directory path so it gets recreated
        this.orgTempDirs.delete(orgId);
    }

    /**
     * Cleanup all temp directories
     */
    public cleanup(): void {
        try {
            if (fs.existsSync(this.tempDir)) {
                fs.rmSync(this.tempDir, { recursive: true, force: true });
                console.log('Cleaned up all temp directories');
            }
        } catch (error) {
            console.warn('Failed to cleanup temp directories:', error);
        }
    }
}
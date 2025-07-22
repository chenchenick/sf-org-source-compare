import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { SalesforceOrg, OrgFile } from '../types';

/**
 * Service for retrieving source code from Salesforce orgs using SFDX manifest approach
 */
export class SourceRetrievalService {
    private tempDir: string;
    private orgTempDirs: Map<string, string> = new Map();
    private cliCommand: string | null = null;
    private activeRetrievals: Map<string, Promise<string>> = new Map();

    constructor() {
        this.tempDir = path.join(os.tmpdir(), 'sf-org-compare');
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

            // Create package.xml manifest
            const manifestPath = await this.createManifest(orgTempDir);
            console.log(`Created manifest at: ${manifestPath}`);

            // Retrieve source using manifest
            await this.executeSourceRetrieval(org, manifestPath, orgTempDir);

            // Return the path to the source directory
            const sourceDir = path.join(orgTempDir, 'force-app', 'main', 'default');
            console.log(`Source retrieval complete for ${org.alias || org.username}: ${sourceDir}`);

            return sourceDir;
        } catch (error) {
            console.error(`Error retrieving source for org ${org.alias || org.username}:`, error);
            throw error;
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
                    sourceApiVersion: '58.0'
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
     * Create package.xml manifest for comprehensive metadata retrieval
     */
    private async createManifest(orgTempDir: string): Promise<string> {
        const manifestContent = `<?xml version="1.0" encoding="UTF-8"?>
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
    <types>
        <members>*</members>
        <name>CustomField</name>
    </types>
    
    <!-- Flows and Process Builder -->
    <types>
        <members>*</members>
        <name>Flow</name>
    </types>
    
    <!-- Layouts and Page Layouts -->
    <types>
        <members>*</members>
        <name>Layout</name>
    </types>
    
    <!-- Permission Sets and Profiles -->
    <types>
        <members>*</members>
        <name>PermissionSet</name>
    </types>
    <types>
        <members>*</members>
        <name>Profile</name>
    </types>
    
    <!-- Email Templates -->
    <types>
        <members>*</members>
        <name>EmailTemplate</name>
    </types>
    
    <!-- Reports and Dashboards -->
    <types>
        <members>*</members>
        <name>Report</name>
    </types>
    <types>
        <members>*</members>
        <name>Dashboard</name>
    </types>
    
    <!-- Static Resources -->
    <types>
        <members>*</members>
        <name>StaticResource</name>
    </types>
    
    <!-- Custom Labels and Metadata -->
    <types>
        <members>*</members>
        <name>CustomLabels</name>
    </types>
    <types>
        <members>*</members>
        <name>CustomMetadata</name>
    </types>
    
    <version>58.0</version>
</Package>`;

        const manifestPath = path.join(orgTempDir, 'package.xml');
        await fs.promises.writeFile(manifestPath, manifestContent, 'utf8');
        return manifestPath;
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
            }, 5000);

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
            }, 60000); // 60 second timeout

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
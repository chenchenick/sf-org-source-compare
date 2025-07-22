import * as vscode from 'vscode';
import { SalesforceOrg, OrgFile, MetadataQueryOptions, ProcessingResult, ContentRequest, ContentResponse } from '../types';
import { MetadataRegistry } from './MetadataRegistry';
import { ParallelProcessor } from './ParallelProcessor';
import { MetadataConfiguration } from './MetadataConfiguration';
import { SourceRetrievalService } from '../services/SourceRetrievalService';
import { ApexHandler } from './handlers/ApexHandler';
import { CustomObjectHandler } from './handlers/CustomObjectHandler';
import { LwcHandler } from './handlers/LwcHandler';
import { AuraHandler } from './handlers/AuraHandler';
import { GeneralMetadataHandler } from './handlers/GeneralMetadataHandler';

/**
 * Enhanced org manager with metadata registry and parallel processing support
 */
export class EnhancedOrgManager {
    private orgs: SalesforceOrg[] = [];
    private context: vscode.ExtensionContext;
    private registry: MetadataRegistry;
    private processor: ParallelProcessor;
    private configuration: MetadataConfiguration;
    private sourceRetrieval: SourceRetrievalService;
    private initialized: boolean = false;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.registry = MetadataRegistry.getInstance();
        this.processor = new ParallelProcessor(this.registry);
        this.configuration = MetadataConfiguration.getInstance();
        this.sourceRetrieval = new SourceRetrievalService();
        this.loadOrgs();
    }

    /**
     * Initialize the enhanced org manager
     */
    public async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        try {
            // Initialize metadata handlers
            await this.initializeMetadataHandlers();
            
            // Validate configuration
            const configErrors = this.configuration.validateConfiguration();
            if (configErrors.length > 0) {
                console.warn('Configuration validation errors:', configErrors);
                vscode.window.showWarningMessage(`Configuration has ${configErrors.length} validation errors. Check console for details.`);
            }

            this.initialized = true;
            console.log('Enhanced org manager initialized successfully');
        } catch (error) {
            console.error('Failed to initialize enhanced org manager:', error);
            throw error;
        }
    }

    /**
     * Initialize metadata handlers
     */
    private async initializeMetadataHandlers(): Promise<void> {
        // Register separate Apex handlers for classes and triggers
        const apexClassConfig = this.configuration.getHandlerConfig('ApexClass');
        const apexClassHandler = new ApexHandler(apexClassConfig, 'ApexClass');
        this.registry.registerHandler('ApexClass', apexClassHandler);

        const apexTriggerConfig = this.configuration.getHandlerConfig('ApexTrigger');
        const apexTriggerHandler = new ApexHandler(apexTriggerConfig, 'ApexTrigger');
        this.registry.registerHandler('ApexTrigger', apexTriggerHandler);

        // Register Custom Object handler
        const objectConfig = this.configuration.getHandlerConfig('CustomObject');
        const objectHandler = new CustomObjectHandler(objectConfig);
        this.registry.registerHandler('CustomObject', objectHandler);

        // Register LWC handler
        const lwcConfig = this.configuration.getHandlerConfig('LightningComponentBundle');
        const lwcHandler = new LwcHandler(lwcConfig);
        this.registry.registerHandler('LightningComponentBundle', lwcHandler);

        // Register Aura handler
        const auraConfig = this.configuration.getHandlerConfig('AuraDefinitionBundle');
        const auraHandler = new AuraHandler(auraConfig);
        this.registry.registerHandler('AuraDefinitionBundle', auraHandler);

        // Register general metadata handlers
        const generalHandlers = GeneralMetadataHandler.createHandlers(this.configuration.getHandlerConfig('PermissionSet'));
        for (const [metadataType, handler] of generalHandlers) {
            this.registry.registerHandler(metadataType, handler);
        }

        console.log(`Registered ${this.registry.getAllHandlers().size} metadata handlers`);
    }

    /**
     * Load orgs from storage (using same key as OrgManager for compatibility)
     */
    private loadOrgs(): void {
        try {
            const storedOrgs = this.context.globalState.get<SalesforceOrg[]>('salesforceOrgs', []);
            this.orgs = storedOrgs;
        } catch (error) {
            console.error('Error loading orgs:', error);
            vscode.window.showErrorMessage('Failed to load stored organizations. Starting with empty list.');
            this.orgs = [];
        }
    }

    /**
     * Save orgs to storage (using same key as OrgManager for compatibility)
     */
    private async saveOrgs(): Promise<void> {
        try {
            await this.context.globalState.update('salesforceOrgs', this.orgs);
        } catch (error) {
            console.error('Error saving orgs:', error);
            vscode.window.showErrorMessage('Failed to save organizations.');
            throw error;
        }
    }

    /**
     * Get all organizations
     */
    public getOrgs(): SalesforceOrg[] {
        return [...this.orgs];
    }

    /**
     * Get organization by ID
     */
    public getOrg(orgId: string): SalesforceOrg | undefined {
        return this.orgs.find(org => org.id === orgId);
    }

    /**
     * Add an organization
     */
    public async addOrg(org: SalesforceOrg): Promise<void> {
        const existingIndex = this.orgs.findIndex(o => o.id === org.id);
        if (existingIndex >= 0) {
            this.orgs[existingIndex] = org;
        } else {
            this.orgs.push(org);
        }
        await this.saveOrgs();
    }

    /**
     * Remove an organization
     */
    public async removeOrg(orgId: string): Promise<void> {
        this.orgs = this.orgs.filter(org => org.id !== orgId);
        await this.saveOrgs();
    }

    /**
     * Query SFDX orgs
     */
    public async querySfdxOrgs(): Promise<SalesforceOrg[]> {
        const util = require('util');
        const exec = util.promisify(require('child_process').exec);

        try {
            const { stdout } = await exec('sf org list --json');
            const result = JSON.parse(stdout);

            if (result.status !== 0) {
                throw new Error(result.message || 'SF CLI command failed');
            }

            const orgs: SalesforceOrg[] = [];

            // Process scratch orgs
            if (result.result.scratchOrgs) {
                for (const scratchOrg of result.result.scratchOrgs) {
                    orgs.push({
                        id: scratchOrg.orgId || `${scratchOrg.username}-${Date.now()}`,
                        username: scratchOrg.username,
                        alias: scratchOrg.alias,
                        instanceUrl: scratchOrg.instanceUrl || 'https://login.salesforce.com',
                        accessToken: scratchOrg.accessToken
                    });
                }
            }

            // Process non-scratch orgs
            if (result.result.nonScratchOrgs) {
                for (const nonScratchOrg of result.result.nonScratchOrgs) {
                    orgs.push({
                        id: nonScratchOrg.orgId || `${nonScratchOrg.username}-${Date.now()}`,
                        username: nonScratchOrg.username,
                        alias: nonScratchOrg.alias,
                        instanceUrl: nonScratchOrg.instanceUrl || 'https://login.salesforce.com',
                        accessToken: nonScratchOrg.accessToken
                    });
                }
            }

            return orgs;
        } catch (error) {
            console.error('Error querying SFDX orgs:', error);
            throw new Error(`Failed to query Salesforce orgs: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Authenticate an organization
     */
    public async authenticateOrg(): Promise<SalesforceOrg | undefined> {
        try {
            const availableOrgs = await this.querySfdxOrgs();
            
            if (availableOrgs.length === 0) {
                const action = await vscode.window.showInformationMessage(
                    'No authenticated orgs found. Would you like to authenticate now?',
                    'Open Terminal'
                );
                
                if (action === 'Open Terminal') {
                    vscode.commands.executeCommand('workbench.action.terminal.new');
                }
                
                return undefined;
            }

            const orgItems = availableOrgs.map(org => ({
                label: org.alias || org.username,
                description: org.username,
                org: org
            }));

            const selectedItem = await vscode.window.showQuickPick(orgItems, {
                placeHolder: 'Select an organization to add'
            });

            if (!selectedItem) {
                return undefined;
            }

            const selectedOrg = selectedItem.org;
            await this.addOrg(selectedOrg);
            vscode.window.showInformationMessage(`Added organization: ${selectedOrg.alias || selectedOrg.username}`);
            
            return selectedOrg;
        } catch (error) {
            console.error('Error authenticating org:', error);
            vscode.window.showErrorMessage(`Failed to authenticate organization: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }

    /**
     * Get org source directory using SFDX manifest approach
     */
    public async getOrgSourceDirectory(orgId: string): Promise<string> {
        if (!this.initialized) {
            await this.initialize();
        }

        const org = this.getOrg(orgId);
        if (!org) {
            throw new Error(`Organization not found: ${orgId}`);
        }

        console.log(`🎯 ENHANCED ORG MANAGER: getOrgSourceDirectory called for ${org.alias || org.username}`);

        try {
            console.log(`Retrieving source for org ${org.alias || org.username} using SFDX manifest`);
            const sourceDirectory = await this.sourceRetrieval.retrieveOrgSource(org);
            
            console.log(`Source retrieval complete for ${org.alias || org.username}: ${sourceDirectory}`);
            return sourceDirectory;
        } catch (error) {
            console.error(`SFDX manifest retrieval failed for org ${orgId}:`, error);
            throw new Error(`Failed to retrieve source: ${error instanceof Error ? error.message : String(error)}`);
        }
    }


    /**
     * Refresh source files for an org (clear cache and re-retrieve)
     */
    public async refreshOrgSource(orgId: string): Promise<string> {
        console.log(`Refreshing source for org: ${orgId}`);
        
        // Clear cached source
        this.sourceRetrieval.clearOrgCache(orgId);
        
        // Re-retrieve source
        return await this.getOrgSourceDirectory(orgId);
    }

    /**
     * Get file content directly from file path
     */
    public async getFileContent(orgId: string, filePath: string): Promise<string> {
        try {
            return await this.sourceRetrieval.getFileContent(orgId, { filePath } as OrgFile);
        } catch (error) {
            console.error(`Error retrieving file content for ${filePath}:`, error);
            return '';
        }
    }


    /**
     * Get metadata analysis for an org
     */
    public async getOrgAnalysis(orgId: string): Promise<{
        org: SalesforceOrg;
        metadataTypes: number;
        totalFiles: number;
        filesByType: Map<string, number>;
        retrievalStats: ProcessingResult<any>;
    }> {
        if (!this.initialized) {
            await this.initialize();
        }

        const org = this.getOrg(orgId);
        if (!org) {
            throw new Error(`Organization not found: ${orgId}`);
        }

        const orgIdentifier = org.alias || org.username;
        const enabledTypes = this.configuration.getEnabledTypes();

        const options: MetadataQueryOptions = {
            orgId,
            metadataTypes: enabledTypes,
            parallel: true,
            maxConcurrency: 5,
            includeManaged: false
        };

        const result = await this.processor.processMetadataTypes(orgId, orgIdentifier, options);
        
        const filesByType = new Map<string, number>();
        let totalFiles = 0;
        
        for (const typeResult of result.success) {
            filesByType.set(typeResult.type, typeResult.files.length);
            totalFiles += typeResult.files.length;
        }

        return {
            org,
            metadataTypes: result.success.length,
            totalFiles,
            filesByType,
            retrievalStats: result
        };
    }

    /**
     * Get configuration summary
     */
    public getConfigurationSummary(): {
        totalTypes: number;
        enabledTypes: number;
        handlerCount: number;
        configSummary: any;
    } {
        const configSummary = this.configuration.getConfigurationSummary();
        
        return {
            totalTypes: this.registry.getSupportedTypes().length,
            enabledTypes: this.configuration.getEnabledTypes().length,
            handlerCount: this.registry.getAllHandlers().size,
            configSummary
        };
    }

    /**
     * Refresh metadata handlers
     */
    public async refreshHandlers(): Promise<void> {
        this.initialized = false;
        await this.initialize();
    }

    /**
     * Get processing statistics
     */
    public getProcessingStats(result: ProcessingResult<any>): {
        successCount: number;
        failureCount: number;
        successRate: number;
        averageTime: number;
    } {
        return this.processor.getProcessingStats(result);
    }

    /**
     * Set processor concurrency
     */
    public setProcessorConcurrency(concurrency: number): void {
        this.processor.setDefaultConcurrency(concurrency);
    }

    /**
     * Set processor timeout
     */
    public setProcessorTimeout(timeout: number): void {
        this.processor.setDefaultTimeout(timeout);
    }

    /**
     * Get supported metadata types
     */
    public getSupportedMetadataTypes(): string[] {
        return this.registry.getSupportedTypes();
    }

    /**
     * Check if metadata type is supported
     */
    public isMetadataTypeSupported(metadataType: string): boolean {
        return this.registry.isTypeSupported(metadataType);
    }

    /**
     * Get metadata type definition
     */
    public getMetadataTypeDefinition(metadataType: string) {
        return this.registry.getDefinition(metadataType);
    }
}
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigurationManager, SF_CONFIG } from '../config';
import { ErrorHandler, ErrorUtils } from '../errors/ErrorHandler';

/**
 * Metadata type definition for manifest generation
 */
export interface MetadataType {
    name: string;
    displayName: string;
    description: string;
    category: string;
    enabled: boolean;
    members?: string[];
}

/**
 * Org-specific manifest configuration
 */
export interface OrgManifestConfig {
    orgId: string;
    orgAlias?: string;
    lastModified: Date;
    enabledMetadataTypes: string[];
    customMembers: Map<string, string[]>; // metadata type -> specific members
    apiVersion: string;
}

/**
 * Predefined metadata types available for selection
 */
export const AVAILABLE_METADATA_TYPES: MetadataType[] = [
    // Apex
    { name: 'ApexClass', displayName: 'Apex Classes', description: 'Apex class files (.cls)', category: 'Apex', enabled: true },
    { name: 'ApexTrigger', displayName: 'Apex Triggers', description: 'Apex trigger files (.trigger)', category: 'Apex', enabled: true },
    { name: 'ApexTestSuite', displayName: 'Apex Test Suites', description: 'Test suite definitions', category: 'Apex', enabled: true },
    
    // Lightning Components
    { name: 'LightningComponentBundle', displayName: 'Lightning Web Components', description: 'LWC bundles', category: 'Components', enabled: true },
    { name: 'AuraDefinitionBundle', displayName: 'Aura Components', description: 'Aura component bundles', category: 'Components', enabled: true },
    
    // Objects and Fields
    { name: 'CustomObject', displayName: 'Custom Objects', description: 'Custom object definitions', category: 'Objects', enabled: true },
    { name: 'CustomField', displayName: 'Custom Fields', description: 'Custom field definitions', category: 'Objects', enabled: false },
    { name: 'CustomMetadata', displayName: 'Custom Metadata Types', description: 'Custom metadata type definitions', category: 'Objects', enabled: false },
    
    // Flows and Automation
    { name: 'Flow', displayName: 'Flows', description: 'Flow definitions', category: 'Automation', enabled: true },
    { name: 'WorkflowRule', displayName: 'Workflow Rules', description: 'Workflow rule definitions', category: 'Automation', enabled: false },
    { name: 'ProcessBuilder', displayName: 'Process Builder', description: 'Process builder definitions', category: 'Automation', enabled: false },
    
    // User Interface
    { name: 'Layout', displayName: 'Page Layouts', description: 'Page layout definitions', category: 'UI', enabled: true },
    { name: 'ListView', displayName: 'List Views', description: 'List view definitions', category: 'UI', enabled: false },
    { name: 'FlexiPage', displayName: 'Lightning Pages', description: 'Lightning page definitions', category: 'UI', enabled: false },
    
    // Security
    { name: 'PermissionSet', displayName: 'Permission Sets', description: 'Permission set definitions', category: 'Security', enabled: true },
    { name: 'Profile', displayName: 'Profiles', description: 'Profile definitions', category: 'Security', enabled: false },
    { name: 'Role', displayName: 'Roles', description: 'Role hierarchy definitions', category: 'Security', enabled: false },
    
    // Communication
    { name: 'EmailTemplate', displayName: 'Email Templates', description: 'Email template definitions', category: 'Communication', enabled: false },
    { name: 'LetterHead', displayName: 'Letterheads', description: 'Letterhead definitions', category: 'Communication', enabled: false },
    
    // Analytics
    { name: 'Report', displayName: 'Reports', description: 'Report definitions', category: 'Analytics', enabled: false },
    { name: 'Dashboard', displayName: 'Dashboards', description: 'Dashboard definitions', category: 'Analytics', enabled: false },
    { name: 'ReportType', displayName: 'Report Types', description: 'Custom report type definitions', category: 'Analytics', enabled: false },
    
    // Static Resources
    { name: 'StaticResource', displayName: 'Static Resources', description: 'Static resource files', category: 'Resources', enabled: false },
    { name: 'ContentAsset', displayName: 'Content Assets', description: 'Content asset files', category: 'Resources', enabled: false },
    
    // Integration
    { name: 'RemoteSiteSetting', displayName: 'Remote Site Settings', description: 'Remote site setting definitions', category: 'Integration', enabled: false },
    { name: 'NamedCredential', displayName: 'Named Credentials', description: 'Named credential definitions', category: 'Integration', enabled: false },
    
    // Validation and Business Logic
    { name: 'ValidationRule', displayName: 'Validation Rules', description: 'Validation rule definitions', category: 'Business Logic', enabled: false },
    { name: 'AssignmentRule', displayName: 'Assignment Rules', description: 'Assignment rule definitions', category: 'Business Logic', enabled: false },
    { name: 'AutoResponseRule', displayName: 'Auto-Response Rules', description: 'Auto-response rule definitions', category: 'Business Logic', enabled: false }
];

/**
 * Default manifest configuration for new orgs
 */
export const DEFAULT_MANIFEST_CONFIG: Omit<OrgManifestConfig, 'orgId' | 'orgAlias'> = {
    lastModified: new Date(),
    enabledMetadataTypes: AVAILABLE_METADATA_TYPES.filter(type => type.enabled).map(type => type.name),
    customMembers: new Map(),
    apiVersion: '58.0'
};

/**
 * Service for managing org-specific manifest configurations
 */
export class ManifestManager {
    private config: ConfigurationManager;
    private errorHandler: ErrorHandler;
    private context: vscode.ExtensionContext;
    private orgConfigs: Map<string, OrgManifestConfig> = new Map();

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.config = ConfigurationManager.getInstance();
        this.errorHandler = ErrorHandler.getInstance();
        this.loadOrgConfigs();
    }

    /**
     * Get manifest configuration for an org
     */
    public getOrgManifestConfig(orgId: string, orgAlias?: string): OrgManifestConfig {
        if (!this.orgConfigs.has(orgId)) {
            // Create default configuration for new org
            const config: OrgManifestConfig = {
                orgId,
                orgAlias,
                ...DEFAULT_MANIFEST_CONFIG,
                apiVersion: this.config.getApiVersion()
            };
            this.orgConfigs.set(orgId, config);
            this.saveOrgConfigs();
        }
        return this.orgConfigs.get(orgId)!;
    }

    /**
     * Update manifest configuration for an org
     */
    public async updateOrgManifestConfig(orgId: string, updates: Partial<OrgManifestConfig>): Promise<void> {
        console.log(`🔧 UPDATING manifest config for org ${orgId}:`, updates);
        
        const existingConfig = this.getOrgManifestConfig(orgId);
        console.log(`🔧 EXISTING config:`, existingConfig.enabledMetadataTypes);
        
        const updatedConfig: OrgManifestConfig = {
            ...existingConfig,
            ...updates,
            lastModified: new Date()
        };
        
        console.log(`🔧 UPDATED config:`, updatedConfig.enabledMetadataTypes);
        
        this.orgConfigs.set(orgId, updatedConfig);
        await this.saveOrgConfigs();
        
        console.log(`✅ Configuration saved for org ${orgId}`);
    }

    /**
     * Get enabled metadata types for an org
     */
    public getEnabledMetadataTypes(orgId: string): MetadataType[] {
        const config = this.getOrgManifestConfig(orgId);
        return AVAILABLE_METADATA_TYPES.filter(type => 
            config.enabledMetadataTypes.includes(type.name)
        );
    }

    /**
     * Get available metadata types grouped by category
     */
    public getMetadataTypesByCategory(): Map<string, MetadataType[]> {
        const categories = new Map<string, MetadataType[]>();
        
        for (const type of AVAILABLE_METADATA_TYPES) {
            if (!categories.has(type.category)) {
                categories.set(type.category, []);
            }
            categories.get(type.category)!.push(type);
        }
        
        return categories;
    }

    /**
     * Generate package.xml manifest for an org
     */
    public generateManifest(orgId: string): string {
        const config = this.getOrgManifestConfig(orgId);
        const enabledTypes = this.getEnabledMetadataTypes(orgId);
        
        console.log(`🔧 DEBUG: Generating manifest for org ${orgId}`);
        console.log(`🔧 DEBUG: Config enabled types:`, config.enabledMetadataTypes);
        console.log(`🔧 DEBUG: Resolved enabled types:`, enabledTypes.map(t => t.name));
        
        let manifestContent = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">`;

        // Add each enabled metadata type
        for (const type of enabledTypes) {
            const customMembers = config.customMembers.get(type.name);
            const members = customMembers && customMembers.length > 0 ? customMembers : ['*'];
            
            manifestContent += `
    <types>`;
            
            for (const member of members) {
                manifestContent += `
        <members>${member}</members>`;
            }
            
            manifestContent += `
        <name>${type.name}</name>
    </types>`;
        }
        
        manifestContent += `
    <version>${config.apiVersion}</version>
</Package>`;

        return manifestContent;
    }

    /**
     * Save manifest to file
     */
    public async saveManifestToFile(orgId: string, filePath: string): Promise<void> {
        try {
            const manifest = this.generateManifest(orgId);
            await fs.promises.writeFile(filePath, manifest, 'utf8');
            console.log(`Manifest saved to: ${filePath}`);
        } catch (error) {
            const standardError = this.errorHandler.standardizeError(
                error as Error,
                'Manifest file save'
            );
            throw new Error(standardError.userMessage || standardError.message);
        }
    }

    /**
     * Get manifest statistics for an org
     */
    public getManifestStats(orgId: string): {
        totalAvailableTypes: number;
        enabledTypes: number;
        disabledTypes: number;
        categoriesUsed: number;
        lastModified: Date;
    } {
        const config = this.getOrgManifestConfig(orgId);
        const enabledTypes = this.getEnabledMetadataTypes(orgId);
        const categories = new Set(enabledTypes.map(type => type.category));
        
        return {
            totalAvailableTypes: AVAILABLE_METADATA_TYPES.length,
            enabledTypes: enabledTypes.length,
            disabledTypes: AVAILABLE_METADATA_TYPES.length - enabledTypes.length,
            categoriesUsed: categories.size,
            lastModified: config.lastModified
        };
    }

    /**
     * Reset manifest configuration to default for an org
     */
    public async resetToDefault(orgId: string): Promise<void> {
        const config = this.getOrgManifestConfig(orgId);
        await this.updateOrgManifestConfig(orgId, {
            enabledMetadataTypes: [...DEFAULT_MANIFEST_CONFIG.enabledMetadataTypes],
            customMembers: new Map(),
            apiVersion: this.config.getApiVersion()
        });
    }

    /**
     * Enable all metadata types for an org
     */
    public async enableAllTypes(orgId: string): Promise<void> {
        await this.updateOrgManifestConfig(orgId, {
            enabledMetadataTypes: AVAILABLE_METADATA_TYPES.map(type => type.name)
        });
    }

    /**
     * Enable only core metadata types for an org
     */
    public async enableCoreTypesOnly(orgId: string): Promise<void> {
        const coreTypes = ['ApexClass', 'ApexTrigger', 'LightningComponentBundle', 'AuraDefinitionBundle', 'CustomObject'];
        await this.updateOrgManifestConfig(orgId, {
            enabledMetadataTypes: coreTypes
        });
    }

    /**
     * Load org configurations from storage
     */
    private loadOrgConfigs(): void {
        try {
            const stored = this.context.globalState.get<Record<string, any>>('orgManifestConfigs', {});
            
            for (const [orgId, configData] of Object.entries(stored)) {
                // Convert stored data back to proper format
                const config: OrgManifestConfig = {
                    orgId,
                    orgAlias: configData.orgAlias,
                    lastModified: new Date(configData.lastModified),
                    enabledMetadataTypes: configData.enabledMetadataTypes || DEFAULT_MANIFEST_CONFIG.enabledMetadataTypes,
                    customMembers: new Map(Object.entries(configData.customMembers || {})),
                    apiVersion: configData.apiVersion || DEFAULT_MANIFEST_CONFIG.apiVersion
                };
                
                this.orgConfigs.set(orgId, config);
            }
            
            console.log(`Loaded manifest configurations for ${this.orgConfigs.size} orgs`);
        } catch (error) {
            console.error('Error loading org manifest configurations:', error);
            // Continue with empty configurations
        }
    }

    /**
     * Save org configurations to storage
     */
    private async saveOrgConfigs(): Promise<void> {
        try {
            const toStore: Record<string, any> = {};
            
            for (const [orgId, config] of this.orgConfigs.entries()) {
                toStore[orgId] = {
                    orgAlias: config.orgAlias,
                    lastModified: config.lastModified.toISOString(),
                    enabledMetadataTypes: config.enabledMetadataTypes,
                    customMembers: Object.fromEntries(config.customMembers),
                    apiVersion: config.apiVersion
                };
            }
            
            await this.context.globalState.update('orgManifestConfigs', toStore);
            console.log(`Saved manifest configurations for ${this.orgConfigs.size} orgs`);
        } catch (error) {
            console.error('Error saving org manifest configurations:', error);
        }
    }

    /**
     * Remove manifest configuration for an org
     */
    public async removeOrgConfig(orgId: string): Promise<void> {
        this.orgConfigs.delete(orgId);
        await this.saveOrgConfigs();
    }

    /**
     * Get all org IDs with manifest configurations
     */
    public getConfiguredOrgIds(): string[] {
        return Array.from(this.orgConfigs.keys());
    }
}
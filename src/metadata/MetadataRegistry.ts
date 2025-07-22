import { MetadataTypeDefinition, MetadataHandlerConfig, OrgFile, BundleContent, ProcessingResult } from '../types';
import { MetadataHandler } from './handlers/base/MetadataHandler';

/**
 * Registry for all metadata types and their handlers
 * Provides centralized management of metadata type definitions
 */
export class MetadataRegistry {
    private handlers: Map<string, MetadataHandler> = new Map();
    private definitions: Map<string, MetadataTypeDefinition> = new Map();
    private static instance: MetadataRegistry;

    private constructor() {
        this.initializeDefaultDefinitions();
    }

    /**
     * Get singleton instance of MetadataRegistry
     */
    public static getInstance(): MetadataRegistry {
        if (!MetadataRegistry.instance) {
            MetadataRegistry.instance = new MetadataRegistry();
        }
        return MetadataRegistry.instance;
    }

    /**
     * Initialize default metadata type definitions
     */
    private initializeDefaultDefinitions(): void {
        // Apex Classes
        this.definitions.set('ApexClass', {
            name: 'ApexClass',
            displayName: 'Apex Classes',
            fileExtensions: ['.cls'],
            isBundle: false,
            retrievalStrategy: 'tooling',
            sfCliMetadataType: 'ApexClass',
            supportedOperations: ['list', 'retrieve', 'query']
        });

        // Apex Triggers
        this.definitions.set('ApexTrigger', {
            name: 'ApexTrigger',
            displayName: 'Apex Triggers',
            fileExtensions: ['.trigger'],
            isBundle: false,
            retrievalStrategy: 'tooling',
            sfCliMetadataType: 'ApexTrigger',
            supportedOperations: ['list', 'retrieve', 'query']
        });

        // Custom Objects
        this.definitions.set('CustomObject', {
            name: 'CustomObject',
            displayName: 'Custom Objects',
            fileExtensions: ['.object-meta.xml'],
            isBundle: false,
            retrievalStrategy: 'retrieve',
            sfCliMetadataType: 'CustomObject',
            supportedOperations: ['list', 'retrieve'],
            children: [
                {
                    name: 'CustomField',
                    displayName: 'Custom Fields',
                    fileExtensions: ['.field-meta.xml'],
                    isBundle: false,
                    retrievalStrategy: 'retrieve',
                    supportedOperations: ['list', 'retrieve']
                },
                {
                    name: 'ValidationRule',
                    displayName: 'Validation Rules',
                    fileExtensions: ['.validationRule-meta.xml'],
                    isBundle: false,
                    retrievalStrategy: 'retrieve',
                    supportedOperations: ['list', 'retrieve']
                }
            ]
        });

        // Lightning Web Components
        this.definitions.set('LightningComponentBundle', {
            name: 'LightningComponentBundle',
            displayName: 'Lightning Web Components',
            fileExtensions: ['.js', '.html', '.css', '.js-meta.xml'],
            isBundle: true,
            retrievalStrategy: 'retrieve',
            sfCliMetadataType: 'LightningComponentBundle',
            supportedOperations: ['list', 'retrieve']
        });

        // Aura Components
        this.definitions.set('AuraDefinitionBundle', {
            name: 'AuraDefinitionBundle',
            displayName: 'Aura Components',
            fileExtensions: ['.cmp', '.js', '.css', '.auradoc', '.design', '.svg'],
            isBundle: true,
            retrievalStrategy: 'retrieve',
            sfCliMetadataType: 'AuraDefinitionBundle',
            supportedOperations: ['list', 'retrieve']
        });

        // Permission Sets
        this.definitions.set('PermissionSet', {
            name: 'PermissionSet',
            displayName: 'Permission Sets',
            fileExtensions: ['.permissionset-meta.xml'],
            isBundle: false,
            retrievalStrategy: 'retrieve',
            sfCliMetadataType: 'PermissionSet',
            supportedOperations: ['list', 'retrieve']
        });

        // Profiles
        this.definitions.set('Profile', {
            name: 'Profile',
            displayName: 'Profiles',
            fileExtensions: ['.profile-meta.xml'],
            isBundle: false,
            retrievalStrategy: 'retrieve',
            sfCliMetadataType: 'Profile',
            supportedOperations: ['list', 'retrieve']
        });

        // Custom Labels
        this.definitions.set('CustomLabels', {
            name: 'CustomLabels',
            displayName: 'Custom Labels',
            fileExtensions: ['.labels-meta.xml'],
            isBundle: false,
            retrievalStrategy: 'retrieve',
            sfCliMetadataType: 'CustomLabels',
            supportedOperations: ['list', 'retrieve']
        });

        // Custom Metadata Types
        this.definitions.set('CustomMetadata', {
            name: 'CustomMetadata',
            displayName: 'Custom Metadata Types',
            fileExtensions: ['.md-meta.xml'],
            isBundle: false,
            retrievalStrategy: 'retrieve',
            sfCliMetadataType: 'CustomMetadata',
            supportedOperations: ['list', 'retrieve']
        });

        // Flows
        this.definitions.set('Flow', {
            name: 'Flow',
            displayName: 'Flows',
            fileExtensions: ['.flow-meta.xml'],
            isBundle: false,
            retrievalStrategy: 'retrieve',
            sfCliMetadataType: 'Flow',
            supportedOperations: ['list', 'retrieve']
        });

        // Layouts
        this.definitions.set('Layout', {
            name: 'Layout',
            displayName: 'Layouts',
            fileExtensions: ['.layout-meta.xml'],
            isBundle: false,
            retrievalStrategy: 'retrieve',
            sfCliMetadataType: 'Layout',
            supportedOperations: ['list', 'retrieve']
        });

        // Email Templates
        this.definitions.set('EmailTemplate', {
            name: 'EmailTemplate',
            displayName: 'Email Templates',
            fileExtensions: ['.email-meta.xml'],
            isBundle: false,
            retrievalStrategy: 'retrieve',
            sfCliMetadataType: 'EmailTemplate',
            supportedOperations: ['list', 'retrieve']
        });

        // Static Resources
        this.definitions.set('StaticResource', {
            name: 'StaticResource',
            displayName: 'Static Resources',
            fileExtensions: ['.resource-meta.xml'],
            isBundle: false,
            retrievalStrategy: 'retrieve',
            sfCliMetadataType: 'StaticResource',
            supportedOperations: ['list', 'retrieve']
        });
    }

    /**
     * Register a metadata handler for a specific type
     */
    public registerHandler(metadataType: string, handler: MetadataHandler): void {
        this.handlers.set(metadataType, handler);
    }

    /**
     * Get handler for a specific metadata type
     */
    public getHandler(metadataType: string): MetadataHandler | undefined {
        return this.handlers.get(metadataType);
    }

    /**
     * Get all registered handlers
     */
    public getAllHandlers(): Map<string, MetadataHandler> {
        return new Map(this.handlers);
    }

    /**
     * Register a metadata type definition
     */
    public registerDefinition(definition: MetadataTypeDefinition): void {
        this.definitions.set(definition.name, definition);
    }

    /**
     * Get definition for a specific metadata type
     */
    public getDefinition(metadataType: string): MetadataTypeDefinition | undefined {
        return this.definitions.get(metadataType);
    }

    /**
     * Get all metadata type definitions
     */
    public getAllDefinitions(): Map<string, MetadataTypeDefinition> {
        return new Map(this.definitions);
    }

    /**
     * Get all supported metadata types
     */
    public getSupportedTypes(): string[] {
        return Array.from(this.definitions.keys());
    }

    /**
     * Get metadata types that support bundles
     */
    public getBundleTypes(): string[] {
        return Array.from(this.definitions.values())
            .filter(def => def.isBundle)
            .map(def => def.name);
    }

    /**
     * Get metadata types that support a specific operation
     */
    public getTypesByOperation(operation: 'list' | 'retrieve' | 'query'): string[] {
        return Array.from(this.definitions.values())
            .filter(def => def.supportedOperations.includes(operation))
            .map(def => def.name);
    }

    /**
     * Get metadata types by retrieval strategy
     */
    public getTypesByStrategy(strategy: 'tooling' | 'retrieve' | 'soql' | 'custom'): string[] {
        return Array.from(this.definitions.values())
            .filter(def => def.retrievalStrategy === strategy)
            .map(def => def.name);
    }

    /**
     * Get files for multiple metadata types in parallel
     */
    public async getFilesForTypes(
        orgId: string, 
        orgIdentifier: string, 
        metadataTypes: string[]
    ): Promise<ProcessingResult<{ type: string; files: OrgFile[] }>> {
        const startTime = Date.now();
        const results: { type: string; files: OrgFile[] }[] = [];
        const failures: { item: any; error: string }[] = [];

        // Process metadata types in parallel
        const promises = metadataTypes.map(async (type) => {
            const handler = this.getHandler(type);
            if (!handler) {
                failures.push({ item: type, error: `No handler registered for metadata type: ${type}` });
                return null;
            }

            try {
                const files = await handler.getFiles(orgId, orgIdentifier);
                return { type, files };
            } catch (error) {
                failures.push({ 
                    item: type, 
                    error: error instanceof Error ? error.message : String(error) 
                });
                return null;
            }
        });

        const typeResults = await Promise.all(promises);
        results.push(...typeResults.filter(result => result !== null) as { type: string; files: OrgFile[] }[]);

        const processingTime = Date.now() - startTime;
        
        return {
            success: results,
            failures,
            processingTime
        };
    }

    /**
     * Get content for multiple files using their respective handlers
     */
    public async getContentForFiles(
        orgId: string, 
        orgIdentifier: string, 
        files: OrgFile[]
    ): Promise<ProcessingResult<{ file: OrgFile; content: string | BundleContent }>> {
        const startTime = Date.now();
        const results: { file: OrgFile; content: string | BundleContent }[] = [];
        const failures: { item: any; error: string }[] = [];

        // Group files by metadata type
        const filesByType = new Map<string, OrgFile[]>();
        for (const file of files) {
            const typeFiles = filesByType.get(file.type) || [];
            typeFiles.push(file);
            filesByType.set(file.type, typeFiles);
        }

        // Process each metadata type in parallel
        const promises = Array.from(filesByType.entries()).map(async ([type, typeFiles]) => {
            const handler = this.getHandler(type);
            if (!handler) {
                failures.push({ item: type, error: `No handler registered for metadata type: ${type}` });
                return [];
            }

            try {
                const result = await handler.getContentParallel(orgId, orgIdentifier, typeFiles);
                failures.push(...result.failures);
                return result.success;
            } catch (error) {
                failures.push({ 
                    item: type, 
                    error: error instanceof Error ? error.message : String(error) 
                });
                return [];
            }
        });

        const typeResults = await Promise.all(promises);
        results.push(...typeResults.flat());

        const processingTime = Date.now() - startTime;
        
        return {
            success: results,
            failures,
            processingTime
        };
    }

    /**
     * Check if a metadata type is supported
     */
    public isTypeSupported(metadataType: string): boolean {
        return this.definitions.has(metadataType);
    }

    /**
     * Get default handler configuration
     */
    public getDefaultHandlerConfig(): MetadataHandlerConfig {
        return {
            enabled: true,
            parallel: true,
            maxConcurrency: 5,
            retryCount: 3,
            timeout: 30000
        };
    }

    /**
     * Clear all handlers and definitions (for testing)
     */
    public clear(): void {
        this.handlers.clear();
        this.definitions.clear();
    }
}
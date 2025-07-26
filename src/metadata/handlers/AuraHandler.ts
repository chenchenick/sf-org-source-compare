import { MetadataHandler } from './base/MetadataHandler';
import { OrgFile, BundleContent, MetadataTypeDefinition, MetadataHandlerConfig, AuraBundle } from '../../types';
import { SecureCommandExecutor } from '../../security/SecureCommandExecutor';

/**
 * Handler for Aura Components
 * Supports multi-file bundles including CMP, JS controllers, helpers, CSS, and other bundle files
 */
export class AuraHandler extends MetadataHandler {
    private readonly bundleExtensions = ['.cmp', '.js', '.css', '.auradoc', '.design', '.svg', '.renderer', '.helper'];

    constructor(config: MetadataHandlerConfig) {
        const definition: MetadataTypeDefinition = {
            name: 'AuraDefinitionBundle',
            displayName: 'Aura Components',
            fileExtensions: ['.cmp', '.js', '.css', '.auradoc', '.design', '.svg'],
            isBundle: true,
            retrievalStrategy: 'retrieve',
            supportedOperations: ['list', 'retrieve']
        };
        
        super(definition, config);
    }

    /**
     * Get Aura Component bundles from the org
     */
    public async getFiles(orgId: string, orgIdentifier: string): Promise<OrgFile[]> {
        try {
            const result = await SecureCommandExecutor.executeOrgListMetadata('AuraDefinitionBundle', orgIdentifier);
            const parsed = this.parseJsonResponse(result.stdout);

            if (!parsed.result) {
                return [];
            }

            const items = Array.isArray(parsed.result) ? parsed.result : [parsed.result];
            
            return items.map((item: any) => ({
                id: `${orgId}-aura-${item.fullName}`,
                name: `${item.fullName}`, // Aura component name without extension since it's a bundle
                type: 'AuraDefinitionBundle',
                fullName: item.fullName,
                orgId: orgId
            })).sort((a: any, b: any) => a.name.localeCompare(b.name));
        } catch (error) {
            console.error('Error retrieving Aura Component files:', error);
            throw new Error(`Failed to retrieve Aura Component files: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Get content for an Aura Component bundle
     */
    public async getContent(orgId: string, orgIdentifier: string, file: OrgFile): Promise<BundleContent> {
        try {
            // Retrieve the Aura Component bundle
            const bundleFiles = await this.retrieveAuraBundle(orgIdentifier, file);
            
            // Create bundle content
            const bundleContent: BundleContent = {
                files: bundleFiles,
                mainFile: `${file.fullName}.cmp`, // Main file is typically the component markup
                bundleType: 'aura'
            };
            
            return bundleContent;
        } catch (error) {
            console.error(`Error retrieving Aura Component bundle for ${file.name}:`, error);
            
            // Return error bundle content
            const errorContent = this.generateErrorContent(file, error);
            const errorFiles = new Map<string, string>();
            errorFiles.set(`${file.fullName}.cmp`, errorContent);
            
            return {
                files: errorFiles,
                mainFile: `${file.fullName}.cmp`,
                bundleType: 'aura'
            };
        }
    }

    /**
     * Retrieve Aura Component bundle using Tooling API
     */
    private async retrieveAuraBundle(orgIdentifier: string, file: OrgFile): Promise<Map<string, string>> {
        const bundleFiles = new Map<string, string>();
        
        try {
            // Query AuraDefinition table to get all files in the bundle
            const query = `SELECT Id, DefType, Source FROM AuraDefinition WHERE AuraDefinitionBundleId IN (SELECT Id FROM AuraDefinitionBundle WHERE DeveloperName = '${file.fullName}')`;
            const result = await SecureCommandExecutor.executeDataQuery(query, orgIdentifier, true);
            const parsed = this.parseJsonResponse(result.stdout);

            if (!parsed.result || !parsed.result.records || parsed.result.records.length === 0) {
                console.log(`No AuraDefinition records found for ${file.fullName}`);
                // If no records found via Tooling API, try to get basic component structure
                bundleFiles.set(`${file.fullName}.cmp`, this.generateDefaultCmpContent(file.fullName));
                bundleFiles.set(`${file.fullName}Controller.js`, this.generateDefaultControllerContent(file.fullName));
                bundleFiles.set(`${file.fullName}Helper.js`, this.generateDefaultHelperContent(file.fullName));
                return bundleFiles;
            }

            console.log(`Found ${parsed.result.records.length} AuraDefinition records for ${file.fullName}`);

            // Process each definition in the bundle
            for (const definition of parsed.result.records) {
                const defType = definition.DefType;
                const source = definition.Source || '';
                
                console.log(`Aura ${file.fullName} - DefType: ${defType}, Source length: ${source.length}`);
                
                // Map definition types to file names
                let fileName = '';
                switch (defType) {
                    case 'COMPONENT':
                        fileName = `${file.fullName}.cmp`;
                        break;
                    case 'CONTROLLER':
                        fileName = `${file.fullName}Controller.js`;
                        break;
                    case 'HELPER':
                        fileName = `${file.fullName}Helper.js`;
                        break;
                    case 'STYLE':
                        fileName = `${file.fullName}.css`;
                        break;
                    case 'RENDERER':
                        fileName = `${file.fullName}Renderer.js`;
                        break;
                    case 'DESIGN':
                        fileName = `${file.fullName}.design`;
                        break;
                    case 'SVG':
                        fileName = `${file.fullName}.svg`;
                        break;
                    case 'DOCUMENTATION':
                        fileName = `${file.fullName}.auradoc`;
                        break;
                    default:
                        fileName = `${file.fullName}.${defType.toLowerCase()}`;
                        break;
                }
                
                if (fileName) {
                    bundleFiles.set(fileName, source);
                    console.log(`Added file: ${fileName} with content length: ${source.length}`);
                }
            }

            // Ensure we have at least the main component file
            if (!bundleFiles.has(`${file.fullName}.cmp`)) {
                bundleFiles.set(`${file.fullName}.cmp`, this.generateDefaultCmpContent(file.fullName));
            }

            return bundleFiles;
        } catch (error) {
            console.error(`Error retrieving Aura Component bundle for ${file.fullName}:`, error);
            
            // Return minimal bundle with actual content instead of error
            bundleFiles.set(`${file.fullName}.cmp`, this.generateDefaultCmpContent(file.fullName));
            bundleFiles.set(`${file.fullName}Controller.js`, this.generateDefaultControllerContent(file.fullName));
            bundleFiles.set(`${file.fullName}Helper.js`, this.generateDefaultHelperContent(file.fullName));
            return bundleFiles;
        }
    }

    /**
     * Generate default CMP content for Aura Component
     */
    private generateDefaultCmpContent(componentName: string): string {
        return `<aura:component>
</aura:component>`;
    }

    /**
     * Generate default Controller content for Aura Component
     */
    private generateDefaultControllerContent(componentName: string): string {
        return `({})`;
    }

    /**
     * Generate default Helper content for Aura Component
     */
    private generateDefaultHelperContent(componentName: string): string {
        return `({})`;
    }

    /**
     * Generate error content when retrieval fails
     */
    private generateErrorContent(file: OrgFile, error: any): string {
        // Return empty content - no extra content added
        return ``;
    }

    /**
     * Get comprehensive Aura Component analysis
     */
    public async getAuraAnalysis(orgId: string, orgIdentifier: string): Promise<{
        components: { name: string; files: string[]; hasController: boolean; hasHelper: boolean; hasStyle: boolean }[];
        fileStats: { total: number; cmp: number; js: number; css: number; other: number; };
        bundleComplexity: { simple: number; medium: number; complex: number; };
        interfaceStats: { total: number; events: number; applications: number; };
    }> {
        try {
            const files = await this.getFiles(orgId, orgIdentifier);
            const components: { name: string; files: string[]; hasController: boolean; hasHelper: boolean; hasStyle: boolean }[] = [];
            
            let totalFiles = 0;
            let cmpFiles = 0;
            let jsFiles = 0;
            let cssFiles = 0;
            let otherFiles = 0;
            
            let simpleComponents = 0;
            let mediumComponents = 0;
            let complexComponents = 0;
            
            let totalInterfaces = 0;
            let eventComponents = 0;
            let applicationComponents = 0;

            for (const file of files) {
                try {
                    const bundleContent = await this.getContent(orgId, orgIdentifier, file);
                    const componentFiles = Array.from(bundleContent.files.keys());
                    
                    // Analyze file types
                    totalFiles += componentFiles.length;
                    cmpFiles += componentFiles.filter(f => f.endsWith('.cmp')).length;
                    jsFiles += componentFiles.filter(f => f.endsWith('.js')).length;
                    cssFiles += componentFiles.filter(f => f.endsWith('.css')).length;
                    otherFiles += componentFiles.filter(f => !f.endsWith('.cmp') && !f.endsWith('.js') && !f.endsWith('.css')).length;
                    
                    // Analyze component structure
                    const hasController = componentFiles.some(f => f.includes('Controller.js'));
                    const hasHelper = componentFiles.some(f => f.includes('Helper.js'));
                    const hasStyle = componentFiles.some(f => f.endsWith('.css'));
                    
                    // Determine complexity
                    if (componentFiles.length <= 2) {
                        simpleComponents++;
                    } else if (componentFiles.length <= 5) {
                        mediumComponents++;
                    } else {
                        complexComponents++;
                    }
                    
                    // Check if it's an interface (event or application)
                    const cmpFile = componentFiles.find(f => f.endsWith('.cmp'));
                    if (cmpFile) {
                        const cmpContent = bundleContent.files.get(cmpFile);
                        if (cmpContent) {
                            if (cmpContent.includes('aura:event')) {
                                eventComponents++;
                                totalInterfaces++;
                            } else if (cmpContent.includes('aura:application')) {
                                applicationComponents++;
                                totalInterfaces++;
                            }
                        }
                    }
                    
                    components.push({
                        name: file.fullName,
                        files: componentFiles,
                        hasController,
                        hasHelper,
                        hasStyle
                    });
                } catch (error) {
                    console.warn(`Could not analyze Aura Component ${file.fullName}:`, error);
                }
            }

            return {
                components,
                fileStats: {
                    total: totalFiles,
                    cmp: cmpFiles,
                    js: jsFiles,
                    css: cssFiles,
                    other: otherFiles
                },
                bundleComplexity: {
                    simple: simpleComponents,
                    medium: mediumComponents,
                    complex: complexComponents
                },
                interfaceStats: {
                    total: totalInterfaces,
                    events: eventComponents,
                    applications: applicationComponents
                }
            };
        } catch (error) {
            console.error('Error getting Aura Component analysis:', error);
            throw error;
        }
    }

    /**
     * Check if this handler supports the given metadata type
     */
    public supports(metadataType: string): boolean {
        return metadataType === 'AuraDefinitionBundle';
    }

    /**
     * Get supported metadata types
     */
    public getSupportedTypes(): string[] {
        return ['AuraDefinitionBundle'];
    }

    /**
     * Get Aura Component bundle structure
     */
    public async getBundleStructure(orgId: string, orgIdentifier: string, file: OrgFile): Promise<AuraBundle> {
        try {
            const bundleContent = await this.getContent(orgId, orgIdentifier, file);
            const componentFiles = Array.from(bundleContent.files.keys());
            
            return {
                componentName: file.fullName,
                files: {
                    cmp: componentFiles.find(f => f.endsWith('.cmp')),
                    controller: componentFiles.find(f => f.includes('Controller.js')),
                    helper: componentFiles.find(f => f.includes('Helper.js')),
                    style: componentFiles.find(f => f.endsWith('.css')),
                    renderer: componentFiles.find(f => f.includes('Renderer.js')),
                    design: componentFiles.find(f => f.endsWith('.design')),
                    svg: componentFiles.find(f => f.endsWith('.svg')),
                    documentation: componentFiles.find(f => f.endsWith('.auradoc')),
                    auradoc: componentFiles.find(f => f.endsWith('.auradoc'))
                }
            };
        } catch (error) {
            console.error(`Error getting Aura Component bundle structure for ${file.fullName}:`, error);
            throw error;
        }
    }

    /**
     * Get Aura Component dependencies
     */
    public async getComponentDependencies(orgId: string, orgIdentifier: string, file: OrgFile): Promise<{
        extends: string[];
        implements: string[];
        events: string[];
        components: string[];
    }> {
        try {
            const bundleContent = await this.getContent(orgId, orgIdentifier, file);
            const cmpFile = Array.from(bundleContent.files.keys()).find(f => f.endsWith('.cmp'));
            
            const dependencies = {
                extends: [] as string[],
                implements: [] as string[],
                events: [] as string[],
                components: [] as string[]
            };
            
            if (cmpFile) {
                const cmpContent = bundleContent.files.get(cmpFile);
                if (cmpContent) {
                    // Parse extends
                    const extendsMatch = cmpContent.match(/extends="([^"]+)"/g);
                    if (extendsMatch) {
                        dependencies.extends = extendsMatch.map(match => match.replace(/extends="([^"]+)"/, '$1'));
                    }
                    
                    // Parse implements
                    const implementsMatch = cmpContent.match(/implements="([^"]+)"/g);
                    if (implementsMatch) {
                        dependencies.implements = implementsMatch.map(match => match.replace(/implements="([^"]+)"/, '$1'));
                    }
                    
                    // Parse events
                    const eventMatches = cmpContent.match(/<aura:registerEvent[^>]*name="([^"]+)"/g);
                    if (eventMatches) {
                        dependencies.events = eventMatches.map(match => match.replace(/<aura:registerEvent[^>]*name="([^"]+)"/, '$1'));
                    }
                    
                    // Parse component usage
                    const componentMatches = cmpContent.match(/<c:([^>\s]+)/g);
                    if (componentMatches) {
                        dependencies.components = componentMatches.map(match => match.replace(/<c:([^>\s]+)/, '$1'));
                    }
                }
            }
            
            return dependencies;
        } catch (error) {
            console.error(`Error getting Aura Component dependencies for ${file.fullName}:`, error);
            return {
                extends: [],
                implements: [],
                events: [],
                components: []
            };
        }
    }
}
import { MetadataHandler } from './base/MetadataHandler';
import { OrgFile, BundleContent, MetadataTypeDefinition, MetadataHandlerConfig } from '../../types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * General purpose handler for metadata types that use the retrieve strategy
 * Supports Permission Sets, Profiles, Custom Labels, Flows, Layouts, Static Resources, Email Templates, etc.
 */
export class GeneralMetadataHandler extends MetadataHandler {
    private supportedTypes: string[];

    constructor(definition: MetadataTypeDefinition, config: MetadataHandlerConfig) {
        super(definition, config);
        this.supportedTypes = [definition.name];
    }

    /**
     * Create handlers for common metadata types
     */
    public static createHandlers(config: MetadataHandlerConfig): Map<string, GeneralMetadataHandler> {
        const handlers = new Map<string, GeneralMetadataHandler>();
        
        // Permission Sets
        handlers.set('PermissionSet', new GeneralMetadataHandler({
            name: 'PermissionSet',
            displayName: 'Permission Sets',
            fileExtensions: ['.permissionset-meta.xml'],
            isBundle: false,
            retrievalStrategy: 'retrieve',
            supportedOperations: ['list', 'retrieve'],
            sfCliMetadataType: 'PermissionSet'
        }, config));

        // Profiles
        handlers.set('Profile', new GeneralMetadataHandler({
            name: 'Profile',
            displayName: 'Profiles',
            fileExtensions: ['.profile-meta.xml'],
            isBundle: false,
            retrievalStrategy: 'retrieve',
            supportedOperations: ['list', 'retrieve'],
            sfCliMetadataType: 'Profile'
        }, config));

        // Custom Labels
        handlers.set('CustomLabels', new GeneralMetadataHandler({
            name: 'CustomLabels',
            displayName: 'Custom Labels',
            fileExtensions: ['.labels-meta.xml'],
            isBundle: false,
            retrievalStrategy: 'retrieve',
            supportedOperations: ['list', 'retrieve'],
            sfCliMetadataType: 'CustomLabels'
        }, config));

        // Custom Metadata Types
        handlers.set('CustomMetadata', new GeneralMetadataHandler({
            name: 'CustomMetadata',
            displayName: 'Custom Metadata Types',
            fileExtensions: ['.md-meta.xml'],
            isBundle: false,
            retrievalStrategy: 'retrieve',
            supportedOperations: ['list', 'retrieve'],
            sfCliMetadataType: 'CustomMetadata'
        }, config));

        // Flows
        handlers.set('Flow', new GeneralMetadataHandler({
            name: 'Flow',
            displayName: 'Flows',
            fileExtensions: ['.flow-meta.xml'],
            isBundle: false,
            retrievalStrategy: 'retrieve',
            supportedOperations: ['list', 'retrieve'],
            sfCliMetadataType: 'Flow'
        }, config));

        // Layouts
        handlers.set('Layout', new GeneralMetadataHandler({
            name: 'Layout',
            displayName: 'Layouts',
            fileExtensions: ['.layout-meta.xml'],
            isBundle: false,
            retrievalStrategy: 'retrieve',
            supportedOperations: ['list', 'retrieve'],
            sfCliMetadataType: 'Layout'
        }, config));

        // Email Templates
        handlers.set('EmailTemplate', new GeneralMetadataHandler({
            name: 'EmailTemplate',
            displayName: 'Email Templates',
            fileExtensions: ['.email-meta.xml'],
            isBundle: false,
            retrievalStrategy: 'retrieve',
            supportedOperations: ['list', 'retrieve'],
            sfCliMetadataType: 'EmailTemplate'
        }, config));

        // Static Resources
        handlers.set('StaticResource', new GeneralMetadataHandler({
            name: 'StaticResource',
            displayName: 'Static Resources',
            fileExtensions: ['.resource-meta.xml'],
            isBundle: false,
            retrievalStrategy: 'retrieve',
            supportedOperations: ['list', 'retrieve'],
            sfCliMetadataType: 'StaticResource'
        }, config));

        // Custom Settings
        handlers.set('CustomSetting', new GeneralMetadataHandler({
            name: 'CustomSetting',
            displayName: 'Custom Settings',
            fileExtensions: ['.object-meta.xml'],
            isBundle: false,
            retrievalStrategy: 'retrieve',
            supportedOperations: ['list', 'retrieve'],
            sfCliMetadataType: 'CustomObject'
        }, config));

        // Reports
        handlers.set('Report', new GeneralMetadataHandler({
            name: 'Report',
            displayName: 'Reports',
            fileExtensions: ['.report-meta.xml'],
            isBundle: false,
            retrievalStrategy: 'retrieve',
            supportedOperations: ['list', 'retrieve'],
            sfCliMetadataType: 'Report'
        }, config));

        // Dashboards
        handlers.set('Dashboard', new GeneralMetadataHandler({
            name: 'Dashboard',
            displayName: 'Dashboards',
            fileExtensions: ['.dashboard-meta.xml'],
            isBundle: false,
            retrievalStrategy: 'retrieve',
            supportedOperations: ['list', 'retrieve'],
            sfCliMetadataType: 'Dashboard'
        }, config));

        return handlers;
    }

    /**
     * Get metadata files from the org
     */
    public async getFiles(orgId: string, orgIdentifier: string): Promise<OrgFile[]> {
        try {
            const metadataType = this.definition.sfCliMetadataType || this.definition.name;
            const command = `sf org list metadata --metadata-type ${metadataType} --target-org "${orgIdentifier}" --json`;
            const result = await this.executeSfCommand(command);
            const parsed = this.parseJsonResponse(result.stdout);

            if (!parsed.result) {
                return [];
            }

            const items = Array.isArray(parsed.result) ? parsed.result : [parsed.result];
            
            return items.map((item: any) => ({
                id: `${orgId}-${this.definition.name.toLowerCase()}-${item.fullName}`,
                name: `${item.fullName}${this.getFileExtension()}`,
                type: this.definition.name,
                fullName: item.fullName,
                orgId: orgId
            })).sort((a: any, b: any) => a.name.localeCompare(b.name));
        } catch (error) {
            console.error(`Error retrieving ${this.definition.name} files:`, error);
            throw new Error(`Failed to retrieve ${this.definition.name} files: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Get content for a metadata file
     */
    public async getContent(orgId: string, orgIdentifier: string, file: OrgFile): Promise<string> {
        try {
            // Get and return only the raw XML content
            const xmlContent = await this.getMetadataXmlContent(orgIdentifier, file);
            return xmlContent;
        } catch (error) {
            console.error(`Error retrieving content for ${file.name}:`, error);
            return this.generateErrorContent(file, error);
        }
    }

    /**
     * Get XML content using sf project retrieve
     */
    private async getMetadataXmlContent(orgIdentifier: string, file: OrgFile): Promise<string> {
        try {
            const metadataType = this.definition.sfCliMetadataType || this.definition.name;
            const command = `sf project retrieve start --metadata "${metadataType}:${file.fullName}" --target-org "${orgIdentifier}" --json`;
            console.log(`${this.definition.name} retrieve command: ${command}`);
            const result = await this.executeSfCommand(command);
            const parsed = this.parseJsonResponse(result.stdout);

            if (!parsed.result) {
                throw new Error('No retrieve result returned');
            }

            // Try to read the retrieved XML file from common paths
            const possiblePaths = this.getPossibleMetadataFilePaths(file);

            for (const xmlPath of possiblePaths) {
                try {
                    if (fs.existsSync(xmlPath)) {
                        const content = fs.readFileSync(xmlPath, 'utf8');
                        console.log(`${this.definition.name} ${file.fullName} - Found XML at: ${xmlPath}, Content length: ${content.length}`);
                        return content;
                    }
                } catch (readError) {
                    // Continue to next path
                    continue;
                }
            }

            console.log(`${this.definition.name} ${file.fullName} - No XML file found in any expected path`);
            throw new Error('Could not find retrieved XML file');
        } catch (error) {
            console.warn(`Could not retrieve XML for ${file.fullName}:`, error);
            console.log(`${this.definition.name} ${file.fullName} - Returning empty content due to error`);
            return '';
        }
    }

    /**
     * Get possible file paths for different metadata types
     */
    private getPossibleMetadataFilePaths(file: OrgFile): string[] {
        const extension = this.getFileExtension();
        const metadataType = this.definition.name;

        switch (metadataType) {
            case 'PermissionSet':
                return [
                    `force-app/main/default/permissionsets/${file.fullName}.permissionset-meta.xml`,
                    `src/permissionsets/${file.fullName}.permissionset`,
                    `unpackaged/permissionsets/${file.fullName}.permissionset`
                ];
            case 'Profile':
                return [
                    `force-app/main/default/profiles/${file.fullName}.profile-meta.xml`,
                    `src/profiles/${file.fullName}.profile`,
                    `unpackaged/profiles/${file.fullName}.profile`
                ];
            case 'CustomLabels':
                return [
                    `force-app/main/default/labels/${file.fullName}.labels-meta.xml`,
                    `src/labels/${file.fullName}.labels`,
                    `unpackaged/labels/${file.fullName}.labels`
                ];
            case 'Flow':
                return [
                    `force-app/main/default/flows/${file.fullName}.flow-meta.xml`,
                    `src/flows/${file.fullName}.flow`,
                    `unpackaged/flows/${file.fullName}.flow`
                ];
            case 'Layout':
                return [
                    `force-app/main/default/layouts/${file.fullName}.layout-meta.xml`,
                    `src/layouts/${file.fullName}.layout`,
                    `unpackaged/layouts/${file.fullName}.layout`
                ];
            case 'EmailTemplate':
                return [
                    `force-app/main/default/email/${file.fullName}.email-meta.xml`,
                    `src/email/${file.fullName}.email`,
                    `unpackaged/email/${file.fullName}.email`
                ];
            case 'StaticResource':
                return [
                    `force-app/main/default/staticresources/${file.fullName}.resource-meta.xml`,
                    `src/staticresources/${file.fullName}.resource`,
                    `unpackaged/staticresources/${file.fullName}.resource`
                ];
            case 'Report':
                return [
                    `force-app/main/default/reports/${file.fullName}.report-meta.xml`,
                    `src/reports/${file.fullName}.report`,
                    `unpackaged/reports/${file.fullName}.report`
                ];
            case 'Dashboard':
                return [
                    `force-app/main/default/dashboards/${file.fullName}.dashboard-meta.xml`,
                    `src/dashboards/${file.fullName}.dashboard`,
                    `unpackaged/dashboards/${file.fullName}.dashboard`
                ];
            default:
                return [
                    `force-app/main/default/${metadataType.toLowerCase()}/${file.fullName}${extension}`,
                    `src/${metadataType.toLowerCase()}/${file.fullName}${extension}`,
                    `unpackaged/${metadataType.toLowerCase()}/${file.fullName}${extension}`
                ];
        }
    }

    /**
     * Enhance metadata content with additional information
     */
    private async enhanceMetadataContent(orgIdentifier: string, file: OrgFile, xmlContent: string): Promise<string> {
        const sections = [];

        // Add header with metadata information
        sections.push(this.generateMetadataHeader(file));

        // Add type-specific enhancements
        const typeSpecificContent = await this.getTypeSpecificContent(orgIdentifier, file, xmlContent);
        if (typeSpecificContent) {
            sections.push(typeSpecificContent);
        }

        // Add the raw XML content
        sections.push('<!-- Raw XML Metadata -->');
        sections.push(xmlContent);

        return sections.join('\n\n');
    }

    /**
     * Get type-specific content enhancements
     */
    private async getTypeSpecificContent(orgIdentifier: string, file: OrgFile, xmlContent: string): Promise<string | null> {
        try {
            switch (file.type) {
                case 'PermissionSet':
                    return this.getPermissionSetAnalysis(xmlContent);
                case 'Profile':
                    return this.getProfileAnalysis(xmlContent);
                case 'CustomLabels':
                    return this.getCustomLabelsAnalysis(xmlContent);
                case 'Flow':
                    return this.getFlowAnalysis(xmlContent);
                default:
                    return null;
            }
        } catch (error) {
            console.warn(`Could not get type-specific content for ${file.type}:`, error);
            return null;
        }
    }

    /**
     * Generate Permission Set analysis
     */
    private getPermissionSetAnalysis(xmlContent: string): string {
        const lines = ['<!-- Permission Set Analysis -->'];
        
        // Count permissions
        const objectPermissions = (xmlContent.match(/<objectPermissions>/g) || []).length;
        const fieldPermissions = (xmlContent.match(/<fieldPermissions>/g) || []).length;
        const userPermissions = (xmlContent.match(/<userPermissions>/g) || []).length;
        const tabSettings = (xmlContent.match(/<tabSettings>/g) || []).length;
        const recordTypeVisibilities = (xmlContent.match(/<recordTypeVisibilities>/g) || []).length;
        
        lines.push(`<!-- Object Permissions: ${objectPermissions} -->`);
        lines.push(`<!-- Field Permissions: ${fieldPermissions} -->`);
        lines.push(`<!-- User Permissions: ${userPermissions} -->`);
        lines.push(`<!-- Tab Settings: ${tabSettings} -->`);
        lines.push(`<!-- Record Type Visibilities: ${recordTypeVisibilities} -->`);
        
        return lines.join('\n');
    }

    /**
     * Generate Profile analysis
     */
    private getProfileAnalysis(xmlContent: string): string {
        const lines = ['<!-- Profile Analysis -->'];
        
        // Count profile components
        const applicationVisibilities = (xmlContent.match(/<applicationVisibilities>/g) || []).length;
        const classAccesses = (xmlContent.match(/<classAccesses>/g) || []).length;
        const fieldPermissions = (xmlContent.match(/<fieldPermissions>/g) || []).length;
        const objectPermissions = (xmlContent.match(/<objectPermissions>/g) || []).length;
        const pageAccesses = (xmlContent.match(/<pageAccesses>/g) || []).length;
        const recordTypeVisibilities = (xmlContent.match(/<recordTypeVisibilities>/g) || []).length;
        const tabVisibilities = (xmlContent.match(/<tabVisibilities>/g) || []).length;
        const userPermissions = (xmlContent.match(/<userPermissions>/g) || []).length;
        
        lines.push(`<!-- Application Visibilities: ${applicationVisibilities} -->`);
        lines.push(`<!-- Class Accesses: ${classAccesses} -->`);
        lines.push(`<!-- Field Permissions: ${fieldPermissions} -->`);
        lines.push(`<!-- Object Permissions: ${objectPermissions} -->`);
        lines.push(`<!-- Page Accesses: ${pageAccesses} -->`);
        lines.push(`<!-- Record Type Visibilities: ${recordTypeVisibilities} -->`);
        lines.push(`<!-- Tab Visibilities: ${tabVisibilities} -->`);
        lines.push(`<!-- User Permissions: ${userPermissions} -->`);
        
        return lines.join('\n');
    }

    /**
     * Generate Custom Labels analysis
     */
    private getCustomLabelsAnalysis(xmlContent: string): string {
        const lines = ['<!-- Custom Labels Analysis -->'];
        
        // Count labels
        const totalLabels = (xmlContent.match(/<labels>/g) || []).length;
        const categories = new Set();
        
        // Extract categories
        const categoryMatches = xmlContent.match(/<categories>([^<]*)<\/categories>/g);
        if (categoryMatches) {
            categoryMatches.forEach(match => {
                const category = match.replace(/<\/?categories>/g, '');
                if (category) {
                    categories.add(category);
                }
            });
        }
        
        lines.push(`<!-- Total Labels: ${totalLabels} -->`);
        lines.push(`<!-- Categories: ${categories.size} -->`);
        if (categories.size > 0) {
            lines.push(`<!-- Category List: ${Array.from(categories).join(', ')} -->`);
        }
        
        return lines.join('\n');
    }

    /**
     * Generate Flow analysis
     */
    private getFlowAnalysis(xmlContent: string): string {
        const lines = ['<!-- Flow Analysis -->'];
        
        // Count flow elements
        const assignments = (xmlContent.match(/<assignments>/g) || []).length;
        const decisions = (xmlContent.match(/<decisions>/g) || []).length;
        const loops = (xmlContent.match(/<loops>/g) || []).length;
        const recordCreates = (xmlContent.match(/<recordCreates>/g) || []).length;
        const recordUpdates = (xmlContent.match(/<recordUpdates>/g) || []).length;
        const recordDeletes = (xmlContent.match(/<recordDeletes>/g) || []).length;
        const recordLookups = (xmlContent.match(/<recordLookups>/g) || []).length;
        const screens = (xmlContent.match(/<screens>/g) || []).length;
        const subflows = (xmlContent.match(/<subflows>/g) || []).length;
        
        lines.push(`<!-- Assignments: ${assignments} -->`);
        lines.push(`<!-- Decisions: ${decisions} -->`);
        lines.push(`<!-- Loops: ${loops} -->`);
        lines.push(`<!-- Record Creates: ${recordCreates} -->`);
        lines.push(`<!-- Record Updates: ${recordUpdates} -->`);
        lines.push(`<!-- Record Deletes: ${recordDeletes} -->`);
        lines.push(`<!-- Record Lookups: ${recordLookups} -->`);
        lines.push(`<!-- Screens: ${screens} -->`);
        lines.push(`<!-- Subflows: ${subflows} -->`);
        
        const totalElements = assignments + decisions + loops + recordCreates + recordUpdates + recordDeletes + recordLookups + screens + subflows;
        lines.push(`<!-- Total Elements: ${totalElements} -->`);
        
        return lines.join('\n');
    }

    /**
     * Generate placeholder content when XML cannot be retrieved
     */
    private generatePlaceholderContent(file: OrgFile): string {
        const extension = this.getFileExtension();
        const rootElement = this.getRootElementName();
        
        return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  ${this.definition.displayName}: ${file.fullName}
  Retrieved: ${new Date().toISOString()}
  
  This is a placeholder as the actual metadata content could not be retrieved.
  The metadata exists in the org but the content was not accessible.
-->

<${rootElement} xmlns="http://soap.sforce.com/2006/04/metadata">
    <description>Metadata retrieved from org - see comments above</description>
</${rootElement}>`;
    }

    /**
     * Get root element name for different metadata types
     */
    private getRootElementName(): string {
        switch (this.definition.name) {
            case 'PermissionSet':
                return 'PermissionSet';
            case 'Profile':
                return 'Profile';
            case 'CustomLabels':
                return 'CustomLabels';
            case 'Flow':
                return 'Flow';
            case 'Layout':
                return 'Layout';
            case 'EmailTemplate':
                return 'EmailTemplate';
            case 'StaticResource':
                return 'StaticResource';
            case 'Report':
                return 'Report';
            case 'Dashboard':
                return 'Dashboard';
            default:
                return this.definition.name;
        }
    }

    /**
     * Generate metadata header
     */
    private generateMetadataHeader(file: OrgFile): string {
        return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  ${this.definition.displayName}: ${file.fullName}
  Type: ${file.type}
  Retrieved: ${new Date().toISOString()}
-->`;
    }

    /**
     * Generate error content when retrieval fails
     */
    private generateErrorContent(file: OrgFile, error: any): string {
        // Return empty content - no extra content added
        return ``;
    }

    /**
     * Check if this handler supports the given metadata type
     */
    public supports(metadataType: string): boolean {
        return this.supportedTypes.includes(metadataType);
    }

    /**
     * Get supported metadata types
     */
    public getSupportedTypes(): string[] {
        return [...this.supportedTypes];
    }
}
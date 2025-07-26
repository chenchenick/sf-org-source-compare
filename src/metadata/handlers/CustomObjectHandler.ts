import { MetadataHandler } from './base/MetadataHandler';
import { OrgFile, BundleContent, MetadataTypeDefinition, MetadataHandlerConfig, EnhancedObjectMetadata, ValidationRule, CustomField } from '../../types';
import { SecureCommandExecutor } from '../../security/SecureCommandExecutor';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Handler for Custom Objects with enhanced metadata parsing
 * Supports CustomObject, CustomField, and ValidationRule metadata types
 */
export class CustomObjectHandler extends MetadataHandler {
    constructor(config: MetadataHandlerConfig) {
        const definition: MetadataTypeDefinition = {
            name: 'CustomObject',
            displayName: 'Custom Objects',
            fileExtensions: ['.object-meta.xml'],
            isBundle: false,
            retrievalStrategy: 'retrieve',
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
        };
        
        super(definition, config);
    }

    /**
     * Get Custom Object files from the org
     */
    public async getFiles(orgId: string, orgIdentifier: string): Promise<OrgFile[]> {
        try {
            const result = await SecureCommandExecutor.executeOrgListMetadata('CustomObject', orgIdentifier);
            const parsed = this.parseJsonResponse(result.stdout);

            if (!parsed.result) {
                return [];
            }

            const items = Array.isArray(parsed.result) ? parsed.result : [parsed.result];
            
            return items.map((item: any) => ({
                id: `${orgId}-customobject-${item.fullName}`,
                name: `${item.fullName}.object-meta.xml`,
                type: 'CustomObject',
                fullName: item.fullName,
                orgId: orgId
            })).sort((a: any, b: any) => a.name.localeCompare(b.name));
        } catch (error) {
            console.error('Error retrieving Custom Object files:', error);
            throw new Error(`Failed to retrieve Custom Object files: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Get content for a Custom Object
     */
    public async getContent(orgId: string, orgIdentifier: string, file: OrgFile): Promise<string> {
        try {
            // Get and return only the raw XML content
            const xmlContent = await this.getObjectXmlContent(orgIdentifier, file);
            return xmlContent;
        } catch (error) {
            console.error(`Error retrieving content for ${file.name}:`, error);
            return this.generateErrorContent(file, error);
        }
    }

    /**
     * Get XML content using sf project retrieve
     */
    private async getObjectXmlContent(orgIdentifier: string, file: OrgFile): Promise<string> {
        try {
            // Use sf project retrieve to get the XML metadata
            const args = [
                'project', 'retrieve', 'start',
                '--metadata', `CustomObject:${file.fullName}`,
                '--target-org', orgIdentifier,
                '--json'
            ];
            const result = await SecureCommandExecutor.executeCommand('sf', args);
            const parsed = this.parseJsonResponse(result.stdout);

            if (!parsed.result) {
                throw new Error('No retrieve result returned');
            }

            // Try to read the retrieved XML file from common paths
            const possiblePaths = [
                `force-app/main/default/objects/${file.fullName}/${file.fullName}.object-meta.xml`,
                `src/objects/${file.fullName}.object`,
                `unpackaged/objects/${file.fullName}.object`
            ];

            for (const xmlPath of possiblePaths) {
                try {
                    if (fs.existsSync(xmlPath)) {
                        const content = fs.readFileSync(xmlPath, 'utf8');
                        console.log(`CustomObject ${file.fullName} - Found XML at: ${xmlPath}, Content length: ${content.length}`);
                        return content;
                    }
                } catch (readError) {
                    // Continue to next path
                    continue;
                }
            }

            console.log(`CustomObject ${file.fullName} - No XML file found in any expected path`);
            throw new Error('Could not find retrieved XML file');
        } catch (error) {
            console.warn(`Could not retrieve XML for ${file.fullName}:`, error);
            console.log(`CustomObject ${file.fullName} - Returning empty content due to error`);
            return ''; // Return empty string if XML retrieval fails
        }
    }

    /**
     * Get enhanced metadata using describe
     */
    private async getEnhancedObjectMetadata(orgIdentifier: string, file: OrgFile): Promise<EnhancedObjectMetadata> {
        try {
            const result = await SecureCommandExecutor.executeSObjectDescribe(file.fullName, orgIdentifier);
            const parsed = this.parseJsonResponse(result.stdout);

            if (!parsed.result) {
                throw new Error('No describe result returned');
            }

            const objectInfo = parsed.result;
            
            // Extract custom fields
            const customFields: CustomField[] = [];
            if (objectInfo.fields) {
                for (const field of objectInfo.fields) {
                    if (field.custom) {
                        customFields.push({
                            fullName: field.name,
                            label: field.label,
                            type: field.type,
                            length: field.length,
                            required: !field.nillable && !field.defaultedOnCreate,
                            unique: field.unique,
                            description: field.inlineHelpText
                        });
                    }
                }
            }

            // Get validation rules
            const validationRules = await this.getValidationRules(orgIdentifier, file.fullName);

            return {
                fullName: file.fullName,
                label: objectInfo.label,
                description: objectInfo.description,
                customFields,
                validationRules,
                sharingModel: objectInfo.sharingModel,
                enableHistory: objectInfo.enableHistory,
                enableActivities: objectInfo.enableActivities,
                enableBulkApi: objectInfo.enableBulkApi,
                enableReports: objectInfo.enableReports,
                enableSearch: objectInfo.enableSearch,
                enableSharing: objectInfo.enableSharing,
                enableStreamingApi: objectInfo.enableStreamingApi
            };
        } catch (error) {
            console.warn(`Could not get enhanced metadata for ${file.fullName}:`, error);
            return {
                fullName: file.fullName,
                customFields: [],
                validationRules: []
            };
        }
    }

    /**
     * Get validation rules for an object
     */
    private async getValidationRules(orgIdentifier: string, objectName: string): Promise<ValidationRule[]> {
        try {
            const query = `SELECT Id, ValidationName, Active, Description, ErrorConditionFormula, ErrorMessage, ErrorDisplayField FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = '${objectName}'`;
            
            const result = await SecureCommandExecutor.executeDataQuery(query, orgIdentifier, true);
            const parsed = this.parseJsonResponse(result.stdout);

            if (!parsed.result || !parsed.result.records) {
                return [];
            }

            return parsed.result.records.map((record: any) => ({
                fullName: record.ValidationName,
                active: record.Active,
                description: record.Description,
                errorConditionFormula: record.ErrorConditionFormula,
                errorMessage: record.ErrorMessage,
                errorDisplayField: record.ErrorDisplayField
            }));
        } catch (error) {
            console.warn(`Could not retrieve validation rules for ${objectName}:`, error);
            return [];
        }
    }

    /**
     * Combine XML content with enhanced metadata
     */
    private combineObjectMetadata(xmlContent: string, enhancedMetadata: EnhancedObjectMetadata, file: OrgFile): string {
        const sections = [];

        // Add header with object information
        sections.push(this.generateObjectHeader(enhancedMetadata, file));

        // Add enhanced metadata summary
        sections.push(this.generateMetadataSummary(enhancedMetadata));

        // Add custom fields section
        if (enhancedMetadata.customFields && enhancedMetadata.customFields.length > 0) {
            sections.push(this.generateCustomFieldsSection(enhancedMetadata.customFields));
        }

        // Add validation rules section
        if (enhancedMetadata.validationRules && enhancedMetadata.validationRules.length > 0) {
            sections.push(this.generateValidationRulesSection(enhancedMetadata.validationRules));
        }

        // Add XML content if available
        if (xmlContent) {
            sections.push('<!-- Raw XML Metadata -->');
            sections.push(xmlContent);
        }

        return sections.join('\n\n');
    }

    /**
     * Generate object header
     */
    private generateObjectHeader(metadata: EnhancedObjectMetadata, file: OrgFile): string {
        return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  Custom Object: ${metadata.fullName}
  Label: ${metadata.label || 'N/A'}
  Description: ${metadata.description || 'N/A'}
  Retrieved: ${new Date().toISOString()}
  
  Custom Fields: ${metadata.customFields?.length || 0}
  Validation Rules: ${metadata.validationRules?.length || 0}
-->`;
    }

    /**
     * Generate metadata summary
     */
    private generateMetadataSummary(metadata: EnhancedObjectMetadata): string {
        const lines = [
            '<!--',
            '  Object Configuration:',
            `  - Sharing Model: ${metadata.sharingModel || 'N/A'}`,
            `  - Enable History: ${metadata.enableHistory ? 'Yes' : 'No'}`,
            `  - Enable Activities: ${metadata.enableActivities ? 'Yes' : 'No'}`,
            `  - Enable Bulk API: ${metadata.enableBulkApi ? 'Yes' : 'No'}`,
            `  - Enable Reports: ${metadata.enableReports ? 'Yes' : 'No'}`,
            `  - Enable Search: ${metadata.enableSearch ? 'Yes' : 'No'}`,
            `  - Enable Sharing: ${metadata.enableSharing ? 'Yes' : 'No'}`,
            `  - Enable Streaming API: ${metadata.enableStreamingApi ? 'Yes' : 'No'}`,
            '-->'
        ];
        
        return lines.join('\n');
    }

    /**
     * Generate custom fields section
     */
    private generateCustomFieldsSection(customFields: CustomField[]): string {
        const lines = [
            '<!--',
            `  Custom Fields (${customFields.length}):`
        ];

        for (const field of customFields) {
            lines.push(`  - ${field.fullName} (${field.type})`);
            lines.push(`    Label: ${field.label}`);
            lines.push(`    Required: ${field.required ? 'Yes' : 'No'}`);
            lines.push(`    Unique: ${field.unique ? 'Yes' : 'No'}`);
            if (field.length) {
                lines.push(`    Length: ${field.length}`);
            }
            if (field.description) {
                lines.push(`    Description: ${field.description}`);
            }
            lines.push('');
        }

        lines.push('-->');
        return lines.join('\n');
    }

    /**
     * Generate validation rules section
     */
    private generateValidationRulesSection(validationRules: ValidationRule[]): string {
        const lines = [
            '<!--',
            `  Validation Rules (${validationRules.length}):`
        ];

        for (const rule of validationRules) {
            lines.push(`  - ${rule.fullName}`);
            lines.push(`    Active: ${rule.active ? 'Yes' : 'No'}`);
            if (rule.description) {
                lines.push(`    Description: ${rule.description}`);
            }
            lines.push(`    Condition: ${rule.errorConditionFormula}`);
            lines.push(`    Error Message: ${rule.errorMessage}`);
            if (rule.errorDisplayField) {
                lines.push(`    Display Field: ${rule.errorDisplayField}`);
            }
            lines.push('');
        }

        lines.push('-->');
        return lines.join('\n');
    }

    /**
     * Generate error content when retrieval fails
     */
    private generateErrorContent(file: OrgFile, error: any): string {
        // Return empty content - no extra content added
        return ``;
    }

    /**
     * Get comprehensive object analysis
     */
    public async getObjectAnalysis(orgId: string, orgIdentifier: string): Promise<{
        objects: EnhancedObjectMetadata[];
        fieldStats: { total: number; required: number; unique: number; };
        validationStats: { total: number; active: number; };
        relationships: { object: string; relatedObjects: string[] }[];
    }> {
        try {
            const files = await this.getFiles(orgId, orgIdentifier);
            const objects: EnhancedObjectMetadata[] = [];
            
            let totalFields = 0;
            let requiredFields = 0;
            let uniqueFields = 0;
            let totalValidations = 0;
            let activeValidations = 0;

            for (const file of files) {
                const metadata = await this.getEnhancedObjectMetadata(orgIdentifier, file);
                objects.push(metadata);
                
                // Aggregate field statistics
                if (metadata.customFields) {
                    totalFields += metadata.customFields.length;
                    requiredFields += metadata.customFields.filter(f => f.required).length;
                    uniqueFields += metadata.customFields.filter(f => f.unique).length;
                }
                
                // Aggregate validation statistics
                if (metadata.validationRules) {
                    totalValidations += metadata.validationRules.length;
                    activeValidations += metadata.validationRules.filter(r => r.active).length;
                }
            }

            const relationships = await this.getObjectRelationships(orgIdentifier, objects);

            return {
                objects,
                fieldStats: {
                    total: totalFields,
                    required: requiredFields,
                    unique: uniqueFields
                },
                validationStats: {
                    total: totalValidations,
                    active: activeValidations
                },
                relationships
            };
        } catch (error) {
            console.error('Error getting object analysis:', error);
            throw error;
        }
    }

    /**
     * Get object relationships
     */
    private async getObjectRelationships(orgIdentifier: string, objects: EnhancedObjectMetadata[]): Promise<{ object: string; relatedObjects: string[] }[]> {
        const relationships: { object: string; relatedObjects: string[] }[] = [];
        
        for (const obj of objects) {
            const relatedObjects: string[] = [];
            
            // Look for lookup/master-detail relationships in custom fields
            if (obj.customFields) {
                for (const field of obj.customFields) {
                    if (field.type === 'reference' && field.fullName.includes('__c')) {
                        // Extract related object name from field name
                        const relatedObjectName = field.fullName.replace('__c', '');
                        if (relatedObjectName && !relatedObjects.includes(relatedObjectName)) {
                            relatedObjects.push(relatedObjectName);
                        }
                    }
                }
            }
            
            relationships.push({
                object: obj.fullName,
                relatedObjects
            });
        }
        
        return relationships;
    }

    /**
     * Check if this handler supports the given metadata type
     */
    public supports(metadataType: string): boolean {
        return metadataType === 'CustomObject' || metadataType === 'CustomField' || metadataType === 'ValidationRule';
    }

    /**
     * Get supported metadata types
     */
    public getSupportedTypes(): string[] {
        return ['CustomObject', 'CustomField', 'ValidationRule'];
    }
}
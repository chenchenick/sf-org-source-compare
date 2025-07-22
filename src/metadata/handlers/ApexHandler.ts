import { MetadataHandler } from './base/MetadataHandler';
import { OrgFile, BundleContent, MetadataTypeDefinition, MetadataHandlerConfig } from '../../types';

/**
 * Handler for Apex classes and triggers
 * Supports both ApexClass and ApexTrigger metadata types
 */
export class ApexHandler extends MetadataHandler {
    private requestedType: string;

    constructor(config: MetadataHandlerConfig, metadataType: string = 'ApexClass') {
        // This handler supports both ApexClass and ApexTrigger
        const definition: MetadataTypeDefinition = {
            name: metadataType,
            displayName: metadataType === 'ApexClass' ? 'Apex Classes' : 'Apex Triggers',
            fileExtensions: metadataType === 'ApexClass' ? ['.cls'] : ['.trigger'],
            isBundle: false,
            retrievalStrategy: 'tooling',
            supportedOperations: ['list', 'retrieve', 'query']
        };
        
        super(definition, config);
        this.requestedType = metadataType;
    }

    /**
     * Get Apex files (classes or triggers based on requested type) from the org
     */
    public async getFiles(orgId: string, orgIdentifier: string): Promise<OrgFile[]> {
        try {
            // Only get the requested type (either ApexClass or ApexTrigger)
            if (this.requestedType === 'ApexClass') {
                return await this.getApexClasses(orgId, orgIdentifier);
            } else if (this.requestedType === 'ApexTrigger') {
                return await this.getApexTriggers(orgId, orgIdentifier);
            } else {
                throw new Error(`Unsupported Apex type: ${this.requestedType}`);
            }
        } catch (error) {
            console.error(`Error retrieving ${this.requestedType} files:`, error);
            throw new Error(`Failed to retrieve ${this.requestedType} files: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Get Apex Classes from the org
     */
    private async getApexClasses(orgId: string, orgIdentifier: string): Promise<OrgFile[]> {
        const command = `sf org list metadata --metadata-type ApexClass --target-org "${orgIdentifier}" --json`;
        const result = await this.executeSfCommand(command);
        const parsed = this.parseJsonResponse(result.stdout);

        if (!parsed.result) {
            return [];
        }

        const items = Array.isArray(parsed.result) ? parsed.result : [parsed.result];
        const files: OrgFile[] = [];
        
        // For each Apex class, create both the source file and meta.xml file
        for (const item of items) {
            // Source file (.cls)
            files.push({
                id: `${orgId}-apexclass-${item.fullName}`,
                name: `${item.fullName}.cls`,
                type: 'ApexClass',
                fullName: item.fullName,
                orgId: orgId
            });
            
            // Meta.xml file
            files.push({
                id: `${orgId}-apexclass-${item.fullName}-meta`,
                name: `${item.fullName}.cls-meta.xml`,
                type: 'ApexClass',
                fullName: item.fullName,
                orgId: orgId,
                isMetaFile: true
            });
        }
        
        return files;
    }

    /**
     * Get Apex Triggers from the org
     */
    private async getApexTriggers(orgId: string, orgIdentifier: string): Promise<OrgFile[]> {
        const command = `sf org list metadata --metadata-type ApexTrigger --target-org "${orgIdentifier}" --json`;
        const result = await this.executeSfCommand(command);
        const parsed = this.parseJsonResponse(result.stdout);

        if (!parsed.result) {
            return [];
        }

        const items = Array.isArray(parsed.result) ? parsed.result : [parsed.result];
        const files: OrgFile[] = [];
        
        // For each Apex trigger, create both the source file and meta.xml file
        for (const item of items) {
            // Source file (.trigger)
            files.push({
                id: `${orgId}-apextrigger-${item.fullName}`,
                name: `${item.fullName}.trigger`,
                type: 'ApexTrigger',
                fullName: item.fullName,
                orgId: orgId
            });
            
            // Meta.xml file
            files.push({
                id: `${orgId}-apextrigger-${item.fullName}-meta`,
                name: `${item.fullName}.trigger-meta.xml`,
                type: 'ApexTrigger',
                fullName: item.fullName,
                orgId: orgId,
                isMetaFile: true
            });
        }
        
        return files;
    }

    /**
     * Get content for a specific Apex file
     */
    public async getContent(orgId: string, orgIdentifier: string, file: OrgFile): Promise<string> {
        try {
            // Handle meta.xml files
            if (file.isMetaFile) {
                return await this.getMetaXmlContent(orgIdentifier, file);
            }
            
            // Handle source files
            if (file.type === 'ApexClass') {
                return await this.getApexClassContent(orgIdentifier, file);
            } else if (file.type === 'ApexTrigger') {
                return await this.getApexTriggerContent(orgIdentifier, file);
            } else {
                throw new Error(`Unsupported Apex file type: ${file.type}`);
            }
        } catch (error) {
            console.error(`Error retrieving content for ${file.name}:`, error);
            return this.generateErrorContent(file, error);
        }
    }

    /**
     * Get Apex Class content using Tooling API
     */
    private async getApexClassContent(orgIdentifier: string, file: OrgFile): Promise<string> {
        const query = `SELECT Id, Name, Body, ApiVersion, Status, IsValid FROM ApexClass WHERE Name = '${file.fullName}'`;
        const command = `sf data query --query "${query}" --target-org "${orgIdentifier}" --use-tooling-api --json`;
        
        console.log(`ApexClass query: ${query}`);
        const result = await this.executeSfCommand(command);
        const parsed = this.parseJsonResponse(result.stdout);

        if (!parsed.result || !parsed.result.records || parsed.result.records.length === 0) {
            console.log(`No ApexClass records found for: ${file.fullName}`);
            throw new Error(`No Apex class found with name: ${file.fullName}`);
        }

        console.log(`Found ${parsed.result.records.length} ApexClass records for: ${file.fullName}`);
        const record = parsed.result.records[0];
        const body = record.Body || '';
        
        console.log(`ApexClass ${file.fullName} - Content length: ${body.length}, Status: ${record.Status}, Valid: ${record.IsValid}`);
        
        // Return only the raw body content
        return body;
    }

    /**
     * Get meta.xml content for Apex files
     */
    private async getMetaXmlContent(orgIdentifier: string, file: OrgFile): Promise<string> {
        try {
            // Use sf project retrieve to get the meta.xml file
            const metadataType = file.type; // ApexClass or ApexTrigger
            const command = `sf project retrieve start --metadata "${metadataType}:${file.fullName}" --target-org "${orgIdentifier}" --json`;
            const result = await this.executeSfCommand(command);
            const parsed = this.parseJsonResponse(result.stdout);

            if (!parsed.result) {
                throw new Error('No retrieve result returned');
            }

            // Try to read the retrieved meta.xml file from common paths
            const possiblePaths = this.getMetaXmlPaths(file);
            const fs = require('fs');

            for (const xmlPath of possiblePaths) {
                try {
                    if (fs.existsSync(xmlPath)) {
                        const content = fs.readFileSync(xmlPath, 'utf8');
                        return content;
                    }
                } catch (readError) {
                    continue;
                }
            }

            // If no file found, generate a basic meta.xml
            return this.generateBasicMetaXml(file);
        } catch (error) {
            console.warn(`Could not retrieve meta.xml for ${file.fullName}:`, error);
            return this.generateBasicMetaXml(file);
        }
    }

    /**
     * Get possible meta.xml file paths
     */
    private getMetaXmlPaths(file: OrgFile): string[] {
        const extension = file.type === 'ApexClass' ? 'cls' : 'trigger';
        return [
            `force-app/main/default/classes/${file.fullName}.${extension}-meta.xml`,
            `force-app/main/default/triggers/${file.fullName}.${extension}-meta.xml`,
            `src/classes/${file.fullName}.${extension}-meta.xml`,
            `src/triggers/${file.fullName}.${extension}-meta.xml`,
            `unpackaged/classes/${file.fullName}.${extension}-meta.xml`,
            `unpackaged/triggers/${file.fullName}.${extension}-meta.xml`
        ];
    }

    /**
     * Generate basic meta.xml content if file cannot be retrieved
     */
    private generateBasicMetaXml(file: OrgFile): string {
        const apiVersion = '58.0'; // Default API version
        return `<?xml version="1.0" encoding="UTF-8"?>
<${file.type} xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>${apiVersion}</apiVersion>
    <status>Active</status>
</${file.type}>`;
    }

    /**
     * Get Apex Trigger content using Tooling API
     */
    private async getApexTriggerContent(orgIdentifier: string, file: OrgFile): Promise<string> {
        const query = `SELECT Id, Name, Body, ApiVersion, Status, IsValid, TableEnumOrId, UsageBeforeInsert, UsageAfterInsert, UsageBeforeUpdate, UsageAfterUpdate, UsageBeforeDelete, UsageAfterDelete, UsageAfterUndelete FROM ApexTrigger WHERE Name = '${file.fullName}'`;
        const command = `sf data query --query "${query}" --target-org "${orgIdentifier}" --use-tooling-api --json`;
        
        console.log(`ApexTrigger query: ${query}`);
        const result = await this.executeSfCommand(command);
        const parsed = this.parseJsonResponse(result.stdout);

        if (!parsed.result || !parsed.result.records || parsed.result.records.length === 0) {
            console.log(`No ApexTrigger records found for: ${file.fullName}`);
            throw new Error(`No Apex trigger found with name: ${file.fullName}`);
        }

        console.log(`Found ${parsed.result.records.length} ApexTrigger records for: ${file.fullName}`);
        const record = parsed.result.records[0];
        const body = record.Body || '';
        
        console.log(`ApexTrigger ${file.fullName} - Content length: ${body.length}, Status: ${record.Status}, Object: ${record.TableEnumOrId}`);
        
        // Return only the raw body content
        return body;
    }

    /**
     * Generate metadata header for Apex files
     */
    private generateApexMetadata(record: any, type: string): string {
        const lines = [
            `/**`,
            ` * ${type}: ${record.Name}`,
            ` * API Version: ${record.ApiVersion || 'N/A'}`,
            ` * Status: ${record.Status || 'N/A'}`,
            ` * Valid: ${record.IsValid ? 'Yes' : 'No'}`,
            ` * ID: ${record.Id}`,
            ` * Retrieved: ${new Date().toISOString()}`,
            ` */`
        ];
        
        return lines.join('\n');
    }

    /**
     * Generate trigger events information
     */
    private generateTriggerEvents(record: any): string {
        const events = [];
        
        if (record.UsageBeforeInsert) events.push('before insert');
        if (record.UsageAfterInsert) events.push('after insert');
        if (record.UsageBeforeUpdate) events.push('before update');
        if (record.UsageAfterUpdate) events.push('after update');
        if (record.UsageBeforeDelete) events.push('before delete');
        if (record.UsageAfterDelete) events.push('after delete');
        if (record.UsageAfterUndelete) events.push('after undelete');
        
        const lines = [
            `/**`,
            ` * Trigger Events: ${events.join(', ') || 'None'}`,
            ` * Object: ${record.TableEnumOrId || 'Unknown'}`,
            ` */`
        ];
        
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
     * Check if this handler supports the given metadata type
     */
    public supports(metadataType: string): boolean {
        return metadataType === 'ApexClass' || metadataType === 'ApexTrigger';
    }

    /**
     * Get supported metadata types
     */
    public getSupportedTypes(): string[] {
        return ['ApexClass', 'ApexTrigger'];
    }

    /**
     * Get comprehensive Apex analysis
     */
    public async getApexAnalysis(orgId: string, orgIdentifier: string): Promise<{
        classes: { name: string; lines: number; complexity: number }[];
        triggers: { name: string; object: string; events: string[] }[];
        coverage: { name: string; coverage: number }[];
        dependencies: { name: string; dependencies: string[] }[];
    }> {
        try {
            // Get all Apex classes and triggers
            const files = await this.getFiles(orgId, orgIdentifier);
            
            const classes = files.filter(f => f.type === 'ApexClass');
            const triggers = files.filter(f => f.type === 'ApexTrigger');
            
            // Get detailed analysis for each
            const classAnalysis = await this.analyzeApexClasses(orgIdentifier, classes);
            const triggerAnalysis = await this.analyzeApexTriggers(orgIdentifier, triggers);
            
            return {
                classes: classAnalysis.classes,
                triggers: triggerAnalysis.triggers,
                coverage: classAnalysis.coverage,
                dependencies: classAnalysis.dependencies
            };
        } catch (error) {
            console.error('Error getting Apex analysis:', error);
            throw error;
        }
    }

    /**
     * Analyze Apex classes for metrics
     */
    private async analyzeApexClasses(orgIdentifier: string, classes: OrgFile[]): Promise<{
        classes: { name: string; lines: number; complexity: number }[];
        coverage: { name: string; coverage: number }[];
        dependencies: { name: string; dependencies: string[] }[];
    }> {
        const classAnalysis: { name: string; lines: number; complexity: number }[] = [];
        const coverage: { name: string; coverage: number }[] = [];
        const dependencies: { name: string; dependencies: string[] }[] = [];

        // Get class metrics
        const classNames = classes.map(c => `'${c.fullName}'`).join(', ');
        if (classNames) {
            const metricsQuery = `SELECT Name, LengthWithoutComments, NumLinesCovered, NumLinesUncovered FROM ApexClass WHERE Name IN (${classNames})`;
            const metricsCommand = `sf data query --query "${metricsQuery}" --target-org "${orgIdentifier}" --use-tooling-api --json`;
            
            try {
                const metricsResult = await this.executeSfCommand(metricsCommand);
                const metricsParsed = this.parseJsonResponse(metricsResult.stdout);
                
                if (metricsParsed.result && metricsParsed.result.records) {
                    for (const record of metricsParsed.result.records) {
                        classAnalysis.push({
                            name: record.Name,
                            lines: record.LengthWithoutComments || 0,
                            complexity: this.calculateComplexity(record.LengthWithoutComments || 0)
                        });
                        
                        const totalLines = (record.NumLinesCovered || 0) + (record.NumLinesUncovered || 0);
                        const coveragePercent = totalLines > 0 ? (record.NumLinesCovered || 0) / totalLines * 100 : 0;
                        
                        coverage.push({
                            name: record.Name,
                            coverage: Math.round(coveragePercent * 100) / 100
                        });
                    }
                }
            } catch (error) {
                console.warn('Could not retrieve class metrics:', error);
            }
        }

        return { classes: classAnalysis, coverage, dependencies };
    }

    /**
     * Analyze Apex triggers for metrics
     */
    private async analyzeApexTriggers(orgIdentifier: string, triggers: OrgFile[]): Promise<{
        triggers: { name: string; object: string; events: string[] }[];
    }> {
        const triggerAnalysis: { name: string; object: string; events: string[] }[] = [];

        const triggerNames = triggers.map(t => `'${t.fullName}'`).join(', ');
        if (triggerNames) {
            const triggerQuery = `SELECT Name, TableEnumOrId, UsageBeforeInsert, UsageAfterInsert, UsageBeforeUpdate, UsageAfterUpdate, UsageBeforeDelete, UsageAfterDelete, UsageAfterUndelete FROM ApexTrigger WHERE Name IN (${triggerNames})`;
            const triggerCommand = `sf data query --query "${triggerQuery}" --target-org "${orgIdentifier}" --use-tooling-api --json`;
            
            try {
                const triggerResult = await this.executeSfCommand(triggerCommand);
                const triggerParsed = this.parseJsonResponse(triggerResult.stdout);
                
                if (triggerParsed.result && triggerParsed.result.records) {
                    for (const record of triggerParsed.result.records) {
                        const events = [];
                        if (record.UsageBeforeInsert) events.push('before insert');
                        if (record.UsageAfterInsert) events.push('after insert');
                        if (record.UsageBeforeUpdate) events.push('before update');
                        if (record.UsageAfterUpdate) events.push('after update');
                        if (record.UsageBeforeDelete) events.push('before delete');
                        if (record.UsageAfterDelete) events.push('after delete');
                        if (record.UsageAfterUndelete) events.push('after undelete');
                        
                        triggerAnalysis.push({
                            name: record.Name,
                            object: record.TableEnumOrId || 'Unknown',
                            events
                        });
                    }
                }
            } catch (error) {
                console.warn('Could not retrieve trigger analysis:', error);
            }
        }

        return { triggers: triggerAnalysis };
    }

    /**
     * Calculate complexity based on lines of code
     */
    private calculateComplexity(lines: number): number {
        if (lines < 50) return 1;
        if (lines < 100) return 2;
        if (lines < 200) return 3;
        if (lines < 500) return 4;
        return 5;
    }
}
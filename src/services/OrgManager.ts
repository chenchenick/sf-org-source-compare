import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { SalesforceOrg, OrgFile } from '../types';

const execAsync = promisify(exec);

export class OrgManager {
    private orgs: SalesforceOrg[] = [];
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadOrgs();
    }

    private async loadOrgs(): Promise<void> {
        try {
            const storedOrgs = this.context.globalState.get<SalesforceOrg[]>('salesforceOrgs', []);
            this.orgs = storedOrgs;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load organizations: ${error}`);
        }
    }

    public async saveOrgs(): Promise<void> {
        try {
            await this.context.globalState.update('salesforceOrgs', this.orgs);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save organizations: ${error}`);
        }
    }

    public getOrgs(): SalesforceOrg[] {
        return this.orgs;
    }

    public async addOrg(org: SalesforceOrg): Promise<void> {
        const existingIndex = this.orgs.findIndex(o => o.id === org.id);
        if (existingIndex >= 0) {
            this.orgs[existingIndex] = org;
        } else {
            this.orgs.push(org);
        }
        await this.saveOrgs();
    }

    public async removeOrg(orgId: string): Promise<void> {
        this.orgs = this.orgs.filter(org => org.id !== orgId);
        await this.saveOrgs();
    }

    public getOrg(orgId: string): SalesforceOrg | undefined {
        return this.orgs.find(org => org.id === orgId);
    }

    public async querySfdxOrgs(): Promise<SalesforceOrg[]> {
        try {
            const { stdout } = await execAsync('sf org list --json');
            const result = JSON.parse(stdout);
            
            if (result.status !== 0) {
                throw new Error(result.message || 'Failed to query orgs');
            }

            const sfdxOrgs: SalesforceOrg[] = [];
            
            // Process scratch orgs
            if (result.result?.scratchOrgs) {
                for (const org of result.result.scratchOrgs) {
                    sfdxOrgs.push({
                        id: org.orgId || `${org.username}-${Date.now()}`,
                        username: org.username,
                        alias: org.alias,
                        instanceUrl: org.instanceUrl || org.loginUrl,
                        accessToken: org.accessToken
                    });
                }
            }

            // Process non-scratch orgs
            if (result.result?.nonScratchOrgs) {
                for (const org of result.result.nonScratchOrgs) {
                    sfdxOrgs.push({
                        id: org.orgId || `${org.username}-${Date.now()}`,
                        username: org.username,
                        alias: org.alias,
                        instanceUrl: org.instanceUrl || org.loginUrl,
                        accessToken: org.accessToken
                    });
                }
            }

            return sfdxOrgs;
        } catch (error) {
            console.error('Error querying SFDX orgs:', error);
            throw new Error(`Failed to query Salesforce orgs: ${error}`);
        }
    }

    public async authenticateOrg(): Promise<SalesforceOrg | undefined> {
        try {
            // Query existing orgs from SFDX
            const sfdxOrgs = await this.querySfdxOrgs();
            
            if (sfdxOrgs.length === 0) {
                const response = await vscode.window.showInformationMessage(
                    'No authenticated Salesforce orgs found. Please authenticate with SFDX first.',
                    'Open Terminal'
                );
                
                if (response === 'Open Terminal') {
                    vscode.commands.executeCommand('workbench.action.terminal.new');
                }
                return undefined;
            }

            // Show org selection
            const orgItems = sfdxOrgs.map(org => ({
                label: org.alias || org.username,
                description: org.username,
                detail: org.instanceUrl,
                org: org
            }));

            const selectedItem = await vscode.window.showQuickPick(orgItems, {
                placeHolder: 'Select a Salesforce organization',
                matchOnDescription: true,
                matchOnDetail: true
            });

            if (!selectedItem) {
                return undefined;
            }

            const selectedOrg = selectedItem.org;
            await this.addOrg(selectedOrg);
            vscode.window.showInformationMessage(`Added organization: ${selectedOrg.alias || selectedOrg.username}`);
            
            return selectedOrg;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to authenticate org: ${error}`);
            return undefined;
        }
    }

    public async getOrgFilesByType(orgId: string): Promise<Map<string, OrgFile[]>> {
        const org = this.getOrg(orgId);
        if (!org) {
            throw new Error('Organization not found');
        }

        try {
            // Use org alias/username for SFDX commands
            const orgIdentifier = org.alias || org.username;
            
            // Get list of metadata types and their members
            const metadataTypes = ['ApexClass', 'ApexTrigger', 'CustomObject', 'Flow', 'Layout', 'PermissionSet'];
            const filesByType = new Map<string, OrgFile[]>();

            for (const metadataType of metadataTypes) {
                try {
                    // Use new SF CLI v2 command
                    const { stdout } = await execAsync(`sf org list metadata --metadata-type ${metadataType} --target-org "${orgIdentifier}" --json`);
                    const result = JSON.parse(stdout);

                    if (result.status === 0 && result.result) {
                        const metadata = Array.isArray(result.result) ? result.result : [result.result];
                        const files: OrgFile[] = [];
                        
                        for (const item of metadata) {
                            const fileExtension = this.getFileExtension(metadataType);
                            files.push({
                                id: `${orgId}-${item.fullName}`,
                                name: `${item.fullName}${fileExtension}`,
                                type: metadataType,
                                fullName: item.fullName,
                                orgId
                            });
                        }
                        
                        if (files.length > 0) {
                            filesByType.set(metadataType, files.sort((a, b) => a.name.localeCompare(b.name)));
                        }
                    }
                } catch (typeError) {
                    // Skip metadata types that don't exist or can't be queried
                    console.warn(`Could not query ${metadataType} for org ${orgIdentifier}:`, typeError);
                }
            }

            return filesByType;
        } catch (error) {
            console.error('Error fetching org files:', error);
            throw new Error(`Failed to fetch files for org: ${error}`);
        }
    }

    public async getOrgFiles(orgId: string): Promise<OrgFile[]> {
        const filesByType = await this.getOrgFilesByType(orgId);
        const allFiles: OrgFile[] = [];
        
        for (const files of filesByType.values()) {
            allFiles.push(...files);
        }
        
        return allFiles.sort((a, b) => a.name.localeCompare(b.name));
    }

    private getFileExtension(metadataType: string): string {
        switch (metadataType) {
            case 'ApexClass':
                return '.cls';
            case 'ApexTrigger':
                return '.trigger';
            case 'CustomObject':
                return '.object';
            case 'Flow':
                return '.flow';
            case 'Layout':
                return '.layout';
            case 'PermissionSet':
                return '.permissionset';
            default:
                return '.xml';
        }
    }

    public async getFileContent(orgId: string, fileId: string): Promise<string> {
        const org = this.getOrg(orgId);
        if (!org) {
            throw new Error('Organization not found');
        }

        try {
            // Find the file in our stored files
            const files = await this.getOrgFiles(orgId);
            const file = files.find(f => f.id === fileId);
            
            if (!file) {
                throw new Error('File not found');
            }

            const orgIdentifier = org.alias || org.username;
            
            // Use SF CLI v2 to retrieve the actual file content
            // For Apex classes and triggers, use Tooling API
            if (file.type === 'ApexClass' || file.type === 'ApexTrigger') {
                return await this.getApexContentViaToolingAPI(file, orgIdentifier);
            } else {
                // For other metadata types, use SOQL to get metadata or describe API
                return await this.getMetadataContentViaSOQL(file, orgIdentifier);
            }
            
            // Fallback if no specific handling matched
            return `// Content for ${file?.name || 'unknown'} from org ${org?.alias || org?.username || 'unknown'}\n// Retrieved from Salesforce org\n\n// Metadata Type: ${file?.type || 'unknown'}\n// Full Name: ${file?.fullName || 'unknown'}\n// Unable to retrieve specific content for this metadata type`;
        } catch (error) {
            console.error('Error retrieving file content:', error);
            return `// Error retrieving content for ${fileId}\n// ${error}\n\n// This file exists in the org but content retrieval failed\n// Make sure you have the correct permissions and the org is authenticated`;
        }
    }

    private async getApexContentViaToolingAPI(file: OrgFile, orgIdentifier: string): Promise<string> {
        try {
            let soqlQuery = '';
            
            if (file.type === 'ApexClass') {
                soqlQuery = `SELECT Id, Name, Body FROM ApexClass WHERE Name = '${file.fullName}'`;
            } else if (file.type === 'ApexTrigger') {
                soqlQuery = `SELECT Id, Name, Body FROM ApexTrigger WHERE Name = '${file.fullName}'`;
            }
            
            const { stdout } = await execAsync(`sf data query --query "${soqlQuery}" --target-org "${orgIdentifier}" --use-tooling-api --json`);
            const result = JSON.parse(stdout);
            
            if (result.status === 0 && result.result && result.result.records && result.result.records.length > 0) {
                const record = result.result.records[0];
                return record.Body || `// Content for ${file.name} from org ${orgIdentifier}\n// Retrieved via Tooling API\n\n// No body content available for this ${file.type}`;
            } else {
                return `// Content for ${file.name} from org ${orgIdentifier}\n// Retrieved via Tooling API\n\n// No records found for ${file.type}: ${file.fullName}`;
            }
        } catch (error) {
            return `// Content for ${file.name} from org ${orgIdentifier}\n// Error retrieving via Tooling API: ${error}\n\n// This file exists in the org but content retrieval failed\n// Make sure you have the correct permissions and the org is authenticated`;
        }
    }

    private async getMetadataContentViaSOQL(file: OrgFile, orgIdentifier: string): Promise<string> {
        try {
            if (file.type === 'CustomObject') {
                // For CustomObject, retrieve the actual XML metadata from the org
                try {
                    // Use sf project retrieve to get the actual XML metadata
                    const { stdout } = await execAsync(`sf project retrieve start --metadata "CustomObject:${file.fullName}" --target-org "${orgIdentifier}" --json`);
                    const result = JSON.parse(stdout);
                    
                    if (result.status === 0) {
                        // Try to read the retrieved XML file
                        
                        // Common paths where metadata might be retrieved
                        const possiblePaths = [
                            `force-app/main/default/objects/${file.fullName}/${file.fullName}.object-meta.xml`,
                            `src/objects/${file.fullName}.object`,
                            `unpackaged/objects/${file.fullName}.object`
                        ];
                        
                        for (const xmlPath of possiblePaths) {
                            if (fs.existsSync(xmlPath)) {
                                const xmlContent = fs.readFileSync(xmlPath, 'utf8');
                                return xmlContent;
                            }
                        }
                        
                        // If no XML file found, fall back to the previous approach but mention the retrieve command worked
                        return `<?xml version="1.0" encoding="UTF-8"?>
<!-- CustomObject: ${file.fullName} -->
<!-- Retrieved from Salesforce org: ${orgIdentifier} -->
<!-- Note: Metadata retrieval succeeded but XML file not found at expected locations -->
<!-- 
Retrieved metadata successfully but could not locate the XML file.
Common locations checked:
- force-app/main/default/objects/${file.fullName}/${file.fullName}.object-meta.xml
- src/objects/${file.fullName}.object
- unpackaged/objects/${file.fullName}.object

To manually retrieve, use:
sf project retrieve start --metadata "CustomObject:${file.fullName}" --target-org "${orgIdentifier}"
-->`;
                    } else {
                        throw new Error(`Retrieve failed: ${result.message || 'Unknown error'}`);
                    }
                } catch (retrieveError) {
                    // If retrieve fails, fall back to describe API for basic info
                    try {
                        const { stdout } = await execAsync(`sf sobject describe --sobject "${file.fullName}" --target-org "${orgIdentifier}" --json`);
                        const result = JSON.parse(stdout);
                        
                        if (result.status === 0 && result.result) {
                            const objectInfo = result.result;
                            return `<?xml version="1.0" encoding="UTF-8"?>
<!-- CustomObject: ${file.fullName} -->
<!-- Retrieved from Salesforce org: ${orgIdentifier} -->
<!-- Note: Full XML retrieval failed, showing basic object information -->
<!-- Retrieve error: ${retrieveError} -->

<!-- 
Object Information:
Name: ${objectInfo.name || 'N/A'}
Label: ${objectInfo.label || 'N/A'}
Custom: ${objectInfo.custom || false}
Createable: ${objectInfo.createable || false}
Deletable: ${objectInfo.deletable || false}
Updateable: ${objectInfo.updateable || false}

Fields: ${objectInfo.fields ? objectInfo.fields.length : 0}
Child Relationships: ${objectInfo.childRelationships ? objectInfo.childRelationships.length : 0}

To retrieve full XML metadata, use:
sf project retrieve start --metadata "CustomObject:${file.fullName}" --target-org "${orgIdentifier}"
-->`;
                        }
                    } catch (describeError) {
                        return `<?xml version="1.0" encoding="UTF-8"?>
<!-- CustomObject: ${file.fullName} -->
<!-- Retrieved from Salesforce org: ${orgIdentifier} -->
<!-- Error: Both retrieve and describe operations failed -->
<!-- Retrieve error: ${retrieveError} -->
<!-- Describe error: ${describeError} -->

<!-- 
This CustomObject exists in the org but could not be retrieved.
Make sure you have the correct permissions and the org is authenticated.

To manually retrieve, use:
sf project retrieve start --metadata "CustomObject:${file.fullName}" --target-org "${orgIdentifier}"
-->`;
                    }
                }
                
                // Fallback return
                return `<?xml version="1.0" encoding="UTF-8"?>
<!-- CustomObject: ${file.fullName} -->
<!-- Retrieved from Salesforce org: ${orgIdentifier} -->
<!-- Unable to retrieve object information -->`;
            } else if (file.type === 'Flow') {
                // For Flow, get basic flow information
                const soqlQuery = `SELECT DeveloperName, MasterLabel, Description, ProcessType, Status FROM Flow WHERE DeveloperName = '${file.fullName}' AND Status = 'Active'`;
                
                const { stdout } = await execAsync(`sf data query --query "${soqlQuery}" --target-org "${orgIdentifier}" --use-tooling-api --json`);
                const result = JSON.parse(stdout);
                
                if (result.status === 0 && result.result && result.result.records && result.result.records.length > 0) {
                    const record = result.result.records[0];
                    return `// Flow: ${file.fullName}
// Retrieved from Salesforce org: ${orgIdentifier}

DeveloperName: ${record.DeveloperName || 'N/A'}
MasterLabel: ${record.MasterLabel || 'N/A'}
ProcessType: ${record.ProcessType || 'N/A'}
Status: ${record.Status || 'N/A'}
Description: ${record.Description || 'N/A'}

// Note: This is basic flow information.
// For full flow definition, use 'sf project retrieve start --metadata "Flow:${file.fullName}"'`;
                } else {
                    return `// Flow: ${file.fullName}
// Retrieved from Salesforce org: ${orgIdentifier}

// No active flow found with name: ${file.fullName}`;
                }
            } else {
                // For other metadata types, provide a generic response
                return `// ${file.type}: ${file.fullName}
// Retrieved from Salesforce org: ${orgIdentifier}

// Metadata Type: ${file.type}
// Full Name: ${file.fullName}

// Note: Detailed content retrieval for ${file.type} is not yet implemented.
// To retrieve full metadata, use:
// sf project retrieve start --metadata "${file.type}:${file.fullName}" --target-org "${orgIdentifier}"`;
            }
        } catch (error) {
            return `// ${file.type}: ${file.fullName}
// Error retrieving metadata: ${error}

// This file exists in the org but content retrieval failed.
// Make sure you have the correct permissions and the org is authenticated.`;
        }
    }
}
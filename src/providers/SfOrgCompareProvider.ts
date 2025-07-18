import * as vscode from 'vscode';
import { SalesforceOrg, OrgFile, TreeItem, ItemType } from '../types';
import { OrgManager } from '../services/OrgManager';
import { FileCompareService } from '../services/FileCompareService';

export class SfOrgCompareProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private expandedOrgs: string[] = [];
    private orgFilesCache: Map<string, TreeItem[]> = new Map();

    constructor(
        private orgManager: OrgManager,
        private fileCompareService: FileCompareService
    ) {}

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    public async deleteOrg(orgItem: TreeItem): Promise<void> {
        if (!orgItem.orgId) {
            return;
        }

        const org = this.orgManager.getOrg(orgItem.orgId);
        if (!org) {
            return;
        }

        const confirmation = await vscode.window.showWarningMessage(
            `Are you sure you want to remove "${org.alias || org.username}" from the extension?`,
            { modal: true },
            'Delete'
        );

        if (confirmation === 'Delete') {
            await this.orgManager.removeOrg(orgItem.orgId);
            
            // Remove from expanded orgs and clear cache
            this.expandedOrgs = this.expandedOrgs.filter(id => id !== orgItem.orgId);
            this.orgFilesCache.delete(orgItem.orgId);
            
            this.refresh();
            vscode.window.showInformationMessage(`Removed organization: ${org.alias || org.username}`);
        }
    }

    public async selectOrg(orgItem: TreeItem): Promise<void> {
        const orgs = this.orgManager.getOrgs();
        const org = orgs.find(o => o.id === orgItem.id);
        
        if (!org) {
            console.log('Org not found:', orgItem.id);
            return;
        }

        // Toggle the expanded state - add to expanded list if not there, or do nothing if already there
        if (!this.expandedOrgs.includes(org.id)) {
            this.expandedOrgs.push(org.id);
            console.log('Expanding org:', org.alias || org.username);
            vscode.window.showInformationMessage(`Loading files from: ${org.alias || org.username}...`);
            
            try {
                // Load and cache the org files
                const orgFiles = await this.getOrgFiles(org.id);
                console.log('Loaded org files:', orgFiles.length);
                this.orgFilesCache.set(org.id, orgFiles);
                
                vscode.window.showInformationMessage(`Loaded ${orgFiles.length} file types from: ${org.alias || org.username}`);
                this.refresh();
            } catch (error) {
                console.error('Error loading org files:', error);
                vscode.window.showErrorMessage(`Failed to load files from ${org.alias || org.username}: ${error}`);
                // Remove from expanded list if loading failed
                this.expandedOrgs = this.expandedOrgs.filter(id => id !== org.id);
            }
        } else {
            console.log('Org already expanded:', org.alias || org.username);
        }
    }

    public getTreeItem(element: TreeItem): vscode.TreeItem {
        let collapsibleState = vscode.TreeItemCollapsibleState.None;
        
        if (element.type === ItemType.Org && element.orgId) {
            // Organizations can be expanded to show files
            const isExpanded = this.expandedOrgs.includes(element.orgId);
            collapsibleState = isExpanded ? 
                vscode.TreeItemCollapsibleState.Expanded : 
                vscode.TreeItemCollapsibleState.Collapsed;
        } else if (element.children) {
            // Collapse metadata type folders by default
            collapsibleState = element.metadataType ? 
                vscode.TreeItemCollapsibleState.Collapsed : 
                vscode.TreeItemCollapsibleState.Expanded;
        }
        
        const treeItem = new vscode.TreeItem(element.label, collapsibleState);

        if (element.type === ItemType.Org) {
            treeItem.iconPath = new vscode.ThemeIcon('organization');
            if (element.id === 'no-orgs') {
                // Special case for "add org" button
                treeItem.command = {
                    command: 'sf-org-source-compare.selectOrg',
                    title: 'Add Organization',
                    arguments: [element]
                };
            } else {
                // Regular orgs should not have commands - let expansion handle naturally
                treeItem.contextValue = 'availableOrg';
            }
        } else if (element.type === ItemType.File) {
            // Check if this file is selected for comparison
            const selectedFiles = this.fileCompareService.getSelectedFiles();
            const isSelected = selectedFiles.some(f => f.id === element.file?.id);
            const selectionIndex = selectedFiles.findIndex(f => f.id === element.file?.id);
            const isComparing = this.fileCompareService.isComparingFiles();
            
            if (isSelected) {
                if (isComparing) {
                    // Show loading state during comparison
                    treeItem.iconPath = new vscode.ThemeIcon('loading~spin');
                    if (selectionIndex === 0) {
                        treeItem.label = `[1] ${element.label}`;
                        treeItem.tooltip = 'Loading file content for comparison...';
                        treeItem.description = '⏳ Loading...';
                    } else {
                        treeItem.label = `[2] ${element.label}`;
                        treeItem.tooltip = 'Loading file content for comparison...';
                        treeItem.description = '⏳ Loading...';
                    }
                    // Disable command during comparison
                    treeItem.command = undefined;
                } else {
                    // Normal selected state
                    if (selectionIndex === 0) {
                        treeItem.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.blue'));
                        treeItem.label = `[1] ${element.label}`;
                        treeItem.tooltip = 'Selected as first file for comparison - click to unselect';
                        treeItem.description = '🔵';
                    } else {
                        treeItem.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.red'));
                        treeItem.label = `[2] ${element.label}`;
                        treeItem.tooltip = 'Selected as second file for comparison - click to unselect';
                        treeItem.description = '🔴';
                    }
                    // Enable command when not comparing
                    treeItem.command = {
                        command: 'sf-org-source-compare.selectFile',
                        title: 'Select File',
                        arguments: [element]
                    };
                }
            } else {
                treeItem.iconPath = new vscode.ThemeIcon('file');
                treeItem.tooltip = 'Click to select for comparison';
                treeItem.description = undefined;
                treeItem.command = {
                    command: 'sf-org-source-compare.selectFile',
                    title: 'Select File',
                    arguments: [element]
                };
            }
        } else if (element.type === ItemType.Folder) {
            if (element.id === 'comparison-progress') {
                // Special styling for comparison progress
                treeItem.iconPath = new vscode.ThemeIcon('loading~spin');
                treeItem.description = 'Loading file contents...';
                treeItem.tooltip = 'File comparison in progress';
                treeItem.collapsibleState = vscode.TreeItemCollapsibleState.None;
            } else {
                treeItem.iconPath = new vscode.ThemeIcon('folder');
            }
        }

        return treeItem;
    }

    public async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        if (!element) {
            return this.getRootItems();
        }

        if (element.type === ItemType.Org && element.orgId) {
            // Automatically add to expanded list when VS Code tries to expand
            if (!this.expandedOrgs.includes(element.orgId)) {
                console.log('Auto-expanding org via getChildren:', element.orgId);
                this.expandedOrgs.push(element.orgId);
                vscode.window.showInformationMessage(`Loading files from: ${element.label}...`);
                
                try {
                    const orgFiles = await this.getOrgFiles(element.orgId);
                    this.orgFilesCache.set(element.orgId, orgFiles);
                    vscode.window.showInformationMessage(`Loaded ${orgFiles.length} file types from: ${element.label}`);
                    return orgFiles;
                } catch (error) {
                    console.error('Error auto-expanding org:', error);
                    vscode.window.showErrorMessage(`Failed to load files from ${element.label}: ${error}`);
                    this.expandedOrgs = this.expandedOrgs.filter(id => id !== element.orgId);
                    return [];
                }
            } else {
                // Already expanded, return cached files
                return this.getOrgFiles(element.orgId);
            }
        }

        if (element.type === ItemType.Folder && element.children) {
            return element.children;
        }

        return element.children || [];
    }

    private async getRootItems(): Promise<TreeItem[]> {
        const items: TreeItem[] = [];
        const orgs = this.orgManager.getOrgs();

        // Show comparison progress indicator if comparing
        if (this.fileCompareService.isComparingFiles()) {
            const selectedFiles = this.fileCompareService.getSelectedFiles();
            if (selectedFiles.length === 2) {
                items.push({
                    id: 'comparison-progress',
                    label: `Comparing files... ${selectedFiles[0].name} ↔ ${selectedFiles[1].name}`,
                    type: ItemType.Folder,
                    children: []
                });
            }
        }

        if (orgs.length === 0) {
            items.push({
                id: 'no-orgs',
                label: 'Add your first Salesforce organization',
                type: ItemType.Org
            });
            return items;
        }

        // Show all organizations with their files when expanded
        items.push({
            id: 'available-orgs',
            label: `Organizations (${orgs.length})`,
            type: ItemType.Folder,
            children: orgs.map(org => ({
                id: org.id,
                label: org.alias || org.username,
                type: ItemType.Org,
                orgId: org.id
                // Don't set children here - let getChildren handle it dynamically
            }))
        });

        return items;
    }

    private async getOrgFiles(orgId: string): Promise<TreeItem[]> {
        // Check if files are already cached - if so, return immediately without org calls
        if (this.orgFilesCache.has(orgId)) {
            console.log('Returning cached files for org:', orgId);
            return this.orgFilesCache.get(orgId) || [];
        }

        console.log('Loading files from org:', orgId);
        try {
            // Only make org calls if not cached
            const filesByType = await this.orgManager.getOrgFilesByType(orgId);
            console.log('Files by type received:', filesByType.size, 'types');
            const folderItems: TreeItem[] = [];

            for (const [metadataType, files] of filesByType.entries()) {
                console.log(`Processing ${metadataType}: ${files.length} files`);
                const folderName = this.getMetadataTypeFolderName(metadataType);
                const fileItems = files.map(file => ({
                    id: `${orgId}-${file.id}`,
                    label: file.name,
                    type: ItemType.File,
                    orgId,
                    file
                }));

                folderItems.push({
                    id: `${orgId}-folder-${metadataType}`,
                    label: `${folderName} (${files.length})`,
                    type: ItemType.Folder,
                    metadataType,
                    orgId,
                    children: fileItems
                });
            }

            const sortedItems = folderItems.sort((a, b) => a.label.localeCompare(b.label));
            console.log('Created folder items:', sortedItems.length);
            
            // Cache the results
            this.orgFilesCache.set(orgId, sortedItems);
            
            return sortedItems;
        } catch (error) {
            console.error('Error in getOrgFiles:', error);
            vscode.window.showErrorMessage(`Failed to load files for org: ${error}`);
            return [];
        }
    }

    private getMetadataTypeFolderName(metadataType: string): string {
        switch (metadataType) {
            case 'ApexClass':
                return 'Apex Classes';
            case 'ApexTrigger':
                return 'Apex Triggers';
            case 'CustomObject':
                return 'Custom Objects';
            case 'Flow':
                return 'Flows';
            case 'Layout':
                return 'Layouts';
            case 'PermissionSet':
                return 'Permission Sets';
            default:
                return metadataType;
        }
    }
}
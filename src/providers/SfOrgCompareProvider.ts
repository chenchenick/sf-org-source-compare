import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SalesforceOrg, OrgFile, TreeItem, ItemType } from '../types';
import { OrgManager } from '../services/OrgManager';
import { EnhancedOrgManager } from '../metadata/EnhancedOrgManager';
import { FileCompareService } from '../services/FileCompareService';

export class SfOrgCompareProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private expandedOrgs: string[] = [];
    private expandedFolders: string[] = [];
    private orgFilesCache: Map<string, TreeItem[]> = new Map();
    private orgRefreshTimestamps: Map<string, Date> = new Map();

    constructor(
        private orgManager: OrgManager,
        private enhancedOrgManager: EnhancedOrgManager,
        private fileCompareService: FileCompareService
    ) {}

    public async refresh(): Promise<void> {
        console.log('🔄 Refresh button clicked - starting refresh...');
        
        // Clear all caches and refresh timestamps when refresh is clicked
        this.orgFilesCache.clear();
        this.orgRefreshTimestamps.clear();
        // Don't clear expanded folders - keep folder expansion state
        
        // Get orgs and find expanded ones
        const orgs = this.orgManager.getOrgs();
        const expandedOrgs = orgs.filter(org => this.expandedOrgs.includes(org.id));
        
        console.log(`Found ${orgs.length} total orgs, ${expandedOrgs.length} expanded orgs to refresh`);
        
        if (expandedOrgs.length === 0) {
            vscode.window.showInformationMessage('No expanded organizations to refresh. Expand an org first, then click refresh.');
            this._onDidChangeTreeData.fire();
            return;
        }
        
        // Show progress for each org
        for (const org of expandedOrgs) {
            try {
                console.log('🔄 Refreshing org:', org.alias || org.username);
                vscode.window.showInformationMessage(`Refreshing ${org.alias || org.username}...`);
                
                const orgFiles = await this.getOrgFiles(org.id);
                console.log(`✅ Refreshed ${org.alias || org.username}: ${orgFiles.length} file types`);
                vscode.window.showInformationMessage(`Refreshed ${org.alias || org.username}: ${orgFiles.length} file types`);
            } catch (error) {
                console.error(`❌ Error refreshing org ${org.alias || org.username}:`, error);
                vscode.window.showErrorMessage(`Failed to refresh ${org.alias || org.username}: ${error}`);
            }
        }
        
        console.log('🔄 Refresh complete - updating tree view');
        this._onDidChangeTreeData.fire();
    }

    /**
     * Refresh tree view display only (no org requests)
     */
    public refreshTreeView(): void {
        console.log('🎨 Refreshing tree view display only');
        this._onDidChangeTreeData.fire();
    }

    /**
     * Refresh a specific org's source files
     */
    public async refreshOrg(orgId: string): Promise<void> {
        console.log(`🔄 Refreshing specific org: ${orgId}`);
        
        const org = this.orgManager.getOrg(orgId);
        if (!org) {
            vscode.window.showErrorMessage('Organization not found');
            return;
        }

        try {
            vscode.window.showInformationMessage(`Refreshing ${org.alias || org.username}...`);
            
            // Clear cache for this org
            this.orgFilesCache.delete(orgId);
            this.orgRefreshTimestamps.delete(orgId);
            
            // Use enhanced org manager's refresh method
            await this.enhancedOrgManager.refreshOrgSource(orgId);
            
            // Reload org files
            if (this.expandedOrgs.includes(orgId)) {
                const orgFiles = await this.getOrgFiles(orgId);
                console.log(`✅ Refreshed ${org.alias || org.username}: ${orgFiles.length} file types`);
                vscode.window.showInformationMessage(`Refreshed ${org.alias || org.username}: ${orgFiles.length} file types`);
            }
            
            // Update tree view
            this._onDidChangeTreeData.fire();
        } catch (error) {
            console.error(`❌ Error refreshing org ${org.alias || org.username}:`, error);
            vscode.window.showErrorMessage(`Failed to refresh ${org.alias || org.username}: ${error}`);
        }
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
            this.orgRefreshTimestamps.delete(orgItem.orgId);
            // Remove expanded folders for this org
            this.expandedFolders = this.expandedFolders.filter(id => !id.startsWith(orgItem.orgId!));
            
            this._onDidChangeTreeData.fire();
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
                // Load and cache the org files when expanding
                const orgFiles = await this.getOrgFiles(org.id);
                console.log('Loaded org files:', orgFiles.length);
                
                vscode.window.showInformationMessage(`Loaded ${orgFiles.length} file types from: ${org.alias || org.username}`);
                this._onDidChangeTreeData.fire();
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
        } else if (element.children && element.children.length > 0) {
            // Check if this folder is expanded
            const isExpanded = element.type === ItemType.Folder && this.expandedFolders.includes(element.id);
            collapsibleState = isExpanded ? 
                vscode.TreeItemCollapsibleState.Expanded : 
                vscode.TreeItemCollapsibleState.Collapsed;
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
                treeItem.tooltip = `${element.label} - Right-click for options`;
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
                        treeItem.tooltip = 'Selected as first file for comparison - click to open, right-click to unselect';
                        treeItem.description = '🔵';
                    } else {
                        treeItem.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.red'));
                        treeItem.label = `[2] ${element.label}`;
                        treeItem.tooltip = 'Selected as second file for comparison - click to open, right-click to unselect';
                        treeItem.description = '🔴';
                    }
                    // Enable command when not comparing
                    treeItem.command = {
                        command: 'sf-org-source-compare.openFile',
                        title: 'Open File',
                        arguments: [element]
                    };
                }
            } else {
                treeItem.iconPath = new vscode.ThemeIcon('file');
                treeItem.tooltip = 'Click to open file';
                treeItem.description = undefined;
                treeItem.contextValue = 'file';
                treeItem.command = {
                    command: 'sf-org-source-compare.openFile',
                    title: 'Open File',
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
                // No icon for regular folders
                treeItem.iconPath = undefined;
            }
        }

        return treeItem;
    }

    public async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        if (!element) {
            return this.getRootItems();
        }

        if (element.type === ItemType.Org && element.orgId) {
            // Check if we have cached files for this org
            if (this.orgFilesCache.has(element.orgId)) {
                console.log('Returning cached files for org expansion:', element.orgId);
                return this.orgFilesCache.get(element.orgId) || [];
            } else {
                // No cached files - load them when expanding org
                console.log('Auto-expanding org via getChildren:', element.orgId);
                if (!this.expandedOrgs.includes(element.orgId)) {
                    this.expandedOrgs.push(element.orgId);
                }
                vscode.window.showInformationMessage(`Loading files from: ${element.label}...`);
                
                try {
                    const orgFiles = await this.getOrgFiles(element.orgId);
                    vscode.window.showInformationMessage(`Loaded ${orgFiles.length} file types from: ${element.label}`);
                    return orgFiles;
                } catch (error) {
                    console.error('Error auto-expanding org:', error);
                    vscode.window.showErrorMessage(`Failed to load files from ${element.label}: ${error}`);
                    this.expandedOrgs = this.expandedOrgs.filter(id => id !== element.orgId);
                    return [];
                }
            }
        }

        if (element.type === ItemType.Folder && element.children) {
            // Track folder expansion
            if (!this.expandedFolders.includes(element.id)) {
                this.expandedFolders.push(element.id);
                console.log('Expanded folder:', element.id);
            }
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
                label: this.getOrgLabelWithTimestamp(org),
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
            console.log('📁 CACHE HIT: Returning cached files for org:', orgId);
            return this.orgFilesCache.get(orgId) || [];
        }

        console.log('🔍 CACHE MISS: Loading files from org:', orgId);
        try {
            // Get the source directory path
            const sourceDirectory = await this.enhancedOrgManager.getOrgSourceDirectory(orgId);
            console.log('Source directory:', sourceDirectory);
            
            // Traverse the directory structure to create TreeItems
            const folderItems = await this.traverseSourceDirectory(orgId, sourceDirectory);
            
            console.log('Created folder items:', folderItems.length);
            
            // Cache the results and set refresh timestamp
            this.orgFilesCache.set(orgId, folderItems);
            this.orgRefreshTimestamps.set(orgId, new Date());
            
            return folderItems;
        } catch (error) {
            console.error('Error in getOrgFiles:', error);
            vscode.window.showErrorMessage(`Failed to load files for org: ${error}`);
            return [];
        }
    }

    /**
     * Traverse the SFDX source directory and create TreeItems from the actual folder structure
     */
    private async traverseSourceDirectory(orgId: string, sourceDirectory: string): Promise<TreeItem[]> {
        const items: TreeItem[] = [];

        if (!fs.existsSync(sourceDirectory)) {
            console.log(`Source directory does not exist: ${sourceDirectory}`);
            return items;
        }

        try {
            const entries = await fs.promises.readdir(sourceDirectory, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const folderPath = path.join(sourceDirectory, entry.name);
                    const children = await this.traverseDirectory(orgId, folderPath, `${orgId}-${entry.name}`);
                    
                    items.push({
                        id: `${orgId}-${entry.name}`,
                        label: entry.name,
                        type: ItemType.Folder,
                        orgId,
                        children: children.length > 0 ? children : undefined
                    });
                }
            }
            
            return items.sort((a, b) => a.label.localeCompare(b.label));
        } catch (error) {
            console.error('Error traversing source directory:', error);
            return items;
        }
    }

    /**
     * Recursively traverse a directory and create TreeItems
     */
    private async traverseDirectory(orgId: string, dirPath: string, parentId: string): Promise<TreeItem[]> {
        const items: TreeItem[] = [];

        try {
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                const itemId = `${parentId}-${entry.name}`;

                if (entry.isDirectory()) {
                    // Recursively handle subdirectories
                    const children = await this.traverseDirectory(orgId, fullPath, itemId);
                    
                    items.push({
                        id: itemId,
                        label: entry.name,
                        type: ItemType.Folder,
                        orgId,
                        children: children.length > 0 ? children : undefined
                    });
                } else {
                    // Handle individual files
                    const orgFile: OrgFile = {
                        id: itemId,
                        name: entry.name,
                        type: path.dirname(dirPath).split(path.sep).pop() || 'unknown',
                        fullName: path.basename(entry.name, path.extname(entry.name)),
                        orgId,
                        filePath: fullPath
                    };

                    items.push({
                        id: itemId,
                        label: entry.name,
                        type: ItemType.File,
                        orgId,
                        file: orgFile
                    });
                }
            }
            
            return items.sort((a, b) => a.label.localeCompare(b.label));
        } catch (error) {
            console.error(`Error traversing directory ${dirPath}:`, error);
            return items;
        }
    }



    /**
     * Get org label with last refresh timestamp
     */
    private getOrgLabelWithTimestamp(org: SalesforceOrg): string {
        const baseLabel = org.alias || org.username;
        const lastRefresh = this.orgRefreshTimestamps.get(org.id);
        
        if (lastRefresh) {
            const timeString = this.formatRefreshTime(lastRefresh);
            return `${baseLabel} (last refreshed: ${timeString})`;
        } else {
            return baseLabel;
        }
    }

    /**
     * Format refresh time as a relative time string
     */
    private formatRefreshTime(date: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMinutes < 1) {
            return 'just now';
        } else if (diffMinutes < 60) {
            return `${diffMinutes}m ago`;
        } else if (diffHours < 24) {
            return `${diffHours}h ago`;
        } else if (diffDays < 7) {
            return `${diffDays}d ago`;
        } else {
            // For older than a week, show the actual date
            return date.toLocaleDateString();
        }
    }
}
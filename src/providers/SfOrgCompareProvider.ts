import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SalesforceOrg, OrgFile, TreeItem, ItemType } from '../types';
import { EnhancedOrgManager } from '../metadata/EnhancedOrgManager';
import { FileCompareService } from '../services/FileCompareService';
import { UserErrorReporter } from '../errors/UserErrorReporter';
import { ProgressManager } from '../progress/ProgressManager';
import { OrgCacheService } from '../services/OrgCacheService';
import { SF_CONFIG } from '../config';

export class SfOrgCompareProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private expandedOrgs: string[] = [];
    private expandedFolders: string[] = [];
    private orgFilesCache: Map<string, TreeItem[]> = new Map();
    private orgRefreshTimestamps: Map<string, Date> = new Map();

    constructor(
        private enhancedOrgManager: EnhancedOrgManager,
        private fileCompareService: FileCompareService,
        private orgCacheService: OrgCacheService
    ) {
        this.userErrorReporter = UserErrorReporter.getInstance();
        this.progressManager = ProgressManager.getInstance();
        this.initializeCacheOnStartup();
    }

    private userErrorReporter: UserErrorReporter;
    private progressManager: ProgressManager;

    /**
     * Initialize cache on startup by loading cached org files
     */
    private async initializeCacheOnStartup(): Promise<void> {
        try {
            console.log('🚀 Initializing org cache on startup...');
            
            // Get current orgs from org manager
            const currentOrgs = this.enhancedOrgManager.getOrgs();
            const currentOrgIds = currentOrgs.map(org => org.id);
            
            // Cleanup stale cache entries
            this.orgCacheService.cleanupStaleCache(currentOrgIds);
            
            // Load cached files for current orgs
            let loadedCount = 0;
            for (const org of currentOrgs) {
                if (this.orgCacheService.hasCachedFiles(org.id)) {
                    const cachedFiles = this.orgCacheService.getCachedFiles(org.id);
                    if (cachedFiles) {
                        this.orgFilesCache.set(org.id, cachedFiles);
                        const metadata = this.orgCacheService.getCacheMetadata(org.id);
                        if (metadata) {
                            this.orgRefreshTimestamps.set(org.id, metadata.lastRefreshed);
                        }
                        loadedCount++;
                    }
                }
            }
            
            const stats = this.orgCacheService.getCacheStats();
            console.log(`✅ Cache initialized: ${loadedCount}/${currentOrgs.length} orgs loaded from cache`);
            console.log(`📊 Cache stats: ${stats.totalOrgs} orgs, ${stats.totalFiles} files, ${stats.cacheSize}`);
            
            // Refresh tree view to show cached data
            this._onDidChangeTreeData.fire();
        } catch (error) {
            console.error('❌ Failed to initialize cache on startup:', error);
        }
    }



    public async refresh(): Promise<void> {
        console.log('🔄 Refresh button clicked - starting refresh...');
        
        // Clear all caches and refresh timestamps when refresh is clicked
        this.orgFilesCache.clear();
        this.orgRefreshTimestamps.clear();
        // Don't clear expanded folders - keep folder expansion state
        
        // Get orgs and find expanded ones
        const orgs = this.enhancedOrgManager.getOrgs();
        const expandedOrgs = orgs.filter(org => this.expandedOrgs.includes(org.id));
        
        console.log(`Found ${orgs.length} total orgs, ${expandedOrgs.length} expanded orgs to refresh`);
        
        if (expandedOrgs.length === 0) {
            vscode.window.showInformationMessage('No expanded organizations to refresh. Expand an org first, then click refresh.');
            this._onDidChangeTreeData.fire();
            return;
        }
        
        // Use progress manager for multi-org refresh
        if (expandedOrgs.length > 1) {
            await this.progressManager.withProgress('MULTI_ORG_REFRESH', async (progress) => {
                progress.startStep(0); // prepare
                await new Promise(resolve => setTimeout(resolve, 100)); // Brief delay for UI
                progress.completeStep(0);

                progress.startStep(1); // refresh_orgs
                for (let i = 0; i < expandedOrgs.length; i++) {
                    const org = expandedOrgs[i];
                    const orgProgress = (i / expandedOrgs.length) * 100;
                    
                    progress.updateStep(orgProgress, `Refreshing ${org.alias || org.username}`);
                    
                    try {
                        console.log('🔄 Refreshing org:', org.alias || org.username);
                        await this.getOrgFiles(org.id, true); // Force refresh from Salesforce
                        console.log(`✅ Refreshed ${org.alias || org.username}`);
                    } catch (error) {
                        console.error(`❌ Error refreshing org ${org.alias || org.username}:`, error);
                        await this.userErrorReporter.reportOperationFailure(
                            `Refresh organization ${org.alias || org.username}`,
                            error as Error,
                            { orgId: org.id, orgAlias: org.alias }
                        );
                    }
                }
                progress.completeStep(1);

                progress.startStep(2); // finalize
                progress.completeStep(2);
            });
        } else {
            // Single org refresh with progress
            const org = expandedOrgs[0];
            await this.refreshOrgWithProgress(org.id);
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
        return this.refreshOrgWithProgress(orgId);
    }

    /**
     * Refresh a specific org's source files with progress indicator
     */
    public async refreshOrgWithProgress(orgId: string): Promise<void> {
        console.log(`🔄 Refreshing specific org with progress: ${orgId}`);
        
        const org = this.enhancedOrgManager.getOrg(orgId);
        if (!org) {
            await this.userErrorReporter.reportError(
                new Error(`Organization with ID "${orgId}" not found`),
                'Find organization'
            );
            return;
        }

        await this.progressManager.withProgress('ORG_REFRESH', async (progress) => {
            try {
                progress.startStep(0, `Verifying ${org.alias || org.username}`);
                await new Promise(resolve => setTimeout(resolve, 500)); // Brief authentication check
                progress.completeStep(0);
                
                progress.startStep(1, `Retrieving metadata from ${org.alias || org.username}`);
                
                // Clear cache for this org
                this.orgFilesCache.delete(orgId);
                this.orgRefreshTimestamps.delete(orgId);
                
                // Use enhanced org manager's refresh method
                await this.enhancedOrgManager.refreshOrgSource(orgId);
                progress.updateStep(60, 'Source retrieval complete');
                
                // Reload org files if expanded
                if (this.expandedOrgs.includes(orgId)) {
                    const orgFiles = await this.getOrgFiles(orgId, true); // Force refresh from Salesforce
                    console.log(`✅ Refreshed from Salesforce ${org.alias || org.username}: ${orgFiles.length} file types`);
                    vscode.window.showInformationMessage(`Successfully refreshed ${org.alias || org.username} from Salesforce: ${orgFiles.length} file types`);
                }
                
                progress.completeStep(1);
                
                progress.startStep(2, 'Processing metadata files');
                await new Promise(resolve => setTimeout(resolve, 200)); // Brief processing delay
                progress.completeStep(2);
                
                progress.startStep(3, 'Updating cache');
                await new Promise(resolve => setTimeout(resolve, 100)); // Brief cache update
                progress.completeStep(3);
                
            } catch (error) {
                console.error(`❌ Error refreshing org ${org.alias || org.username}:`, error);
                progress.fail(`Failed to refresh ${org.alias || org.username}`);
                await this.userErrorReporter.reportOperationFailure(
                    `Refresh organization ${org.alias || org.username}`,
                    error as Error,
                    { orgId: org.id, orgAlias: org.alias }
                );
            }
        });
        
        // Update tree view
        this._onDidChangeTreeData.fire();
    }

    public async deleteOrg(orgItem: TreeItem): Promise<void> {
        if (!orgItem.orgId) {
            return;
        }

        const org = this.enhancedOrgManager.getOrg(orgItem.orgId);
        if (!org) {
            return;
        }

        const confirmation = await vscode.window.showWarningMessage(
            `Are you sure you want to remove "${org.alias || org.username}" from the extension?`,
            { modal: true },
            'Delete'
        );

        if (confirmation === 'Delete') {
            await this.enhancedOrgManager.removeOrg(orgItem.orgId);
            
            // Remove from expanded orgs and clear cache
            this.expandedOrgs = this.expandedOrgs.filter(id => id !== orgItem.orgId);
            this.orgFilesCache.delete(orgItem.orgId);
            this.orgRefreshTimestamps.delete(orgItem.orgId);
            // Remove expanded folders for this org
            this.expandedFolders = this.expandedFolders.filter(id => !id.startsWith(orgItem.orgId!));
            
            // Remove from persistent cache
            this.orgCacheService.removeCachedOrg(orgItem.orgId);
            
            this._onDidChangeTreeData.fire();
            vscode.window.showInformationMessage(`Removed organization: ${org.alias || org.username}`);
        }
    }

    public async selectOrg(orgItem: TreeItem): Promise<void> {
        const orgs = this.enhancedOrgManager.getOrgs();
        const org = orgs.find(o => o.id === orgItem.id);
        
        if (!org) {
            console.log('Org not found:', orgItem.id);
            return;
        }

        // Toggle the expanded state - add to expanded list if not there, or do nothing if already there
        if (!this.expandedOrgs.includes(org.id)) {
            this.expandedOrgs.push(org.id);
            console.log('Expanding org:', org.alias || org.username);
            
            try {
                // Load cached org files when expanding (don't force refresh)
                const orgFiles = await this.getOrgFiles(org.id, false); // Show cached or placeholder
                console.log('Loaded org files:', orgFiles.length);
                
                if (this.orgFilesCache.has(org.id)) {
                    const lastRefresh = this.orgRefreshTimestamps.get(org.id);
                    const timeString = lastRefresh ? this.formatRefreshTime(lastRefresh) : 'never';
                    vscode.window.showInformationMessage(`Showing cached files from ${org.alias || org.username} (last refreshed: ${timeString})`);
                } else {
                    vscode.window.showInformationMessage(`${org.alias || org.username} expanded - click refresh to load files from org`);
                }
                
                this._onDidChangeTreeData.fire();
            } catch (error) {
                console.error('Error loading org files:', error);
                await this.userErrorReporter.reportOperationFailure(
                    `Load files from ${org.alias || org.username}`,
                    error as Error,
                    { orgId: org.id, orgAlias: org.alias }
                );
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
            // For search results, use the original file id for comparison
            const fileId = element.file?.id || '';
            const originalFileId = fileId.startsWith('search-') ? fileId.substring(7) : fileId;
            const isSelected = selectedFiles.some(f => f.id === originalFileId || f.id === fileId);
            const selectionIndex = selectedFiles.findIndex(f => f.id === originalFileId || f.id === fileId);
            const isComparing = this.fileCompareService.isComparingFiles();
            
            if (isSelected) {
                if (isComparing) {
                    // Show loading state during comparison
                    const fileNumber = selectionIndex + 1;
                    treeItem.iconPath = new vscode.ThemeIcon('loading~spin');
                    treeItem.label = `[${fileNumber}] ${element.label}`;
                    treeItem.tooltip = 'Loading file content for comparison...';
                    treeItem.description = '⏳ Loading...';
                    // Disable command during comparison
                    treeItem.command = undefined;
                } else {
                    // Normal selected state with multi-file support
                    const colorConfig = SF_CONFIG.COMPARE.COLORS[selectionIndex] || SF_CONFIG.COMPARE.COLORS[0];
                    const fileNumber = selectionIndex + 1;
                    
                    treeItem.iconPath = new vscode.ThemeIcon(colorConfig.icon, new vscode.ThemeColor(colorConfig.primary));
                    treeItem.label = `[${fileNumber}] ${element.label}`;
                    treeItem.tooltip = `Selected as file #${fileNumber} for comparison - click to open, right-click to unselect`;
                    treeItem.description = colorConfig.emoji;
                    // Enable command when not comparing
                    treeItem.command = {
                        command: 'sf-org-source-compare.openFile',
                        title: 'Open File',
                        arguments: [element]
                    };
                }
            } else {
                treeItem.iconPath = new vscode.ThemeIcon('file');
                treeItem.tooltip = 'Click to open file, right-click to select for comparison';
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
                
                try {
                    const orgFiles = await this.getOrgFiles(element.orgId, false); // Show cached or placeholder
                    
                    if (this.orgFilesCache.has(element.orgId)) {
                        const lastRefresh = this.orgRefreshTimestamps.get(element.orgId);
                        const timeString = lastRefresh ? this.formatRefreshTime(lastRefresh) : 'never';
                        console.log(`Showing cached files from ${element.label} (last refreshed: ${timeString})`);
                    } else {
                        console.log(`${element.label} expanded - showing placeholder, click refresh to load files`);
                    }
                    
                    return orgFiles;
                } catch (error) {
                    console.error('Error auto-expanding org:', error);
                    await this.userErrorReporter.reportOperationFailure(
                        `Auto-expand organization ${element.label}`,
                        error as Error,
                        { orgId: element.orgId }
                    );
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
        const orgs = this.enhancedOrgManager.getOrgs();

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

        // Show organizations
        items.push({
            id: 'available-orgs',
            label: `Organizations (${orgs.length})`,
            type: ItemType.Folder,
            children: this.getOrganizationItems(orgs)
        });

        return items;
    }
    
    private getOrganizationItems(orgs: SalesforceOrg[]): TreeItem[] {
        const orgItems: TreeItem[] = [];
        
        for (const org of orgs) {
            // Show all orgs
            orgItems.push({
                id: org.id,
                label: this.getOrgLabelWithTimestamp(org),
                type: ItemType.Org,
                orgId: org.id
                // Don't set children here - let getChildren handle it dynamically
            });
        }
        
        return orgItems;
    }
    

    private async getOrgFiles(orgId: string, forceRefresh: boolean = false): Promise<TreeItem[]> {
        // Check if files are already cached - if so, return immediately without org calls
        if (this.orgFilesCache.has(orgId) && !forceRefresh) {
            console.log('📁 CACHE HIT: Returning cached files for org:', orgId);
            return this.orgFilesCache.get(orgId) || [];
        }

        // If no cache and not forcing refresh, return placeholder message
        if (!forceRefresh) {
            console.log('📁 NO CACHE: Showing placeholder for org:', orgId);
            return [{
                id: `${orgId}-no-cache`,
                label: 'No files cached - Click refresh to load from org',
                type: ItemType.Folder,
                children: []
            }];
        }

        console.log('🔍 FORCE REFRESH: Loading files from org:', orgId);
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
            
            // Save to persistent cache
            const org = this.enhancedOrgManager.getOrg(orgId);
            if (org) {
                this.orgCacheService.cacheOrgFiles(orgId, org, folderItems);
            }
            
            return folderItems;
        } catch (error) {
            console.error('Error in getOrgFiles:', error);
            await this.userErrorReporter.reportOperationFailure(
                'Load organization files',
                error as Error,
                { orgId }
            );
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
        return org.alias || org.username;
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
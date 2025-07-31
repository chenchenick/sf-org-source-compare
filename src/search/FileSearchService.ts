import * as vscode from 'vscode';
import { SfOrgCompareProvider } from '../providers/SfOrgCompareProvider';
import { FileCompareService } from '../services/FileCompareService';
import { TreeItem, ItemType, OrgFile } from '../types';

export class FileSearchService {
    constructor(
        private treeProvider: SfOrgCompareProvider,
        private fileCompareService: FileCompareService
    ) {}

    public async openFileSearch(): Promise<void> {
        const quickPick = vscode.window.createQuickPick();
        quickPick.placeholder = 'Type to search files across all organizations...';
        quickPick.canSelectMany = true;
        quickPick.matchOnDescription = true;
        quickPick.matchOnDetail = true;

        // Get all files from all orgs
        const allFiles = await this.getAllOrgFiles();
        const quickPickItems = this.createQuickPickItems(allFiles);
        
        quickPick.items = quickPickItems;
        quickPick.activeItems = [];

        // Handle selection changes
        quickPick.onDidChangeSelection(items => {
            if (items.length > 0) {
                // Update selection status in the description
                this.updateSelectionStatus(quickPick, items);
            }
        });

        // Handle when user accepts selection
        quickPick.onDidAccept(() => {
            const selectedItems = quickPick.selectedItems;
            
            if (selectedItems.length === 0) {
                vscode.window.showInformationMessage('No files selected');
                quickPick.hide();
                return;
            }

            if (selectedItems.length > 2) {
                vscode.window.showWarningMessage('Please select only 1 or 2 files for comparison');
                return;
            }

            // Clear current selection and select the chosen files
            this.fileCompareService.clearSelection();
            
            for (const item of selectedItems) {
                const fileData = item as any; // Cast to access custom properties
                if (fileData.orgFile) {
                    this.fileCompareService.selectFile(fileData.orgFile);
                }
            }

            if (selectedItems.length === 2) {
                // Automatically start comparison if 2 files selected
                this.fileCompareService.compareSelectedFiles();
                vscode.window.showInformationMessage(`Comparing ${selectedItems.length} files`);
            } else {
                vscode.window.showInformationMessage(`Selected 1 file. Select another file to compare.`);
            }

            quickPick.hide();
        });

        // Handle input changes for real-time filtering
        quickPick.onDidChangeValue(value => {
            if (value.length === 0) {
                quickPick.items = quickPickItems;
            } else {
                const filtered = quickPickItems.filter(item =>
                    item.label.toLowerCase().includes(value.toLowerCase()) ||
                    (item.description && item.description.toLowerCase().includes(value.toLowerCase())) ||
                    (item.detail && item.detail.toLowerCase().includes(value.toLowerCase()))
                );
                quickPick.items = filtered;
            }
        });

        quickPick.onDidHide(() => {
            quickPick.dispose();
        });

        quickPick.show();
    }

    private async getAllOrgFiles(): Promise<{ orgId: string; orgName: string; files: (TreeItem & { fullPath?: string })[] }[]> {
        const result: { orgId: string; orgName: string; files: (TreeItem & { fullPath?: string })[] }[] = [];
        
        // Get all orgs from the tree provider
        const rootItems = await this.treeProvider.getChildren();
        
        for (const rootItem of rootItems) {
            if (rootItem.id === 'available-orgs' && rootItem.children) {
                for (const orgItem of rootItem.children) {
                    if (orgItem.type === ItemType.Org && orgItem.orgId) {
                        try {
                            const orgFiles = await this.treeProvider.getChildren(orgItem);
                            const flatFiles = this.flattenTreeItems(orgFiles);
                            
                            if (flatFiles.length > 0) {
                                result.push({
                                    orgId: orgItem.orgId,
                                    orgName: orgItem.label,
                                    files: flatFiles
                                });
                            }
                        } catch (error) {
                            console.error(`Error loading files for org ${orgItem.label}:`, error);
                        }
                    }
                }
            }
        }

        return result;
    }

    private flattenTreeItems(items: TreeItem[], path: string = ''): (TreeItem & { fullPath?: string })[] {
        const result: (TreeItem & { fullPath?: string })[] = [];

        for (const item of items) {
            if (item.type === ItemType.File && item.file) {
                // Add file with its full path
                result.push({
                    ...item,
                    fullPath: path ? `${path}/${item.label}` : item.label
                });
            } else if (item.type === ItemType.Folder && item.children) {
                // Recursively flatten folder contents
                const folderPath = path ? `${path}/${item.label}` : item.label;
                const childFiles = this.flattenTreeItems(item.children, folderPath);
                result.push(...childFiles);
            }
        }

        return result;
    }

    private createQuickPickItems(orgData: { orgId: string; orgName: string; files: (TreeItem & { fullPath?: string })[] }[]): vscode.QuickPickItem[] {
        const items: vscode.QuickPickItem[] = [];

        // Sort orgs by name for consistent display
        const sortedOrgData = orgData.sort((a, b) => a.orgName.localeCompare(b.orgName));

        for (const org of sortedOrgData) {
            if (org.files.length === 0) {
                continue;
            }

            // Add org header as separator (non-selectable)
            const orgHeader: vscode.QuickPickItem = {
                label: `$(organization) ${org.orgName}`,
                description: `${org.files.length} files`,
                detail: '────────────────────────────────────────',
                kind: vscode.QuickPickItemKind.Separator
            };
            items.push(orgHeader);

            // Sort files within org for better organization
            const sortedFiles = org.files.sort((a, b) => {
                // Sort by folder path first, then by file name
                const aPath = a.fullPath || a.label;
                const bPath = b.fullPath || b.label;
                return aPath.localeCompare(bPath);
            });

            // Add files under this org
            for (const file of sortedFiles) {
                if (file.file) {
                    const item: vscode.QuickPickItem & { orgFile: OrgFile } = {
                        label: `  ${file.file.name}`, // Indent to show hierarchy
                        description: file.fullPath ? `$(folder) ${org.orgName}/${file.fullPath}` : `$(folder) ${org.orgName}`,
                        detail: undefined, // Keep detail clean for file items
                        orgFile: file.file
                    };
                    items.push(item);
                }
            }
        }

        return items;
    }

    private updateSelectionStatus(quickPick: vscode.QuickPick<vscode.QuickPickItem>, selectedItems: readonly vscode.QuickPickItem[]): void {
        if (selectedItems.length === 1) {
            quickPick.title = `1 file selected - Select another file to compare, or press Enter to select only this file`;
        } else if (selectedItems.length === 2) {
            quickPick.title = `2 files selected - Press Enter to compare these files`;
        } else if (selectedItems.length > 2) {
            quickPick.title = `${selectedItems.length} files selected - Please select only 1 or 2 files`;
        } else {
            quickPick.title = undefined;
        }
    }

}
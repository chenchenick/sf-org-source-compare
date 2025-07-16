import * as vscode from 'vscode';
import { CompareSelection, OrgFile } from '../types';
import { OrgManager } from './OrgManager';

export class FileCompareService {
    private selectedFiles: OrgFile[] = [];
    private orgManager: OrgManager;

    constructor(orgManager: OrgManager) {
        this.orgManager = orgManager;
    }

    public selectFile(file: OrgFile): void {
        // Check if file is already selected
        const existingIndex = this.selectedFiles.findIndex(f => f.id === file.id);
        
        if (existingIndex >= 0) {
            // File is already selected, remove it (toggle off)
            this.selectedFiles.splice(existingIndex, 1);
        } else {
            // Add file to selection (max 2 files)
            if (this.selectedFiles.length >= 2) {
                // Replace the oldest selection
                this.selectedFiles.shift();
            }
            this.selectedFiles.push(file);
        }
        
        this.updateStatusBar();
        // Trigger tree refresh to show visual indicators
        vscode.commands.executeCommand('sf-org-source-compare.refreshOrgs');
    }

    public clearSelection(): void {
        this.selectedFiles = [];
        this.updateStatusBar();
        // Trigger tree refresh to remove visual indicators
        vscode.commands.executeCommand('sf-org-source-compare.refreshOrgs');
    }

    public getSelectedFiles(): OrgFile[] {
        return this.selectedFiles;
    }

    public canCompare(): boolean {
        return this.selectedFiles.length === 2;
    }

    public async compareSelectedFiles(): Promise<void> {
        if (!this.canCompare()) {
            vscode.window.showWarningMessage('Please select 2 files to compare.');
            return;
        }

        const file1 = this.selectedFiles[0];
        const file2 = this.selectedFiles[1];

        try {
            vscode.window.showInformationMessage('Loading file contents from Salesforce orgs...');
            
            const uri1 = await this.createNamedTempFile(file1);
            const uri2 = await this.createNamedTempFile(file2);

            // Get org names for the title
            const org1 = this.orgManager.getOrg(file1.orgId);
            const org2 = this.orgManager.getOrg(file2.orgId);
            
            const org1Name = org1?.alias || org1?.username || 'Unknown Org';
            const org2Name = org2?.alias || org2?.username || 'Unknown Org';
            
            const title = `${org1Name}: ${file1.name} ↔ ${org2Name}: ${file2.name}`;
            
            await vscode.commands.executeCommand(
                'vscode.diff',
                uri1,
                uri2,
                title
            );

            vscode.window.showInformationMessage('Files opened for comparison.');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to compare files: ${error}`);
        }
    }

    private async createNamedTempFile(file: OrgFile): Promise<vscode.Uri> {
        // Get actual file content from the org (unmodified)
        const content = await this.orgManager.getFileContent(file.orgId, file.id);
        
        // Get org name for the file name
        const org = this.orgManager.getOrg(file.orgId);
        const orgName = org?.alias || org?.username || 'UnknownOrg';
        
        // Create a meaningful file name: FileName_OrgName
        const tempFileName = `${file.name}_${orgName}`;
        
        // Create the document with original content (no modifications)
        const doc = await vscode.workspace.openTextDocument({
            content: content,
            language: this.getLanguageFromFileName(file.name)
        });
        
        // Create a named URI that will show up with the proper name
        const namedUri = vscode.Uri.parse(`untitled:${tempFileName}`);
        
        return doc.uri;
    }


    private getLanguageFromFileName(fileName: string): string {
        const extension = fileName.split('.').pop()?.toLowerCase();
        switch (extension) {
            case 'cls':
            case 'trigger':
                return 'apex';
            case 'js':
                return 'javascript';
            case 'xml':
                return 'xml';
            case 'html':
                return 'html';
            case 'css':
                return 'css';
            default:
                return 'plaintext';
        }
    }

    private updateStatusBar(): void {
        let statusText = 'SF Compare: ';
        
        if (this.selectedFiles.length === 0) {
            statusText += 'No files selected';
        } else if (this.selectedFiles.length === 1) {
            statusText += `${this.selectedFiles[0].name} (select 1 more file)`;
        } else {
            statusText += `${this.selectedFiles[0].name} ↔ ${this.selectedFiles[1].name} (ready to compare)`;
        }
        
        vscode.window.setStatusBarMessage(statusText, 3000);
    }
}
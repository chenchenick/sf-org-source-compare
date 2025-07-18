import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CompareSelection, OrgFile } from '../types';
import { OrgManager } from './OrgManager';

export class FileCompareService {
    private selectedFiles: OrgFile[] = [];
    private orgManager: OrgManager;
    private tempDir: string;
    private sessionId: string;
    private createdFiles: Set<string> = new Set();
    private isComparing: boolean = false;
    private statusBarItem: vscode.StatusBarItem;

    constructor(orgManager: OrgManager) {
        this.orgManager = orgManager;
        this.sessionId = this.generateSessionId();
        this.tempDir = this.createSessionTempDirectory();
        
        // Create persistent status bar item
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.show();
        this.updateStatusBarItem();
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
        this.updateStatusBarItem();
        // Trigger tree refresh to show visual indicators
        vscode.commands.executeCommand('sf-org-source-compare.refreshOrgs');
    }

    public clearSelection(): void {
        this.selectedFiles = [];
        this.updateStatusBar();
        this.updateStatusBarItem();
        // Trigger tree refresh to remove visual indicators
        vscode.commands.executeCommand('sf-org-source-compare.refreshOrgs');
    }

    public getSelectedFiles(): OrgFile[] {
        return this.selectedFiles;
    }

    public canCompare(): boolean {
        return this.selectedFiles.length === 2;
    }

    public isComparingFiles(): boolean {
        return this.isComparing;
    }

    public async compareSelectedFiles(): Promise<void> {
        if (!this.canCompare()) {
            vscode.window.showWarningMessage('Please select 2 files to compare.');
            return;
        }

        const file1 = this.selectedFiles[0];
        const file2 = this.selectedFiles[1];

        this.isComparing = true;
        
        // Trigger tree refresh immediately to show loading state
        vscode.commands.executeCommand('sf-org-source-compare.refreshOrgs');
        
        // Small delay to ensure UI updates
        await new Promise(resolve => setTimeout(resolve, 100));

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.SourceControl,
            title: "SF Org Compare",
            cancellable: false
        }, async (progress) => {
            try {
                // Update progress and status bar
                progress.report({ increment: 0, message: "Preparing comparison..." });
                this.updateDetailedStatusBar('Preparing file comparison...');
                
                // Trigger tree refresh to show loading state - use await to ensure it completes
                await vscode.commands.executeCommand('sf-org-source-compare.refreshOrgs');

                // Get org names for progress messages
                const org1 = this.orgManager.getOrg(file1.orgId);
                const org2 = this.orgManager.getOrg(file2.orgId);
                
                const org1Name = org1?.alias || org1?.username || 'Unknown Org';
                const org2Name = org2?.alias || org2?.username || 'Unknown Org';
                
                // Load first file
                progress.report({ increment: 10, message: `Loading ${file1.name} from ${org1Name}...` });
                this.updateDetailedStatusBar(`Loading ${file1.name} from ${org1Name}...`);
                this.updateStatusBarItem();
                const uri1 = await this.createNamedTempFile(file1);
                
                // Load second file
                progress.report({ increment: 50, message: `Loading ${file2.name} from ${org2Name}...` });
                this.updateDetailedStatusBar(`Loading ${file2.name} from ${org2Name}...`);
                this.updateStatusBarItem();
                const uri2 = await this.createNamedTempFile(file2);

                // Open comparison
                progress.report({ increment: 80, message: "Opening comparison view..." });
                this.updateDetailedStatusBar('Opening comparison view...');
                this.updateStatusBarItem();
                
                const title = `${org1Name}: ${file1.name} ↔ ${org2Name}: ${file2.name}`;
                
                await vscode.commands.executeCommand(
                    'vscode.diff',
                    uri1,
                    uri2,
                    title
                );

                // Complete
                progress.report({ increment: 100, message: "Comparison ready!" });
                this.updateDetailedStatusBar('Comparison completed successfully!');
                
                // Show success message briefly
                setTimeout(() => {
                    vscode.window.showInformationMessage('Files comparison opened successfully.');
                }, 500);

            } catch (error) {
                progress.report({ increment: 100, message: "Comparison failed" });
                this.updateDetailedStatusBar('Comparison failed');
                vscode.window.showErrorMessage(`Failed to compare files: ${error}`);
            } finally {
                // Reset comparing state
                this.isComparing = false;
                this.updateStatusBarItem();
                
                // Trigger tree refresh to remove loading state
                setTimeout(() => {
                    vscode.commands.executeCommand('sf-org-source-compare.refreshOrgs');
                }, 1000);
            }
        });
    }

    private async createNamedTempFile(file: OrgFile): Promise<vscode.Uri> {
        try {
            // Get actual file content from the org
            const content = await this.orgManager.getFileContent(file.orgId, file.id);
            
            // Get org name for the file name
            const org = this.orgManager.getOrg(file.orgId);
            const orgName = this.sanitizeFileName(org?.alias || org?.username || 'UnknownOrg');
            
            // Create a meaningful file name: OrgName_FileName
            const sanitizedFileName = this.sanitizeFileName(file.name);
            const tempFileName = `${orgName}_${sanitizedFileName}`;
            const tempFilePath = path.join(this.tempDir, tempFileName);
            
            // Ensure directory exists
            await fs.promises.mkdir(path.dirname(tempFilePath), { recursive: true });
            
            // Write content to temporary file
            await fs.promises.writeFile(tempFilePath, content, 'utf8');
            
            // Track created file for cleanup
            this.createdFiles.add(tempFilePath);
            
            console.log('Created temporary file:', tempFilePath);
            return vscode.Uri.file(tempFilePath);
        } catch (error) {
            console.error('Failed to create temporary file:', error);
            throw new Error(`Failed to create temporary file for ${file.name}: ${error}`);
        }
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

    private updateDetailedStatusBar(message: string): void {
        vscode.window.setStatusBarMessage(`SF Compare: ${message}`, 5000);
        this.statusBarItem.text = `$(sync~spin) SF Compare: ${message}`;
        this.statusBarItem.tooltip = message;
    }

    private updateStatusBarItem(): void {
        if (this.isComparing) {
            this.statusBarItem.text = `$(sync~spin) SF Compare: Comparing files...`;
            this.statusBarItem.tooltip = 'File comparison in progress';
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else if (this.selectedFiles.length === 0) {
            this.statusBarItem.text = `$(file) SF Compare: No files selected`;
            this.statusBarItem.tooltip = 'Select files to compare';
            this.statusBarItem.backgroundColor = undefined;
        } else if (this.selectedFiles.length === 1) {
            this.statusBarItem.text = `$(file) SF Compare: ${this.selectedFiles[0].name} (select 1 more)`;
            this.statusBarItem.tooltip = 'Select one more file to compare';
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
        } else {
            this.statusBarItem.text = `$(diff) SF Compare: Ready to compare`;
            this.statusBarItem.tooltip = `Ready to compare ${this.selectedFiles[0].name} ↔ ${this.selectedFiles[1].name}`;
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
        }
    }

    private generateSessionId(): string {
        return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    private createSessionTempDirectory(): string {
        const tempDir = path.join(os.tmpdir(), 'sfcompare', this.sessionId);
        
        try {
            fs.mkdirSync(tempDir, { recursive: true });
            console.log('Created temporary directory:', tempDir);
            return tempDir;
        } catch (error) {
            console.error('Failed to create temporary directory:', error);
            // Fallback to system temp directory
            return os.tmpdir();
        }
    }

    private sanitizeFileName(fileName: string): string {
        // Remove or replace invalid characters for file names
        return fileName
            .replace(/[<>:"/\\|?*]/g, '_')  // Replace invalid characters with underscore
            .replace(/\s+/g, '_')          // Replace spaces with underscore
            .replace(/_{2,}/g, '_')        // Replace multiple underscores with single
            .replace(/^_|_$/g, '');        // Remove leading/trailing underscores
    }

    public async cleanup(): Promise<void> {
        console.log('Cleaning up temporary files...');
        
        // Dispose of status bar item
        if (this.statusBarItem) {
            this.statusBarItem.dispose();
        }
        
        // Delete all created files
        for (const filePath of this.createdFiles) {
            try {
                if (fs.existsSync(filePath)) {
                    await fs.promises.unlink(filePath);
                    console.log('Deleted temporary file:', filePath);
                }
            } catch (error) {
                console.warn('Failed to delete temporary file:', filePath, error);
            }
        }
        
        // Clear the tracking set
        this.createdFiles.clear();
        
        // Try to remove the session directory if empty
        try {
            if (fs.existsSync(this.tempDir)) {
                const files = await fs.promises.readdir(this.tempDir);
                if (files.length === 0) {
                    await fs.promises.rmdir(this.tempDir);
                    console.log('Removed empty temporary directory:', this.tempDir);
                }
            }
        } catch (error) {
            console.warn('Failed to remove temporary directory:', this.tempDir, error);
        }
    }

    public static async cleanupOldSessions(): Promise<void> {
        const baseTempDir = path.join(os.tmpdir(), 'sfcompare');
        
        try {
            if (!fs.existsSync(baseTempDir)) {
                return;
            }
            
            const sessions = await fs.promises.readdir(baseTempDir);
            const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
            
            for (const sessionDir of sessions) {
                const sessionPath = path.join(baseTempDir, sessionDir);
                
                try {
                    const stats = await fs.promises.stat(sessionPath);
                    
                    // Remove sessions older than 24 hours
                    if (stats.isDirectory() && stats.mtime.getTime() < cutoffTime) {
                        await fs.promises.rm(sessionPath, { recursive: true, force: true });
                        console.log('Cleaned up old session:', sessionPath);
                    }
                } catch (error) {
                    console.warn('Failed to cleanup old session:', sessionPath, error);
                }
            }
        } catch (error) {
            console.warn('Failed to cleanup old sessions:', error);
        }
    }
}
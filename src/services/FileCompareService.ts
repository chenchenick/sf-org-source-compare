import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CompareSelection, OrgFile, MultiCompareSelection } from '../types';
import { EnhancedOrgManager } from '../metadata/EnhancedOrgManager';
import { ProgressManager } from '../progress/ProgressManager';
import { ConfigurationManager, SF_CONFIG } from '../config';
import { ErrorHandler, ErrorHandlingStrategy, ErrorUtils } from '../errors/ErrorHandler';
import { getContainer, ServiceTokens } from '../di';

export class FileCompareService {
    private selectedFiles: OrgFile[] = [];
    private maxFiles: number = SF_CONFIG.COMPARE.DEFAULT_MAX_FILES;
    private enhancedOrgManager: EnhancedOrgManager;
    private tempDir: string;
    private sessionId: string;
    private createdFiles: Set<string> = new Set();
    private isComparing: boolean = false;
    private statusBarItem: vscode.StatusBarItem;
    private config: ConfigurationManager;
    private errorHandler: ErrorHandler;
    private progressManager: ProgressManager;

    constructor(enhancedOrgManager: EnhancedOrgManager) {
        this.config = ConfigurationManager.getInstance();
        this.errorHandler = ErrorHandler.getInstance();
        this.progressManager = ProgressManager.getInstance();
        this.enhancedOrgManager = enhancedOrgManager;
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
            // Add file to selection (up to maxFiles)
            if (this.selectedFiles.length >= this.maxFiles) {
                // Replace the oldest selection
                this.selectedFiles.shift();
            }
            this.selectedFiles.push(file);
        }
        
        this.updateStatusBar();
        this.updateStatusBarItem();
        // Trigger tree view refresh to show visual indicators (no org requests)
        vscode.commands.executeCommand('sf-org-source-compare.refreshTreeView');
    }

    public clearSelection(): void {
        this.selectedFiles = [];
        this.updateStatusBar();
        this.updateStatusBarItem();
        // Trigger tree view refresh to remove visual indicators (no org requests)
        vscode.commands.executeCommand('sf-org-source-compare.refreshTreeView');
    }

    public getSelectedFiles(): OrgFile[] {
        return this.selectedFiles;
    }

    public canCompare(): boolean {
        return this.selectedFiles.length >= 2;
    }

    public getCompareType(): 'two-way' | 'three-way' | 'four-way' | 'multi-way' {
        const count = this.selectedFiles.length;
        if (count === 2) return 'two-way';
        if (count === 3) return 'three-way';
        if (count === 4) return 'four-way';
        return 'multi-way';
    }

    public getMaxFiles(): number {
        return this.maxFiles;
    }

    public setMaxFiles(maxFiles: number): void {
        if (maxFiles < 2) {
            throw new Error('Maximum files must be at least 2');
        }
        if (maxFiles > SF_CONFIG.COMPARE.MAX_FILES) {
            throw new Error(`Maximum files cannot exceed ${SF_CONFIG.COMPARE.MAX_FILES}`);
        }
        
        this.maxFiles = maxFiles;
        
        // Trim selection if it exceeds new limit
        if (this.selectedFiles.length > maxFiles) {
            this.selectedFiles = this.selectedFiles.slice(-maxFiles);
            this.updateStatusBar();
            this.updateStatusBarItem();
            vscode.commands.executeCommand('sf-org-source-compare.refreshTreeView');
        }
    }

    public isComparingFiles(): boolean {
        return this.isComparing;
    }

    public async compareSelectedFiles(): Promise<void> {
        if (!this.canCompare()) {
            vscode.window.showWarningMessage('Please select at least 2 files to compare.');
            return;
        }

        const compareType = this.getCompareType();
        
        // Handle multi-way comparison
        if (compareType !== 'two-way') {
            const result = await vscode.window.showInformationMessage(
                `${compareType} comparison selected (${this.selectedFiles.length} files). Open multi-way comparison view?`,
                'Open Multi-Way View', 'Compare First 2', 'Cancel'
            );
            
            if (result === 'Open Multi-Way View') {
                await this.openMultiWayComparison();
                return;
            } else if (result !== 'Compare First 2') {
                return;
            }
        }

        const file1 = this.selectedFiles[0];
        const file2 = this.selectedFiles[1];

        this.isComparing = true;
        
        // Trigger tree view refresh immediately to show loading state (no org requests)
        vscode.commands.executeCommand('sf-org-source-compare.refreshTreeView');
        
        // Small delay to ensure UI updates
        await new Promise(resolve => setTimeout(resolve, 100));

        await this.progressManager.withProgress('FILE_COMPARISON', async (progress) => {
            try {
                progress.startStep(0, 'Preparing file comparison');
                this.updateDetailedStatusBar('Preparing file comparison...');
                
                // Trigger tree view refresh to show loading state (no org requests)
                vscode.commands.executeCommand('sf-org-source-compare.refreshTreeView');

                // Get org names for progress messages
                const org1 = this.enhancedOrgManager.getOrg(file1.orgId);
                const org2 = this.enhancedOrgManager.getOrg(file2.orgId);
                
                const org1Name = org1?.alias || org1?.username || 'Unknown Org';
                const org2Name = org2?.alias || org2?.username || 'Unknown Org';
                progress.completeStep(0);
                
                // Read file contents
                progress.startStep(1, `Reading ${file1.name} from ${org1Name}`);
                this.updateDetailedStatusBar(`Preparing ${file1.name} from ${org1Name}...`);
                this.updateStatusBarItem();
                const uri1 = await this.createNamedTempFile(file1);
                
                progress.updateStep(50, `Reading ${file2.name} from ${org2Name}`);
                this.updateDetailedStatusBar(`Preparing ${file2.name} from ${org2Name}...`);
                this.updateStatusBarItem();
                const uri2 = await this.createNamedTempFile(file2);
                progress.completeStep(1);

                // Analyze differences
                progress.startStep(2, 'Analyzing file differences');
                this.updateDetailedStatusBar('Analyzing differences...');
                this.updateStatusBarItem();
                await new Promise(resolve => setTimeout(resolve, 200)); // Brief analysis simulation
                progress.completeStep(2);

                // Open comparison
                progress.startStep(3, 'Opening comparison view');
                this.updateDetailedStatusBar('Opening comparison view...');
                this.updateStatusBarItem();
                
                const title = `${org1Name}: ${file1.name} ↔ ${org2Name}: ${file2.name}`;
                
                await vscode.commands.executeCommand(
                    'vscode.diff',
                    uri1,
                    uri2,
                    title
                );
                progress.completeStep(3);

                // Complete
                this.updateDetailedStatusBar('Comparison completed successfully!');
                
                // Show success message briefly
                const hasLocalFiles = file1.filePath && file2.filePath;
                const message = hasLocalFiles 
                    ? 'File comparison opened (using local cached files)'
                    : 'File comparison opened successfully';
                    
                setTimeout(() => {
                    vscode.window.showInformationMessage(message);
                }, 500);

            } catch (error) {
                progress.fail("Comparison failed");
                this.updateDetailedStatusBar('Comparison failed');
                
                // Use standardized error handling
                const standardError = this.errorHandler.standardizeError(error as Error, 'File comparison');
                this.errorHandler.showErrorToUser(standardError);
            } finally {
                // Reset comparing state
                this.isComparing = false;
                this.updateStatusBarItem();
                
                // Trigger tree view refresh to remove loading state (no org requests)
                setTimeout(() => {
                    vscode.commands.executeCommand('sf-org-source-compare.refreshTreeView');
                }, 1000);
            }
        });
    }

    private async createNamedTempFile(file: OrgFile): Promise<vscode.Uri> {
        try {
            // If file has a local file path, use it directly
            if (file.filePath && fs.existsSync(file.filePath)) {
                console.log('Using existing local file:', file.filePath);
                return vscode.Uri.file(file.filePath);
            }
            
            // Fallback: retrieve content and create temp file (for backward compatibility)
            console.log('Falling back to content retrieval for file:', file.name);
            const content = await this.enhancedOrgManager.getFileContentById(file.orgId, file.id);
            
            // Get org name for the file name
            const org = this.enhancedOrgManager.getOrg(file.orgId);
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
        
        vscode.window.setStatusBarMessage(statusText, this.config.getUITimeout('status_bar'));
    }

    private updateDetailedStatusBar(message: string): void {
        vscode.window.setStatusBarMessage(`SF Compare: ${message}`, this.config.getUITimeout('status_bar_extended'));
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
        } else if (this.selectedFiles.length === 2) {
            this.statusBarItem.text = `$(diff) SF Compare: Ready to compare`;
            this.statusBarItem.tooltip = `Ready to compare ${this.selectedFiles[0].name} ↔ ${this.selectedFiles[1].name}`;
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
        } else {
            const compareType = this.getCompareType();
            this.statusBarItem.text = `$(diff) SF Compare: ${compareType} ready`;
            this.statusBarItem.tooltip = `Ready for ${compareType} comparison (${this.selectedFiles.length} files selected)`;
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
        }
    }

    /**
     * Open multi-way comparison view
     */
    private async openMultiWayComparison(): Promise<void> {
        try {
            const container = getContainer();
            const multiFileCompareWebview = container.resolve(ServiceTokens.MULTI_FILE_COMPARE_WEBVIEW) as any;
            const multiFileCompareService = container.resolve(ServiceTokens.MULTI_FILE_COMPARE_SERVICE) as any;

            const selection: MultiCompareSelection = {
                files: [...this.selectedFiles],
                compareType: this.getCompareType(),
                layout: multiFileCompareService.getRecommendedLayout(this.selectedFiles.length),
                maxFiles: this.maxFiles
            };

            await multiFileCompareWebview.show(selection);
            
            vscode.window.showInformationMessage(
                `Opening ${this.getCompareType()} comparison for ${this.selectedFiles.length} files`
            );
        } catch (error) {
            console.error('Failed to open multi-way comparison:', error);
            vscode.window.showErrorMessage(
                `Failed to open multi-way comparison: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    private generateSessionId(): string {
        return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    private createSessionTempDirectory(): string {
        const tempDir = path.join(os.tmpdir(), SF_CONFIG.FS.TEMP_DIR_PREFIX, this.sessionId);
        
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
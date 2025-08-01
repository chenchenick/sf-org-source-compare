import * as vscode from 'vscode';
import * as path from 'path';
import { MultiFileCompareService, MultiCompareResult } from '../services/MultiFileCompareService';
import { OrgFile, MultiCompareSelection } from '../types';
import { SF_CONFIG } from '../config';

/**
 * Webview provider for multi-file comparison
 */
export class MultiFileCompareWebview {
    private panel: vscode.WebviewPanel | undefined;
    private multiCompareService: MultiFileCompareService;
    private context: vscode.ExtensionContext;

    constructor(
        context: vscode.ExtensionContext,
        multiCompareService: MultiFileCompareService
    ) {
        this.context = context;
        this.multiCompareService = multiCompareService;
    }

    /**
     * Show the multi-file comparison webview
     */
    public async show(selection: MultiCompareSelection): Promise<void> {
        if (this.panel) {
            this.panel.reveal();
            await this.updateComparison(selection);
            return;
        }

        const title = this.multiCompareService.generateComparisonTitle(selection.files);
        
        this.panel = vscode.window.createWebviewPanel(
            'multiFileCompare',
            `Multi-Compare: ${title}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'media'))
                ]
            }
        );

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(
            message => this.handleWebviewMessage(message),
            undefined,
            this.context.subscriptions
        );

        await this.updateComparison(selection);
    }

    /**
     * Update the comparison display
     */
    private async updateComparison(selection: MultiCompareSelection): Promise<void> {
        if (!this.panel) {
            return;
        }

        try {
            // Show loading state
            this.panel.webview.html = this.getLoadingHtml();

            // Perform comparison
            const result = await this.multiCompareService.compareFiles(selection);

            // Update with results
            this.panel.webview.html = this.getComparisonHtml(result);
            
        } catch (error) {
            console.error('Error performing multi-file comparison:', error);
            this.panel.webview.html = this.getErrorHtml(error as Error);
        }
    }

    /**
     * Handle messages from the webview
     */
    private handleWebviewMessage(message: any): void {
        switch (message.command) {
            case 'scroll':
                // Broadcast scroll position to all panes
                this.panel?.webview.postMessage({
                    command: 'syncScroll',
                    scrollTop: message.scrollTop
                });
                break;
            case 'exportResults':
                this.exportComparisonResults(message.data);
                break;
            case 'switchLayout':
                this.switchLayout(message.layout);
                break;
        }
    }

    /**
     * Generate loading HTML
     */
    private getLoadingHtml(): string {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Multi-File Comparison</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    margin: 0;
                    padding: 20px;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                }
                .loading {
                    text-align: center;
                }
                .spinner {
                    border: 4px solid var(--vscode-button-secondaryBackground);
                    border-top: 4px solid var(--vscode-button-background);
                    border-radius: 50%;
                    width: 40px;
                    height: 40px;
                    animation: spin 2s linear infinite;
                    margin: 0 auto 20px;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        </head>
        <body>
            <div class="loading">
                <div class="spinner"></div>
                <h3>Comparing Files...</h3>
                <p>Please wait while we analyze the differences.</p>
            </div>
        </body>
        </html>
        `;
    }

    /**
     * Generate comparison HTML
     */
    private getComparisonHtml(result: MultiCompareResult): string {
        const layoutClass = `layout-${result.layout}`;
        const fileCount = result.files.length;
        
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Multi-File Comparison</title>
            <style>
                ${this.getComparisonStyles()}
            </style>
        </head>
        <body>
            <div class="comparison-container ${layoutClass}">
                <div class="header">
                    <div class="title">
                        <h2>${result.compareType.toUpperCase()} Comparison</h2>
                        <div class="stats">
                            <span class="stat added">+${result.addedLines}</span>
                            <span class="stat removed">-${result.removedLines}</span>
                            <span class="stat modified">~${result.modifiedLines}</span>
                            <span class="stat total">${result.totalLines} lines</span>
                        </div>
                    </div>
                    <div class="controls">
                        <select id="layoutSelect" onchange="switchLayout(this.value)">
                            <option value="horizontal" ${result.layout === 'horizontal' ? 'selected' : ''}>Horizontal</option>
                            <option value="vertical" ${result.layout === 'vertical' ? 'selected' : ''}>Vertical</option>
                            <option value="grid" ${result.layout === 'grid' ? 'selected' : ''}>Grid</option>
                        </select>
                        <button onclick="exportResults()">Export</button>
                    </div>
                </div>
                <div class="files-container" style="--file-count: ${fileCount}">
                    ${result.files.map((file, index) => this.generateFilePane(file, index)).join('')}
                </div>
            </div>
            <script>
                ${this.getComparisonScript()}
            </script>
        </body>
        </html>
        `;
    }

    /**
     * Generate HTML for a single file pane
     */
    private generateFilePane(file: any, index: number): string {
        const colorConfig = SF_CONFIG.COMPARE.COLORS[index] || SF_CONFIG.COMPARE.COLORS[0];
        
        return `
        <div class="file-pane" data-file-index="${index}">
            <div class="file-header" style="border-left: 4px solid var(--vscode-${colorConfig.primary})">
                <div class="file-info">
                    <span class="file-number">[${index + 1}]</span>
                    <span class="file-name">${file.file.name}</span>
                    <span class="org-name">${file.orgName}</span>
                </div>
                <div class="file-stats">
                    ${file.lines.filter((l: any) => l.type === 'added').length} additions,
                    ${file.lines.filter((l: any) => l.type === 'removed').length} deletions
                </div>
            </div>
            <div class="file-content" onscroll="syncScroll(this)">
                <div class="line-numbers">
                    ${file.lines.map((line: any) => `<div class="line-number">${line.lineNumber}</div>`).join('')}
                </div>
                <div class="code-lines">
                    ${file.lines.map((line: any) => `
                        <div class="code-line ${line.type}" data-line="${line.lineNumber}">
                            <span class="line-content">${this.escapeHtml(line.content)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
        `;
    }

    /**
     * Get CSS styles for the comparison view
     */
    private getComparisonStyles(): string {
        return `
        body {
            margin: 0;
            padding: 0;
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            height: 100vh;
            overflow: hidden;
        }

        .comparison-container {
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 15px;
            background-color: var(--vscode-titleBar-activeBackground);
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .title h2 {
            margin: 0;
            font-size: 16px;
        }

        .stats {
            display: flex;
            gap: 15px;
            margin-top: 5px;
        }

        .stat {
            font-size: 12px;
            padding: 2px 6px;
            border-radius: 3px;
        }

        .stat.added { background-color: var(--vscode-diffEditor-insertedTextBackground); }
        .stat.removed { background-color: var(--vscode-diffEditor-removedTextBackground); }
        .stat.modified { background-color: var(--vscode-diffEditor-modifiedTextBackground); }
        .stat.total { background-color: var(--vscode-button-secondaryBackground); }

        .controls {
            display: flex;
            gap: 10px;
            align-items: center;
        }

        .controls select, .controls button {
            padding: 4px 8px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-button-border);
            border-radius: 3px;
        }

        .files-container {
            flex: 1;
            display: flex;
            overflow: hidden;
        }

        .layout-horizontal .files-container {
            flex-direction: row;
        }

        .layout-vertical .files-container {
            flex-direction: column;
        }

        .layout-grid .files-container {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
        }

        .file-pane {
            flex: 1;
            display: flex;
            flex-direction: column;
            border-right: 1px solid var(--vscode-panel-border);
            min-width: 300px;
        }

        .file-pane:last-child {
            border-right: none;
        }

        .file-header {
            padding: 10px;
            background-color: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .file-info {
            display: flex;
            gap: 10px;
            align-items: center;
        }

        .file-number {
            font-weight: bold;
            font-size: 12px;
        }

        .file-name {
            font-weight: bold;
        }

        .org-name {
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }

        .file-stats {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .file-content {
            flex: 1;
            display: flex;
            overflow-y: auto;
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            line-height: 1.4;
        }

        .line-numbers {
            background-color: var(--vscode-editorLineNumber-background);
            border-right: 1px solid var(--vscode-panel-border);
            padding: 0 8px;
            user-select: none;
            min-width: 50px;
            text-align: right;
        }

        .line-number {
            color: var(--vscode-editorLineNumber-foreground);
            font-size: 11px;
            line-height: 1.4;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: flex-end;
        }

        .code-lines {
            flex: 1;
            padding: 0 10px;
        }

        .code-line {
            line-height: 1.4;
            height: 20px;
            display: flex;
            align-items: center;
            white-space: pre;
            font-family: var(--vscode-editor-font-family);
        }

        .code-line.added {
            background-color: var(--vscode-diffEditor-insertedTextBackground);
        }

        .code-line.removed {
            background-color: var(--vscode-diffEditor-removedTextBackground);
        }

        .code-line.modified {
            background-color: var(--vscode-diffEditor-modifiedTextBackground);
        }

        .line-content {
            flex: 1;
        }

        @media (max-width: 800px) {
            .layout-horizontal .files-container,
            .layout-grid .files-container {
                flex-direction: column;
            }
        }
        `;
    }

    /**
     * Get JavaScript for the comparison view
     */
    private getComparisonScript(): string {
        return `
        const vscode = acquireVsCodeApi();
        let isScrollSyncing = false;

        function syncScroll(element) {
            if (isScrollSyncing) return;
            
            isScrollSyncing = true;
            const scrollTop = element.scrollTop;
            
            // Sync all other file content panes
            document.querySelectorAll('.file-content').forEach(pane => {
                if (pane !== element) {
                    pane.scrollTop = scrollTop;
                }
            });
            
            setTimeout(() => { isScrollSyncing = false; }, 10);
        }

        function switchLayout(layout) {
            vscode.postMessage({
                command: 'switchLayout',
                layout: layout
            });
        }

        function exportResults() {
            vscode.postMessage({
                command: 'exportResults',
                data: {
                    timestamp: new Date().toISOString(),
                    layout: document.querySelector('#layoutSelect').value
                }
            });
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'syncScroll':
                    if (!isScrollSyncing) {
                        document.querySelectorAll('.file-content').forEach(pane => {
                            pane.scrollTop = message.scrollTop;
                        });
                    }
                    break;
            }
        });
        `;
    }

    /**
     * Generate error HTML
     */
    private getErrorHtml(error: Error): string {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Comparison Error</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    margin: 0;
                    padding: 20px;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                }
                .error {
                    text-align: center;
                    color: var(--vscode-errorForeground);
                }
            </style>
        </head>
        <body>
            <div class="error">
                <h2>❌ Comparison Failed</h2>
                <p>${error.message}</p>
                <small>Check the console for more details.</small>
            </div>
        </body>
        </html>
        `;
    }

    /**
     * Escape HTML characters
     */
    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Export comparison results
     */
    private async exportComparisonResults(data: any): Promise<void> {
        vscode.window.showInformationMessage('Export functionality will be implemented in a future update.');
    }

    /**
     * Switch comparison layout
     */
    private async switchLayout(layout: string): Promise<void> {
        // This would trigger a re-render with the new layout
        vscode.window.showInformationMessage(`Layout switched to ${layout}. Full implementation coming soon.`);
    }
}
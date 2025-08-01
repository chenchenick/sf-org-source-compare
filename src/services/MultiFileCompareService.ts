import * as vscode from 'vscode';
import { OrgFile, MultiCompareSelection } from '../types';
import { EnhancedOrgManager } from '../metadata/EnhancedOrgManager';
import { SF_CONFIG } from '../config';

export interface DiffLine {
    lineNumber: number;
    content: string;
    type: 'unchanged' | 'added' | 'removed' | 'modified';
    sourceFile?: number; // Index of file this line comes from
}

export interface FileDiffResult {
    file: OrgFile;
    lines: DiffLine[];
    orgName: string;
}

export interface MultiCompareResult {
    files: FileDiffResult[];
    compareType: 'two-way' | 'three-way' | 'four-way' | 'multi-way';
    layout: 'horizontal' | 'vertical' | 'grid';
    totalLines: number;
    addedLines: number;
    removedLines: number;
    modifiedLines: number;
}

/**
 * Service for handling multi-way file comparisons
 */
export class MultiFileCompareService {
    constructor(private enhancedOrgManager: EnhancedOrgManager) {}

    /**
     * Perform multi-way comparison of the selected files
     */
    public async compareFiles(selection: MultiCompareSelection): Promise<MultiCompareResult> {
        if (selection.files.length < 2) {
            throw new Error('At least 2 files are required for comparison');
        }

        if (selection.files.length > SF_CONFIG.COMPARE.MAX_FILES) {
            throw new Error(`Cannot compare more than ${SF_CONFIG.COMPARE.MAX_FILES} files`);
        }

        // Get file contents
        const fileContents = await Promise.all(
            selection.files.map(async (file) => {
                const content = await this.getFileContent(file);
                const orgName = await this.getOrgName(file.orgId);
                return { file, content, orgName };
            })
        );

        // Perform the comparison
        const diffResults = this.performMultiWayDiff(fileContents);

        // Calculate statistics
        const stats = this.calculateDiffStats(diffResults);

        return {
            files: diffResults,
            compareType: selection.compareType,
            layout: selection.layout,
            ...stats
        };
    }

    /**
     * Get file content either from local path or by retrieving from org
     */
    private async getFileContent(file: OrgFile): Promise<string> {
        if (file.filePath) {
            try {
                const uri = vscode.Uri.file(file.filePath);
                const document = await vscode.workspace.openTextDocument(uri);
                return document.getText();
            } catch (error) {
                console.warn(`Failed to read local file ${file.filePath}, falling back to org content`);
            }
        }

        // Fallback to org content retrieval
        try {
            const content = await this.enhancedOrgManager.getFileContentById(file.orgId, file.id);
            return content || '';
        } catch (error) {
            console.error(`Failed to retrieve content for file ${file.name}:`, error);
            return '';
        }
    }

    /**
     * Get organization display name
     */
    private async getOrgName(orgId: string): Promise<string> {
        const org = this.enhancedOrgManager.getOrg(orgId);
        return org ? (org.alias || org.username) : 'Unknown Org';
    }

    /**
     * Perform multi-way diff comparison
     */
    private performMultiWayDiff(fileContents: { file: OrgFile; content: string; orgName: string }[]): FileDiffResult[] {
        // Split all files into lines
        const fileLinesData = fileContents.map(({ file, content, orgName }) => ({
            file,
            orgName,
            lines: content.split('\n')
        }));

        // For now, implement a simple line-by-line comparison
        // In a more advanced implementation, we would use a proper multi-way diff algorithm
        const maxLines = Math.max(...fileLinesData.map(f => f.lines.length));
        
        return fileLinesData.map((fileData, fileIndex) => {
            const diffLines: DiffLine[] = [];

            for (let lineIndex = 0; lineIndex < maxLines; lineIndex++) {
                const currentLine = fileData.lines[lineIndex] || '';
                
                // Compare this line with the same line in other files
                const otherLines = fileLinesData
                    .filter((_, idx) => idx !== fileIndex)
                    .map(f => f.lines[lineIndex] || '');

                let lineType: DiffLine['type'] = 'unchanged';
                
                // If line exists in current file
                if (lineIndex < fileData.lines.length) {
                    // Check if this line is different from others
                    const isDifferent = otherLines.some(otherLine => otherLine !== currentLine);
                    if (isDifferent) {
                        // Check if line exists in other files
                        const existsInOthers = otherLines.some(otherLine => otherLine === currentLine);
                        lineType = existsInOthers ? 'modified' : 'added';
                    }
                } else {
                    // Line doesn't exist in current file but exists in others
                    const hasContentInOthers = otherLines.some(otherLine => otherLine.trim() !== '');
                    if (hasContentInOthers) {
                        lineType = 'removed';
                    }
                }

                diffLines.push({
                    lineNumber: lineIndex + 1,
                    content: currentLine,
                    type: lineType,
                    sourceFile: fileIndex
                });
            }

            return {
                file: fileData.file,
                lines: diffLines,
                orgName: fileData.orgName
            };
        });
    }

    /**
     * Calculate diff statistics
     */
    private calculateDiffStats(diffResults: FileDiffResult[]): {
        totalLines: number;
        addedLines: number;
        removedLines: number;
        modifiedLines: number;
    } {
        let totalLines = 0;
        let addedLines = 0;
        let removedLines = 0;
        let modifiedLines = 0;

        diffResults.forEach(result => {
            totalLines += result.lines.length;
            result.lines.forEach(line => {
                switch (line.type) {
                    case 'added':
                        addedLines++;
                        break;
                    case 'removed':
                        removedLines++;
                        break;
                    case 'modified':
                        modifiedLines++;
                        break;
                }
            });
        });

        return { totalLines, addedLines, removedLines, modifiedLines };
    }

    /**
     * Generate comparison title for the webview
     */
    public generateComparisonTitle(files: OrgFile[]): string {
        if (files.length === 2) {
            return `${files[0].name} ↔ ${files[1].name}`;
        } else if (files.length === 3) {
            return `${files[0].name} ↔ ${files[1].name} ↔ ${files[2].name}`;
        } else {
            return `Multi-way Comparison (${files.length} files)`;
        }
    }

    /**
     * Get recommended layout based on number of files
     */
    public getRecommendedLayout(fileCount: number): 'horizontal' | 'vertical' | 'grid' {
        if (fileCount <= 2) {
            return 'horizontal';
        } else if (fileCount <= 3) {
            return 'horizontal';
        } else {
            return 'grid';
        }
    }
}
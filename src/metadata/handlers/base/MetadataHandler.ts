import { OrgFile, BundleContent, MetadataTypeDefinition, MetadataHandlerConfig, ProcessingResult } from '../../../types';

/**
 * Abstract base class for all metadata handlers
 * Each metadata type should implement this interface
 */
export abstract class MetadataHandler {
    protected config: MetadataHandlerConfig;
    protected definition: MetadataTypeDefinition;

    constructor(definition: MetadataTypeDefinition, config: MetadataHandlerConfig) {
        this.definition = definition;
        this.config = config;
    }

    /**
     * Get the metadata type definition
     */
    public getDefinition(): MetadataTypeDefinition {
        return this.definition;
    }

    /**
     * Get the handler configuration
     */
    public getConfig(): MetadataHandlerConfig {
        return this.config;
    }

    /**
     * Get list of files for this metadata type from an org
     */
    public abstract getFiles(orgId: string, orgIdentifier: string): Promise<OrgFile[]>;

    /**
     * Get content for a specific file
     */
    public abstract getContent(orgId: string, orgIdentifier: string, file: OrgFile): Promise<string | BundleContent>;

    /**
     * Get multiple files in parallel if supported
     */
    public async getFilesParallel(orgId: string, orgIdentifier: string): Promise<ProcessingResult<OrgFile>> {
        const startTime = Date.now();
        
        try {
            const files = await this.getFiles(orgId, orgIdentifier);
            const processingTime = Date.now() - startTime;
            
            return {
                success: files,
                failures: [],
                processingTime
            };
        } catch (error) {
            const processingTime = Date.now() - startTime;
            return {
                success: [],
                failures: [{ item: { orgId, orgIdentifier }, error: error instanceof Error ? error.message : String(error) }],
                processingTime
            };
        }
    }

    /**
     * Get content for multiple files in parallel if supported
     */
    public async getContentParallel(orgId: string, orgIdentifier: string, files: OrgFile[]): Promise<ProcessingResult<{ file: OrgFile; content: string | BundleContent }>> {
        const startTime = Date.now();
        const results: { file: OrgFile; content: string | BundleContent }[] = [];
        const failures: { item: any; error: string }[] = [];

        if (this.config.parallel && this.config.maxConcurrency && this.config.maxConcurrency > 1) {
            // Process files in parallel with concurrency limit
            const chunks = this.chunkArray(files, this.config.maxConcurrency);
            
            for (const chunk of chunks) {
                const promises = chunk.map(async (file) => {
                    try {
                        const content = await this.getContent(orgId, orgIdentifier, file);
                        return { file, content };
                    } catch (error) {
                        failures.push({ 
                            item: file, 
                            error: error instanceof Error ? error.message : String(error) 
                        });
                        return null;
                    }
                });

                const chunkResults = await Promise.all(promises);
                results.push(...chunkResults.filter(result => result !== null) as { file: OrgFile; content: string | BundleContent }[]);
            }
        } else {
            // Process files sequentially
            for (const file of files) {
                try {
                    const content = await this.getContent(orgId, orgIdentifier, file);
                    results.push({ file, content });
                } catch (error) {
                    failures.push({ 
                        item: file, 
                        error: error instanceof Error ? error.message : String(error) 
                    });
                }
            }
        }

        const processingTime = Date.now() - startTime;
        
        return {
            success: results,
            failures,
            processingTime
        };
    }

    /**
     * Check if this handler supports the given metadata type
     */
    public supports(metadataType: string): boolean {
        return this.definition.name === metadataType;
    }

    /**
     * Get supported metadata types
     */
    public getSupportedTypes(): string[] {
        return [this.definition.name];
    }

    /**
     * Validate if this handler can process files for the given org
     */
    public async canProcess(orgId: string, orgIdentifier: string): Promise<boolean> {
        // Default implementation - can be overridden by specific handlers
        return true;
    }

    /**
     * Get file extension for this metadata type
     */
    public getFileExtension(): string {
        return this.definition.fileExtensions[0] || '.txt';
    }

    /**
     * Get display name for this metadata type
     */
    public getDisplayName(): string {
        return this.definition.displayName;
    }

    /**
     * Check if this metadata type is a bundle
     */
    public isBundle(): boolean {
        return this.definition.isBundle;
    }

    /**
     * Get retrieval strategy for this metadata type
     */
    public getRetrievalStrategy(): string {
        return this.definition.retrievalStrategy;
    }

    /**
     * Execute SF CLI command with retry logic
     */
    protected async executeSfCommand(command: string, retries: number = 0): Promise<{ stdout: string; stderr: string }> {
        const maxRetries = this.config.retryCount || 3;
        const util = require('util');
        const exec = util.promisify(require('child_process').exec);

        try {
            const result = await exec(command, { 
                timeout: this.config.timeout || 30000 
            });
            return result;
        } catch (error) {
            if (retries < maxRetries) {
                console.log(`Command failed, retrying (${retries + 1}/${maxRetries}): ${command}`);
                await this.delay(1000 * (retries + 1)); // Exponential backoff
                return this.executeSfCommand(command, retries + 1);
            }
            throw error;
        }
    }

    /**
     * Utility method to chunk array for parallel processing
     */
    protected chunkArray<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * Utility method to add delay
     */
    protected delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Sanitize file name for safe usage
     */
    protected sanitizeFileName(fileName: string): string {
        return fileName
            .replace(/[<>:"/\\|?*]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_{2,}/g, '_')
            .replace(/^_|_$/g, '');
    }

    /**
     * Parse JSON response with error handling
     */
    protected parseJsonResponse(jsonString: string): any {
        try {
            const parsed = JSON.parse(jsonString);
            if (parsed.status !== 0) {
                throw new Error(parsed.message || 'SF CLI command failed');
            }
            return parsed;
        } catch (error) {
            if (error instanceof SyntaxError) {
                throw new Error(`Invalid JSON response: ${jsonString.substring(0, 100)}...`);
            }
            throw error;
        }
    }
}
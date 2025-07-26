import { ContentRequest, ContentResponse, MetadataQueryOptions, ProcessingResult, OrgFile, BundleContent } from '../types';
import { MetadataRegistry } from './MetadataRegistry';
import { ConfigurationManager } from '../config';
import { SecureCommandExecutor } from '../security/SecureCommandExecutor';

/**
 * Parallel processing framework for metadata operations
 * Handles concurrent execution of metadata queries and content retrieval
 */
export class ParallelProcessor {
    private registry: MetadataRegistry;
    private config: ConfigurationManager;
    private defaultConcurrency: number;
    private defaultTimeout: number;

    constructor(registry?: MetadataRegistry) {
        this.registry = registry || MetadataRegistry.getInstance();
        this.config = ConfigurationManager.getInstance();
        this.defaultConcurrency = this.config.getMaxConcurrentRequests();
        this.defaultTimeout = this.config.getTimeout('default');
    }

    /**
     * Process metadata types in parallel with configurable concurrency
     */
    public async processMetadataTypes(
        orgId: string, 
        orgIdentifier: string, 
        options: MetadataQueryOptions
    ): Promise<ProcessingResult<{ type: string; files: OrgFile[] }>> {
        const startTime = Date.now();
        const maxConcurrency = options.maxConcurrency || this.defaultConcurrency;
        const metadataTypes = options.metadataTypes;

        if (!options.parallel) {
            // Sequential processing
            return this.processMetadataTypesSequential(orgId, orgIdentifier, metadataTypes);
        }

        // Parallel processing with concurrency control
        const results: { type: string; files: OrgFile[] }[] = [];
        const failures: { item: any; error: string }[] = [];

        // Process metadata types in chunks to control concurrency
        const chunks = this.chunkArray(metadataTypes, maxConcurrency);
        
        for (const chunk of chunks) {
            const promises = chunk.map(async (type) => {
                try {
                    const handler = this.registry.getHandler(type);
                    if (!handler) {
                        throw new Error(`No handler registered for metadata type: ${type}`);
                    }

                    const files = await handler.getFiles(orgId, orgIdentifier);
                    return { type, files };
                } catch (error) {
                    failures.push({ 
                        item: type, 
                        error: error instanceof Error ? error.message : String(error) 
                    });
                    return null;
                }
            });

            const chunkResults = await Promise.all(promises);
            results.push(...chunkResults.filter(result => result !== null) as { type: string; files: OrgFile[] }[]);
        }

        const processingTime = Date.now() - startTime;
        
        return {
            success: results,
            failures,
            processingTime
        };
    }

    /**
     * Process metadata types sequentially
     */
    private async processMetadataTypesSequential(
        orgId: string, 
        orgIdentifier: string, 
        metadataTypes: string[]
    ): Promise<ProcessingResult<{ type: string; files: OrgFile[] }>> {
        const startTime = Date.now();
        const results: { type: string; files: OrgFile[] }[] = [];
        const failures: { item: any; error: string }[] = [];

        for (const type of metadataTypes) {
            try {
                const handler = this.registry.getHandler(type);
                if (!handler) {
                    throw new Error(`No handler registered for metadata type: ${type}`);
                }

                const files = await handler.getFiles(orgId, orgIdentifier);
                results.push({ type, files });
            } catch (error) {
                failures.push({ 
                    item: type, 
                    error: error instanceof Error ? error.message : String(error) 
                });
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
     * Retrieve content for multiple files in parallel
     */
    public async retrieveContentParallel(
        requests: ContentRequest[]
    ): Promise<ProcessingResult<ContentResponse>> {
        const startTime = Date.now();
        const maxConcurrency = this.defaultConcurrency;
        
        // Group requests by metadata type and org for optimal processing
        const requestsByTypeAndOrg = new Map<string, ContentRequest[]>();
        
        for (const request of requests) {
            const key = `${request.orgId}:${request.file.type}`;
            const group = requestsByTypeAndOrg.get(key) || [];
            group.push(request);
            requestsByTypeAndOrg.set(key, group);
        }

        const results: ContentResponse[] = [];
        const failures: { item: any; error: string }[] = [];

        // Process each group in parallel
        const groupPromises = Array.from(requestsByTypeAndOrg.entries()).map(async ([key, groupRequests]) => {
            const [orgId, metadataType] = key.split(':');
            const handler = this.registry.getHandler(metadataType);
            
            if (!handler) {
                const error = `No handler registered for metadata type: ${metadataType}`;
                return groupRequests.map(request => ({
                    request,
                    success: false,
                    error
                }));
            }

            // Get org identifier from first request (assuming all requests are for the same org)
            const orgIdentifier = groupRequests[0].file.orgId; // This might need adjustment based on your data structure
            
            try {
                const files = groupRequests.map(req => req.file);
                const contentResult = await handler.getContentParallel(orgId, orgIdentifier, files);
                
                // Map successful results back to responses
                const responses: ContentResponse[] = [];
                
                for (const success of contentResult.success) {
                    const originalRequest = groupRequests.find(req => req.file.id === success.file.id);
                    if (originalRequest) {
                        responses.push({
                            request: originalRequest,
                            content: success.content,
                            success: true
                        });
                    }
                }
                
                // Map failures
                for (const failure of contentResult.failures) {
                    const originalRequest = groupRequests.find(req => req.file.id === failure.item.id);
                    if (originalRequest) {
                        responses.push({
                            request: originalRequest,
                            success: false,
                            error: failure.error
                        });
                    }
                }

                return responses;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                return groupRequests.map(request => ({
                    request,
                    success: false,
                    error: errorMessage
                }));
            }
        });

        const groupResults = await Promise.all(groupPromises);
        results.push(...groupResults.flat());

        const processingTime = Date.now() - startTime;
        
        return {
            success: results.filter(r => r.success),
            failures: results.filter(r => !r.success).map(r => ({ item: r.request, error: r.error || 'Unknown error' })),
            processingTime
        };
    }

    /**
     * Execute SF CLI commands in parallel with rate limiting (DEPRECATED)
     * @deprecated Use SecureCommandExecutor.executeCommand directly instead
     */
    public async executeSfCommandsParallel(
        commands: string[],
        maxConcurrency: number = this.defaultConcurrency
    ): Promise<ProcessingResult<{ command: string; result: any }>> {
        console.warn('executeSfCommandsParallel is deprecated. Use SecureCommandExecutor.executeCommand directly instead.');
        
        const startTime = Date.now();
        const results: { command: string; result: any }[] = [];
        const failures: { item: any; error: string }[] = [];

        // Process commands in chunks to control concurrency
        const chunks = this.chunkArray(commands, maxConcurrency);
        
        for (const chunk of chunks) {
            const promises = chunk.map(async (command) => {
                try {
                    // Parse command string into command and arguments
                    const parts = command.trim().split(/\s+/);
                    if (parts.length === 0) {
                        throw new Error('Invalid command: empty command string');
                    }

                    const baseCommand = parts[0];
                    const args = parts.slice(1);

                    const result = await SecureCommandExecutor.executeCommand(baseCommand, args, { 
                        timeout: this.defaultTimeout 
                    });
                    
                    return { command, result: JSON.parse(result.stdout) };
                } catch (error) {
                    failures.push({ 
                        item: command, 
                        error: error instanceof Error ? error.message : String(error) 
                    });
                    return null;
                }
            });

            const chunkResults = await Promise.all(promises);
            results.push(...chunkResults.filter(result => result !== null) as { command: string; result: any }[]);
        }

        const processingTime = Date.now() - startTime;
        
        return {
            success: results,
            failures,
            processingTime
        };
    }

    /**
     * Batch process requests with priority handling
     */
    public async batchProcessRequests<T, R>(
        requests: T[],
        processor: (request: T) => Promise<R>,
        options: {
            maxConcurrency?: number;
            priority?: (request: T) => number;
            timeout?: number;
        } = {}
    ): Promise<ProcessingResult<R>> {
        const startTime = Date.now();
        const maxConcurrency = options.maxConcurrency || this.defaultConcurrency;
        const timeout = options.timeout || this.defaultTimeout;
        
        // Sort by priority if provided
        const sortedRequests = options.priority 
            ? requests.sort((a, b) => options.priority!(b) - options.priority!(a))
            : requests;

        const results: R[] = [];
        const failures: { item: any; error: string }[] = [];

        // Process requests in chunks
        const chunks = this.chunkArray(sortedRequests, maxConcurrency);
        
        for (const chunk of chunks) {
            const promises = chunk.map(async (request) => {
                try {
                    const timeoutPromise = new Promise<never>((_, reject) => {
                        setTimeout(() => reject(new Error('Request timeout')), timeout);
                    });
                    
                    const result = await Promise.race([
                        processor(request),
                        timeoutPromise
                    ]);
                    
                    return result;
                } catch (error) {
                    failures.push({ 
                        item: request, 
                        error: error instanceof Error ? error.message : String(error) 
                    });
                    return null;
                }
            });

            const chunkResults = await Promise.all(promises);
            results.push(...chunkResults.filter(result => result !== null) as R[]);
        }

        const processingTime = Date.now() - startTime;
        
        return {
            success: results,
            failures,
            processingTime
        };
    }

    /**
     * Get processing statistics
     */
    public getProcessingStats(result: ProcessingResult<any>): {
        successCount: number;
        failureCount: number;
        successRate: number;
        averageTime: number;
    } {
        const successCount = result.success.length;
        const failureCount = result.failures.length;
        const totalCount = successCount + failureCount;
        
        return {
            successCount,
            failureCount,
            successRate: totalCount > 0 ? (successCount / totalCount) * 100 : 0,
            averageTime: totalCount > 0 ? result.processingTime / totalCount : 0
        };
    }

    /**
     * Utility method to chunk array for parallel processing
     */
    private chunkArray<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * Set default concurrency level
     */
    public setDefaultConcurrency(concurrency: number): void {
        this.defaultConcurrency = Math.max(1, Math.min(concurrency, 10)); // Limit between 1 and 10
    }

    /**
     * Set default timeout
     */
    public setDefaultTimeout(timeout: number): void {
        this.defaultTimeout = Math.max(1000, timeout); // Minimum 1 second
    }
}
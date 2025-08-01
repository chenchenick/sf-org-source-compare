import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TreeItem, SalesforceOrg } from '../types';

export interface OrgCacheMetadata {
    orgId: string;
    orgUsername: string;
    orgAlias?: string;
    lastRefreshed: Date;
    fileCount: number;
}

export interface CacheIndex {
    orgs: { [orgId: string]: OrgCacheMetadata };
    lastUpdated: Date;
}

export class OrgCacheService {
    private cacheDirectory: string;
    private cacheIndexPath: string;
    private cacheIndex: CacheIndex = { orgs: {}, lastUpdated: new Date() };

    constructor(private context: vscode.ExtensionContext) {
        this.cacheDirectory = path.join(context.globalStorageUri.fsPath, 'orgCache');
        this.cacheIndexPath = path.join(this.cacheDirectory, 'cache_index.json');
        this.ensureCacheDirectory();
        this.loadCacheIndex();
    }

    /**
     * Ensure cache directory exists
     */
    private ensureCacheDirectory(): void {
        try {
            if (!fs.existsSync(this.cacheDirectory)) {
                fs.mkdirSync(this.cacheDirectory, { recursive: true });
                console.log('📁 Created cache directory:', this.cacheDirectory);
            }
        } catch (error) {
            console.error('❌ Failed to create cache directory:', error);
        }
    }

    /**
     * Load cache index from disk
     */
    private loadCacheIndex(): void {
        try {
            if (fs.existsSync(this.cacheIndexPath)) {
                const indexData = fs.readFileSync(this.cacheIndexPath, 'utf8');
                const parsedIndex = JSON.parse(indexData);
                
                // Convert date strings back to Date objects
                this.cacheIndex = {
                    orgs: {},
                    lastUpdated: new Date(parsedIndex.lastUpdated)
                };

                for (const [orgId, metadata] of Object.entries(parsedIndex.orgs)) {
                    this.cacheIndex.orgs[orgId] = {
                        ...metadata as OrgCacheMetadata,
                        lastRefreshed: new Date((metadata as any).lastRefreshed)
                    };
                }

                console.log(`📋 Loaded cache index with ${Object.keys(this.cacheIndex.orgs).length} orgs`);
            }
        } catch (error) {
            console.error('❌ Failed to load cache index:', error);
            this.cacheIndex = { orgs: {}, lastUpdated: new Date() };
        }
    }

    /**
     * Save cache index to disk
     */
    private saveCacheIndex(): void {
        try {
            this.cacheIndex.lastUpdated = new Date();
            const indexData = JSON.stringify(this.cacheIndex, null, 2);
            fs.writeFileSync(this.cacheIndexPath, indexData, 'utf8');
            console.log('💾 Saved cache index');
        } catch (error) {
            console.error('❌ Failed to save cache index:', error);
        }
    }

    /**
     * Get file path for org's cached files
     */
    private getOrgFilesPath(orgId: string): string {
        return path.join(this.cacheDirectory, `${orgId}_files.json`);
    }

    /**
     * Get file path for org's metadata
     */
    private getOrgMetadataPath(orgId: string): string {
        return path.join(this.cacheDirectory, `${orgId}_metadata.json`);
    }

    /**
     * Check if org has cached files
     */
    public hasCachedFiles(orgId: string): boolean {
        return orgId in this.cacheIndex.orgs && 
               fs.existsSync(this.getOrgFilesPath(orgId));
    }

    /**
     * Get cached files for an org
     */
    public getCachedFiles(orgId: string): TreeItem[] | null {
        try {
            if (!this.hasCachedFiles(orgId)) {
                return null;
            }

            const filesPath = this.getOrgFilesPath(orgId);
            const filesData = fs.readFileSync(filesPath, 'utf8');
            const treeItems: TreeItem[] = JSON.parse(filesData);

            console.log(`📁 CACHE HIT: Loaded ${treeItems.length} cached file types for org ${orgId}`);
            return treeItems;
        } catch (error) {
            console.error(`❌ Failed to load cached files for org ${orgId}:`, error);
            // Clean up corrupted cache entry
            this.removeCachedOrg(orgId);
            return null;
        }
    }

    /**
     * Cache files for an org
     */
    public cacheOrgFiles(orgId: string, org: SalesforceOrg, files: TreeItem[]): void {
        try {
            const filesPath = this.getOrgFilesPath(orgId);
            const metadataPath = this.getOrgMetadataPath(orgId);

            // Save files
            const filesData = JSON.stringify(files, null, 2);
            fs.writeFileSync(filesPath, filesData, 'utf8');

            // Save metadata
            const metadata: OrgCacheMetadata = {
                orgId: orgId,
                orgUsername: org.username,
                orgAlias: org.alias,
                lastRefreshed: new Date(),
                fileCount: this.countFiles(files)
            };

            const metadataData = JSON.stringify(metadata, null, 2);
            fs.writeFileSync(metadataPath, metadataData, 'utf8');

            // Update cache index
            this.cacheIndex.orgs[orgId] = metadata;
            this.saveCacheIndex();

            console.log(`💾 Cached ${files.length} file types for org ${org.alias || org.username} (${metadata.fileCount} total files)`);
        } catch (error) {
            console.error(`❌ Failed to cache files for org ${orgId}:`, error);
        }
    }

    /**
     * Get cache metadata for an org
     */
    public getCacheMetadata(orgId: string): OrgCacheMetadata | null {
        return this.cacheIndex.orgs[orgId] || null;
    }

    /**
     * Remove cached data for an org
     */
    public removeCachedOrg(orgId: string): void {
        try {
            const filesPath = this.getOrgFilesPath(orgId);
            const metadataPath = this.getOrgMetadataPath(orgId);

            // Remove files
            if (fs.existsSync(filesPath)) {
                fs.unlinkSync(filesPath);
            }
            if (fs.existsSync(metadataPath)) {
                fs.unlinkSync(metadataPath);
            }

            // Remove from index
            delete this.cacheIndex.orgs[orgId];
            this.saveCacheIndex();

            console.log(`🗑️ Removed cached data for org ${orgId}`);
        } catch (error) {
            console.error(`❌ Failed to remove cached data for org ${orgId}:`, error);
        }
    }

    /**
     * Get all cached org IDs
     */
    public getCachedOrgIds(): string[] {
        return Object.keys(this.cacheIndex.orgs);
    }

    /**
     * Clean up cache for orgs that no longer exist
     */
    public cleanupStaleCache(currentOrgIds: string[]): void {
        const cachedOrgIds = this.getCachedOrgIds();
        const staleOrgIds = cachedOrgIds.filter(id => !currentOrgIds.includes(id));

        if (staleOrgIds.length > 0) {
            console.log(`🧹 Cleaning up ${staleOrgIds.length} stale cache entries`);
            for (const orgId of staleOrgIds) {
                this.removeCachedOrg(orgId);
            }
        }
    }

    /**
     * Get cache statistics
     */
    public getCacheStats(): { totalOrgs: number; totalFiles: number; cacheSize: string } {
        const totalOrgs = Object.keys(this.cacheIndex.orgs).length;
        const totalFiles = Object.values(this.cacheIndex.orgs)
            .reduce((sum, meta) => sum + meta.fileCount, 0);

        let cacheSize = '0 B';
        try {
            const stats = fs.statSync(this.cacheDirectory);
            const sizeInBytes = this.calculateDirectorySize(this.cacheDirectory);
            cacheSize = this.formatBytes(sizeInBytes);
        } catch (error) {
            console.error('Failed to calculate cache size:', error);
        }

        return { totalOrgs, totalFiles, cacheSize };
    }

    /**
     * Count total files in tree structure
     */
    private countFiles(items: TreeItem[]): number {
        let count = 0;
        for (const item of items) {
            if (item.type === 'file') {
                count++;
            } else if (item.children) {
                count += this.countFiles(item.children);
            }
        }
        return count;
    }

    /**
     * calculate directory size recursively
     */
    private calculateDirectorySize(dirPath: string): number {
        let totalSize = 0;
        try {
            const files = fs.readdirSync(dirPath);
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                const stats = fs.statSync(filePath);
                if (stats.isDirectory()) {
                    totalSize += this.calculateDirectorySize(filePath);
                } else {
                    totalSize += stats.size;
                }
            }
        } catch (error) {
            console.error('Error calculating directory size:', error);
        }
        return totalSize;
    }

    /**
     * Format bytes to human readable format
     */
    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Clear all cache data
     */
    public clearCache(): void {
        try {
            const cachedOrgIds = this.getCachedOrgIds();
            for (const orgId of cachedOrgIds) {
                this.removeCachedOrg(orgId);
            }
            console.log('🧹 Cleared all cache data');
        } catch (error) {
            console.error('❌ Failed to clear cache:', error);
        }
    }
}
import { MetadataHandlerConfig } from '../types';
import * as vscode from 'vscode';
import { ConfigurationManager, SF_CONFIG } from '../config';

/**
 * Configuration interface for metadata handling
 */
export interface MetadataTypeConfig {
    enabled: boolean;
    priority: 'high' | 'medium' | 'low';
    parallel: boolean;
    maxConcurrency?: number;
    retryCount?: number;
    timeout?: number;
    displayName?: string;
}

/**
 * Configuration manager for metadata types and handlers
 */
export class MetadataConfiguration {
    private static instance: MetadataConfiguration;
    private configurationMap: Map<string, MetadataTypeConfig> = new Map();
    private readonly configurationKey = 'sfOrgCompare.metadataTypes';
    private config: ConfigurationManager;

    private constructor() {
        this.config = ConfigurationManager.getInstance();
        this.initializeDefaultConfiguration();
        this.loadConfiguration();
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): MetadataConfiguration {
        if (!MetadataConfiguration.instance) {
            MetadataConfiguration.instance = new MetadataConfiguration();
        }
        return MetadataConfiguration.instance;
    }

    /**
     * Initialize default configuration for all metadata types
     */
    private initializeDefaultConfiguration(): void {
        // High priority metadata types (commonly used)
        this.configurationMap.set('ApexClass', {
            enabled: true,
            priority: 'high',
            parallel: true,
            maxConcurrency: 5,
            retryCount: 3,
            timeout: this.config.getTimeout('default'),
            displayName: 'Apex Classes'
        });

        this.configurationMap.set('ApexTrigger', {
            enabled: true,
            priority: 'high',
            parallel: true,
            maxConcurrency: 5,
            retryCount: 3,
            timeout: this.config.getTimeout('default'),
            displayName: 'Apex Triggers'
        });

        this.configurationMap.set('CustomObject', {
            enabled: true,
            priority: 'high',
            parallel: true,
            maxConcurrency: 3,
            retryCount: 3,
            timeout: this.config.getTimeout('medium'),
            displayName: 'Custom Objects'
        });

        this.configurationMap.set('LightningComponentBundle', {
            enabled: true,
            priority: 'high',
            parallel: true,
            maxConcurrency: 3,
            retryCount: 3,
            timeout: this.config.getTimeout('extended'),
            displayName: 'Lightning Web Components'
        });

        // Medium priority metadata types
        this.configurationMap.set('AuraDefinitionBundle', {
            enabled: true,
            priority: 'medium',
            parallel: true,
            maxConcurrency: 3,
            retryCount: 3,
            timeout: this.config.getTimeout('extended'),
            displayName: 'Aura Components'
        });

        this.configurationMap.set('PermissionSet', {
            enabled: true,
            priority: 'medium',
            parallel: true,
            maxConcurrency: 5,
            retryCount: 3,
            timeout: this.config.getTimeout('default'),
            displayName: 'Permission Sets'
        });

        this.configurationMap.set('Profile', {
            enabled: false, // Disabled by default due to large size
            priority: 'medium',
            parallel: true,
            maxConcurrency: 2,
            retryCount: 3,
            timeout: this.config.getTimeout('extended'),
            displayName: 'Profiles'
        });

        this.configurationMap.set('Flow', {
            enabled: true,
            priority: 'medium',
            parallel: true,
            maxConcurrency: 3,
            retryCount: 3,
            timeout: this.config.getTimeout('medium'),
            displayName: 'Flows'
        });

        this.configurationMap.set('Layout', {
            enabled: true,
            priority: 'medium',
            parallel: true,
            maxConcurrency: 5,
            retryCount: 3,
            timeout: this.config.getTimeout('default'),
            displayName: 'Layouts'
        });

        // Low priority metadata types
        this.configurationMap.set('CustomLabels', {
            enabled: true,
            priority: 'low',
            parallel: true,
            maxConcurrency: 3,
            retryCount: 3,
            timeout: this.config.getTimeout('default'),
            displayName: 'Custom Labels'
        });

        this.configurationMap.set('CustomMetadata', {
            enabled: true,
            priority: 'low',
            parallel: true,
            maxConcurrency: 5,
            retryCount: 3,
            timeout: this.config.getTimeout('default'),
            displayName: 'Custom Metadata Types'
        });

        this.configurationMap.set('EmailTemplate', {
            enabled: false, // Disabled by default
            priority: 'low',
            parallel: true,
            maxConcurrency: 5,
            retryCount: 3,
            timeout: this.config.getTimeout('default'),
            displayName: 'Email Templates'
        });

        this.configurationMap.set('StaticResource', {
            enabled: false, // Disabled by default due to potential large size
            priority: 'low',
            parallel: true,
            maxConcurrency: 2,
            retryCount: 3,
            timeout: this.config.getTimeout('extended'),
            displayName: 'Static Resources'
        });

        this.configurationMap.set('Report', {
            enabled: false, // Disabled by default
            priority: 'low',
            parallel: true,
            maxConcurrency: 3,
            retryCount: 3,
            timeout: this.config.getTimeout('default'),
            displayName: 'Reports'
        });

        this.configurationMap.set('Dashboard', {
            enabled: false, // Disabled by default
            priority: 'low',
            parallel: true,
            maxConcurrency: 3,
            retryCount: 3,
            timeout: this.config.getTimeout('default'),
            displayName: 'Dashboards'
        });
    }

    /**
     * Load configuration from VSCode settings
     */
    private loadConfiguration(): void {
        try {
            const config = vscode.workspace.getConfiguration('sfOrgCompare');
            const savedConfig = config.get<Record<string, MetadataTypeConfig>>('metadataTypes');
            
            if (savedConfig) {
                for (const [metadataType, typeConfig] of Object.entries(savedConfig)) {
                    this.configurationMap.set(metadataType, typeConfig);
                }
            }
        } catch (error) {
            console.warn('Could not load metadata configuration:', error);
        }
    }

    /**
     * Save configuration to VSCode settings
     */
    public async saveConfiguration(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('sfOrgCompare');
            const configObject = Object.fromEntries(this.configurationMap);
            await config.update('metadataTypes', configObject, vscode.ConfigurationTarget.Global);
        } catch (error) {
            console.error('Could not save metadata configuration:', error);
            throw error;
        }
    }

    /**
     * Get configuration for a specific metadata type
     */
    public getConfiguration(metadataType: string): MetadataTypeConfig | undefined {
        return this.configurationMap.get(metadataType);
    }

    /**
     * Set configuration for a specific metadata type
     */
    public setConfiguration(metadataType: string, config: MetadataTypeConfig): void {
        this.configurationMap.set(metadataType, config);
    }

    /**
     * Get all enabled metadata types
     */
    public getEnabledTypes(): string[] {
        return Array.from(this.configurationMap.entries())
            .filter(([_, config]) => config.enabled)
            .map(([type, _]) => type);
    }

    /**
     * Get metadata types by priority
     */
    public getTypesByPriority(priority: 'high' | 'medium' | 'low'): string[] {
        return Array.from(this.configurationMap.entries())
            .filter(([_, config]) => config.enabled && config.priority === priority)
            .map(([type, _]) => type);
    }

    /**
     * Get handler configuration for a metadata type
     */
    public getHandlerConfig(metadataType: string): MetadataHandlerConfig {
        const config = this.getConfiguration(metadataType);
        
        if (!config) {
            // Return default configuration
            return {
                enabled: false,
                parallel: true,
                maxConcurrency: 3,
                retryCount: 3,
                timeout: this.config.getTimeout('default')
            };
        }

        return {
            enabled: config.enabled,
            parallel: config.parallel,
            maxConcurrency: config.maxConcurrency || 3,
            retryCount: config.retryCount || 3,
            timeout: config.timeout || this.config.getTimeout('default')
        };
    }

    /**
     * Enable a metadata type
     */
    public enableType(metadataType: string): void {
        const config = this.getConfiguration(metadataType);
        if (config) {
            config.enabled = true;
            this.setConfiguration(metadataType, config);
        }
    }

    /**
     * Disable a metadata type
     */
    public disableType(metadataType: string): void {
        const config = this.getConfiguration(metadataType);
        if (config) {
            config.enabled = false;
            this.setConfiguration(metadataType, config);
        }
    }

    /**
     * Get all configured metadata types
     */
    public getAllTypes(): string[] {
        return Array.from(this.configurationMap.keys());
    }

    /**
     * Get configuration summary
     */
    public getConfigurationSummary(): {
        total: number;
        enabled: number;
        disabled: number;
        highPriority: number;
        mediumPriority: number;
        lowPriority: number;
    } {
        const total = this.configurationMap.size;
        let enabled = 0;
        let disabled = 0;
        let highPriority = 0;
        let mediumPriority = 0;
        let lowPriority = 0;

        for (const [_, config] of this.configurationMap) {
            if (config.enabled) {
                enabled++;
            } else {
                disabled++;
            }

            switch (config.priority) {
                case 'high':
                    highPriority++;
                    break;
                case 'medium':
                    mediumPriority++;
                    break;
                case 'low':
                    lowPriority++;
                    break;
            }
        }

        return {
            total,
            enabled,
            disabled,
            highPriority,
            mediumPriority,
            lowPriority
        };
    }

    /**
     * Reset configuration to defaults
     */
    public resetToDefaults(): void {
        this.configurationMap.clear();
        this.initializeDefaultConfiguration();
    }

    /**
     * Create configuration for a new metadata type
     */
    public createConfiguration(
        metadataType: string,
        config: Partial<MetadataTypeConfig>
    ): void {
        const defaultConfig: MetadataTypeConfig = {
            enabled: true,
            priority: 'medium',
            parallel: true,
            maxConcurrency: 3,
            retryCount: 3,
            timeout: this.config.getTimeout('default'),
            displayName: metadataType
        };

        this.setConfiguration(metadataType, { ...defaultConfig, ...config });
    }

    /**
     * Get performance-optimized configuration
     */
    public getPerformanceOptimizedConfiguration(): Map<string, MetadataTypeConfig> {
        const optimizedConfig = new Map<string, MetadataTypeConfig>();

        for (const [metadataType, config] of this.configurationMap) {
            if (config.enabled) {
                const optimizedTypeConfig: MetadataTypeConfig = {
                    ...config,
                    parallel: true,
                    maxConcurrency: Math.min(config.maxConcurrency || 3, 5), // Limit concurrency
                    timeout: Math.min(config.timeout || this.config.getTimeout('default'), this.config.getTimeout('extended')) // Limit timeout
                };

                optimizedConfig.set(metadataType, optimizedTypeConfig);
            }
        }

        return optimizedConfig;
    }

    /**
     * Get configuration for user interface
     */
    public getUIConfiguration(): Array<{
        type: string;
        displayName: string;
        enabled: boolean;
        priority: string;
        parallel: boolean;
        maxConcurrency: number;
        timeout: number;
    }> {
        return Array.from(this.configurationMap.entries()).map(([type, config]) => ({
            type,
            displayName: config.displayName || type,
            enabled: config.enabled,
            priority: config.priority,
            parallel: config.parallel,
            maxConcurrency: config.maxConcurrency || 3,
            timeout: config.timeout || this.config.getTimeout('default')
        }));
    }

    /**
     * Update configuration from user interface
     */
    public updateFromUI(uiConfig: Array<{
        type: string;
        enabled: boolean;
        priority: 'high' | 'medium' | 'low';
        parallel: boolean;
        maxConcurrency: number;
        timeout: number;
    }>): void {
        for (const item of uiConfig) {
            const existingConfig = this.getConfiguration(item.type);
            if (existingConfig) {
                const updatedConfig: MetadataTypeConfig = {
                    ...existingConfig,
                    enabled: item.enabled,
                    priority: item.priority,
                    parallel: item.parallel,
                    maxConcurrency: item.maxConcurrency,
                    timeout: item.timeout
                };
                this.setConfiguration(item.type, updatedConfig);
            }
        }
    }

    /**
     * Get recommended configuration for large orgs
     */
    public getLargeOrgConfiguration(): Map<string, MetadataTypeConfig> {
        const largeOrgConfig = new Map<string, MetadataTypeConfig>();

        for (const [metadataType, config] of this.configurationMap) {
            if (config.enabled) {
                const largeOrgTypeConfig: MetadataTypeConfig = {
                    ...config,
                    parallel: true,
                    maxConcurrency: Math.min(config.maxConcurrency || 3, 2), // Reduce concurrency for large orgs
                    timeout: Math.max(config.timeout || this.config.getTimeout('default'), this.config.getTimeout('extended')), // Increase timeout
                    retryCount: Math.max(config.retryCount || 3, 5) // Increase retry count
                };

                largeOrgConfig.set(metadataType, largeOrgTypeConfig);
            }
        }

        return largeOrgConfig;
    }

    /**
     * Validate configuration
     */
    public validateConfiguration(): Array<{ type: string; error: string }> {
        const errors: Array<{ type: string; error: string }> = [];

        for (const [metadataType, config] of this.configurationMap) {
            if (config.maxConcurrency && config.maxConcurrency < 1) {
                errors.push({
                    type: metadataType,
                    error: 'Max concurrency must be at least 1'
                });
            }

            if (config.maxConcurrency && config.maxConcurrency > 10) {
                errors.push({
                    type: metadataType,
                    error: 'Max concurrency should not exceed 10'
                });
            }

            if (config.timeout && config.timeout < 1000) {
                errors.push({
                    type: metadataType,
                    error: 'Timeout must be at least 1000ms'
                });
            }

            if (config.retryCount && config.retryCount < 0) {
                errors.push({
                    type: metadataType,
                    error: 'Retry count cannot be negative'
                });
            }
        }

        return errors;
    }
}
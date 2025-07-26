import * as vscode from 'vscode';
import { 
    SF_CONFIG, 
    EXTENSION_CONFIG_KEYS, 
    DEFAULT_EXTENSION_CONFIG,
    LogLevel,
    LOG_LEVELS
} from './Constants';

/**
 * Interface for extension configuration values
 */
export interface ExtensionConfiguration {
    apiVersion: string;
    defaultTimeout: number;
    extendedTimeout: number;
    maxConcurrentRequests: number;
    cacheTtl: number;
    enabledMetadataTypes: string[];
    autoRefresh: boolean;
    showProgress: boolean;
    logLevel: LogLevel;
}

/**
 * Configuration manager for the Salesforce Org Source Compare extension
 * Provides centralized access to all configuration values including VS Code settings
 */
export class ConfigurationManager {
    private static instance: ConfigurationManager;
    private configuration: vscode.WorkspaceConfiguration;
    private disposables: vscode.Disposable[] = [];

    private constructor() {
        this.configuration = vscode.workspace.getConfiguration(EXTENSION_CONFIG_KEYS.SECTION);
        
        // Listen for configuration changes
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(event => {
                if (event.affectsConfiguration(EXTENSION_CONFIG_KEYS.SECTION)) {
                    this.configuration = vscode.workspace.getConfiguration(EXTENSION_CONFIG_KEYS.SECTION);
                    this.onConfigurationChanged();
                }
            })
        );
    }

    /**
     * Get the singleton instance of ConfigurationManager
     */
    public static getInstance(): ConfigurationManager {
        if (!ConfigurationManager.instance) {
            ConfigurationManager.instance = new ConfigurationManager();
        }
        return ConfigurationManager.instance;
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }

    /**
     * Get the current extension configuration
     */
    public getConfiguration(): ExtensionConfiguration {
        return {
            apiVersion: this.get(EXTENSION_CONFIG_KEYS.KEYS.API_VERSION, SF_CONFIG.API.DEFAULT_VERSION),
            defaultTimeout: this.get(EXTENSION_CONFIG_KEYS.KEYS.DEFAULT_TIMEOUT, SF_CONFIG.TIMEOUTS.DEFAULT),
            extendedTimeout: this.get(EXTENSION_CONFIG_KEYS.KEYS.EXTENDED_TIMEOUT, SF_CONFIG.TIMEOUTS.EXTENDED),
            maxConcurrentRequests: this.get(EXTENSION_CONFIG_KEYS.KEYS.MAX_CONCURRENT_REQUESTS, SF_CONFIG.API.MAX_CONCURRENT_REQUESTS),
            cacheTtl: this.get(EXTENSION_CONFIG_KEYS.KEYS.CACHE_TTL, SF_CONFIG.CACHE.DEFAULT_TTL),
            enabledMetadataTypes: this.get(EXTENSION_CONFIG_KEYS.KEYS.ENABLED_METADATA_TYPES, [...DEFAULT_EXTENSION_CONFIG.enabledMetadataTypes]),
            autoRefresh: this.get(EXTENSION_CONFIG_KEYS.KEYS.AUTO_REFRESH, false),
            showProgress: this.get(EXTENSION_CONFIG_KEYS.KEYS.SHOW_PROGRESS, true),
            logLevel: this.get(EXTENSION_CONFIG_KEYS.KEYS.LOG_LEVEL, 'info') as LogLevel
        };
    }

    /**
     * Get a specific configuration value with type safety
     */
    public get<T>(key: string, defaultValue: T): T {
        return this.configuration.get<T>(key, defaultValue);
    }

    /**
     * Set a configuration value
     */
    public async set<T>(key: string, value: T, configurationTarget?: vscode.ConfigurationTarget): Promise<void> {
        await this.configuration.update(key, value, configurationTarget);
    }

    /**
     * Get Salesforce API version from configuration or default
     */
    public getApiVersion(): string {
        const version = this.get(EXTENSION_CONFIG_KEYS.KEYS.API_VERSION, SF_CONFIG.API.DEFAULT_VERSION);
        
        // Validate version is supported
        if (SF_CONFIG.API.SUPPORTED_VERSIONS.includes(version as any)) {
            return version;
        }
        
        console.warn(`Unsupported API version: ${version}. Using default: ${SF_CONFIG.API.DEFAULT_VERSION}`);
        return SF_CONFIG.API.DEFAULT_VERSION;
    }

    /**
     * Get timeout value for specific operation type
     */
    public getTimeout(operation: 'default' | 'extended' | 'medium' | 'short' | 'source_retrieval' | 'cli_command'): number {
        const config = this.getConfiguration();
        
        switch (operation) {
            case 'default':
                return config.defaultTimeout;
            case 'extended':
                return config.extendedTimeout;
            case 'medium':
                return SF_CONFIG.TIMEOUTS.MEDIUM;
            case 'short':
                return SF_CONFIG.TIMEOUTS.SHORT;
            case 'source_retrieval':
                return SF_CONFIG.TIMEOUTS.SOURCE_RETRIEVAL;
            case 'cli_command':
                return SF_CONFIG.TIMEOUTS.CLI_COMMAND;
            default:
                return config.defaultTimeout;
        }
    }

    /**
     * Get UI timeout values
     */
    public getUITimeout(type: 'status_bar' | 'status_bar_extended' | 'progress'): number {
        switch (type) {
            case 'status_bar':
                return SF_CONFIG.UI.STATUS_BAR_TIMEOUT;
            case 'status_bar_extended':
                return SF_CONFIG.UI.STATUS_BAR_EXTENDED;
            case 'progress':
                return SF_CONFIG.UI.PROGRESS_TIMEOUT;
            default:
                return SF_CONFIG.UI.STATUS_BAR_TIMEOUT;
        }
    }

    /**
     * Get file system configuration
     */
    public getFileSystemConfig() {
        return SF_CONFIG.FS;
    }

    /**
     * Get cache configuration
     */
    public getCacheConfig() {
        return {
            ...SF_CONFIG.CACHE,
            ttl: this.get(EXTENSION_CONFIG_KEYS.KEYS.CACHE_TTL, SF_CONFIG.CACHE.DEFAULT_TTL)
        };
    }

    /**
     * Get security configuration
     */
    public getSecurityConfig() {
        return SF_CONFIG.SECURITY;
    }

    /**
     * Get enabled metadata types from configuration
     */
    public getEnabledMetadataTypes(): string[] {
        return this.get(EXTENSION_CONFIG_KEYS.KEYS.ENABLED_METADATA_TYPES, [...DEFAULT_EXTENSION_CONFIG.enabledMetadataTypes]);
    }

    /**
     * Check if a metadata type is enabled
     */
    public isMetadataTypeEnabled(metadataType: string): boolean {
        const enabledTypes = this.getEnabledMetadataTypes();
        return enabledTypes.includes(metadataType);
    }

    /**
     * Get log level from configuration
     */
    public getLogLevel(): LogLevel {
        const level = this.get(EXTENSION_CONFIG_KEYS.KEYS.LOG_LEVEL, 'info');
        
        // Validate log level
        const validLevels = Object.values(LOG_LEVELS);
        if (validLevels.includes(level as LogLevel)) {
            return level as LogLevel;
        }
        
        console.warn(`Invalid log level: ${level}. Using default: info`);
        return LOG_LEVELS.INFO;
    }

    /**
     * Check if progress indicators should be shown
     */
    public shouldShowProgress(): boolean {
        return this.get(EXTENSION_CONFIG_KEYS.KEYS.SHOW_PROGRESS, true);
    }

    /**
     * Check if auto refresh is enabled
     */
    public isAutoRefreshEnabled(): boolean {
        return this.get(EXTENSION_CONFIG_KEYS.KEYS.AUTO_REFRESH, false);
    }

    /**
     * Get the maximum number of concurrent requests
     */
    public getMaxConcurrentRequests(): number {
        return this.get(EXTENSION_CONFIG_KEYS.KEYS.MAX_CONCURRENT_REQUESTS, SF_CONFIG.API.MAX_CONCURRENT_REQUESTS);
    }

    /**
     * Reset configuration to defaults
     */
    public async resetToDefaults(): Promise<void> {
        for (const [key, value] of Object.entries(DEFAULT_EXTENSION_CONFIG)) {
            await this.set(key, value);
        }
    }

    /**
     * Validate current configuration
     */
    public validateConfiguration(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        const config = this.getConfiguration();

        // Validate API version
        if (!SF_CONFIG.API.SUPPORTED_VERSIONS.includes(config.apiVersion as any)) {
            errors.push(`Invalid API version: ${config.apiVersion}`);
        }

        // Validate timeouts
        if (config.defaultTimeout < 1000 || config.defaultTimeout > 300000) {
            errors.push(`Default timeout must be between 1000ms and 300000ms, got: ${config.defaultTimeout}`);
        }

        if (config.extendedTimeout < config.defaultTimeout) {
            errors.push(`Extended timeout must be >= default timeout`);
        }

        // Validate max concurrent requests
        if (config.maxConcurrentRequests < 1 || config.maxConcurrentRequests > 20) {
            errors.push(`Max concurrent requests must be between 1 and 20, got: ${config.maxConcurrentRequests}`);
        }

        // Validate cache TTL
        if (config.cacheTtl < 60000 || config.cacheTtl > 3600000) { // 1 minute to 1 hour
            errors.push(`Cache TTL must be between 60000ms and 3600000ms, got: ${config.cacheTtl}`);
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Called when configuration changes
     */
    private onConfigurationChanged(): void {
        console.log('Configuration changed, validating...');
        
        const validation = this.validateConfiguration();
        if (!validation.valid) {
            vscode.window.showWarningMessage(
                `Configuration validation failed: ${validation.errors.join(', ')}`
            );
        }
    }
}
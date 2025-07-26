/**
 * Centralized configuration constants for the Salesforce Org Source Compare extension
 */

export const SF_CONFIG = {
    // Salesforce API Configuration
    API: {
        /** Default Salesforce API version for metadata operations */
        DEFAULT_VERSION: '58.0',
        /** Supported API versions */
        SUPPORTED_VERSIONS: ['58.0', '59.0', '60.0', '61.0'] as const,
        /** Maximum number of concurrent API requests */
        MAX_CONCURRENT_REQUESTS: 5
    },

    // Timeout Configuration (in milliseconds)
    TIMEOUTS: {
        /** Default timeout for most operations */
        DEFAULT: 30000,
        /** Extended timeout for large operations */
        EXTENDED: 60000,
        /** Medium timeout for moderate operations */
        MEDIUM: 45000,
        /** Short timeout for quick operations */
        SHORT: 15000,
        /** Source retrieval timeout */
        SOURCE_RETRIEVAL: 60000,
        /** CLI command execution timeout */
        CLI_COMMAND: 60000,
        /** Process termination timeout */
        PROCESS_KILL: 5000
    },

    // UI Configuration
    UI: {
        /** Status bar message display duration */
        STATUS_BAR_TIMEOUT: 3000,
        /** Extended status bar message duration */
        STATUS_BAR_EXTENDED: 5000,
        /** Progress notification timeout */
        PROGRESS_TIMEOUT: 10000
    },

    // File System Configuration
    FS: {
        /** Temporary directory prefix */
        TEMP_DIR_PREFIX: 'sf-org-compare',
        /** Maximum file size for comparison (in bytes) */
        MAX_COMPARISON_FILE_SIZE: 50 * 1024 * 1024, // 50MB
        /** File encoding for text operations */
        DEFAULT_ENCODING: 'utf8' as const,
        /** Maximum directory depth for traversal */
        MAX_DIRECTORY_DEPTH: 10
    },

    // Cache Configuration
    CACHE: {
        /** Default cache TTL in milliseconds */
        DEFAULT_TTL: 30 * 60 * 1000, // 30 minutes
        /** Maximum cache size (number of entries) */
        MAX_ENTRIES: 1000,
        /** Cache cleanup interval */
        CLEANUP_INTERVAL: 5 * 60 * 1000 // 5 minutes
    },

    // Performance Configuration
    PERFORMANCE: {
        /** Maximum time for tests to complete */
        TEST_TIMEOUT: 5000,
        /** Debounce time for UI updates */
        DEBOUNCE_TIME: 300,
        /** Batch size for processing operations */
        BATCH_SIZE: 100
    },

    // Security Configuration
    SECURITY: {
        /** Maximum command argument length */
        MAX_COMMAND_ARG_LENGTH: 8192,
        /** Allowed file extensions for comparison */
        ALLOWED_EXTENSIONS: ['.cls', '.trigger', '.js', '.html', '.css', '.xml', '.json', '.yaml', '.yml', '.md'] as const,
        /** Forbidden path patterns */
        FORBIDDEN_PATHS: ['../', '../', '~/', '/etc/', '/usr/', '/var/'] as const
    },

    // Logging Configuration
    LOGGING: {
        ENABLED: true,
        LEVEL: 'info' as LogLevel,
        MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
        MAX_LOG_SIZE: 100, // Maximum number of error entries to keep in memory
        RETENTION_DAYS: 7
    }
} as const;

/**
 * Extension-specific configuration keys for VS Code settings
 */
export const EXTENSION_CONFIG_KEYS = {
    /** Base configuration section */
    SECTION: 'sfOrgSourceCompare',
    
    /** Configuration keys */
    KEYS: {
        API_VERSION: 'apiVersion',
        DEFAULT_TIMEOUT: 'defaultTimeout',
        EXTENDED_TIMEOUT: 'extendedTimeout',
        MAX_CONCURRENT_REQUESTS: 'maxConcurrentRequests',
        CACHE_TTL: 'cacheTtl',
        ENABLED_METADATA_TYPES: 'enabledMetadataTypes',
        AUTO_REFRESH: 'autoRefresh',
        SHOW_PROGRESS: 'showProgress',
        LOG_LEVEL: 'logLevel'
    }
} as const;

/**
 * Default VS Code extension configuration
 */
export const DEFAULT_EXTENSION_CONFIG = {
    [EXTENSION_CONFIG_KEYS.KEYS.API_VERSION]: SF_CONFIG.API.DEFAULT_VERSION,
    [EXTENSION_CONFIG_KEYS.KEYS.DEFAULT_TIMEOUT]: SF_CONFIG.TIMEOUTS.DEFAULT,
    [EXTENSION_CONFIG_KEYS.KEYS.EXTENDED_TIMEOUT]: SF_CONFIG.TIMEOUTS.EXTENDED,
    [EXTENSION_CONFIG_KEYS.KEYS.MAX_CONCURRENT_REQUESTS]: SF_CONFIG.API.MAX_CONCURRENT_REQUESTS,
    [EXTENSION_CONFIG_KEYS.KEYS.CACHE_TTL]: SF_CONFIG.CACHE.DEFAULT_TTL,
    [EXTENSION_CONFIG_KEYS.KEYS.ENABLED_METADATA_TYPES]: [
        'ApexClass',
        'ApexTrigger',
        'LightningComponentBundle',
        'AuraDefinitionBundle',
        'CustomObject',
        'Flow',
        'Layout',
        'PermissionSet',
        'Profile'
    ],
    [EXTENSION_CONFIG_KEYS.KEYS.AUTO_REFRESH]: false,
    [EXTENSION_CONFIG_KEYS.KEYS.SHOW_PROGRESS]: true,
    [EXTENSION_CONFIG_KEYS.KEYS.LOG_LEVEL]: 'info'
} as const;

/**
 * Command identifiers used throughout the extension
 */
export const COMMANDS = {
    ADD_ORG: 'sf-org-source-compare.addOrg',
    REFRESH_ORGS: 'sf-org-source-compare.refreshOrgs',
    REFRESH_ORG: 'sf-org-source-compare.refreshOrg',
    REFRESH_TREE_VIEW: 'sf-org-source-compare.refreshTreeView',
    SELECT_FILE: 'sf-org-source-compare.selectFile',
    COMPARE_FILES: 'sf-org-source-compare.compareFiles',
    CLEAR_SELECTION: 'sf-org-source-compare.clearSelection',
    DELETE_ORG: 'sf-org-source-compare.deleteOrg',
    OPEN_FILE: 'sf-org-source-compare.openFile',
    OPEN_SETTINGS: 'sf-org-source-compare.openSettings'
} as const;

/**
 * Error codes for consistent error handling
 */
export const ERROR_CODES = {
    // SF CLI Errors
    CLI_NOT_FOUND: 'SF_CLI_NOT_FOUND',
    CLI_COMMAND_FAILED: 'SF_CLI_COMMAND_FAILED',
    CLI_TIMEOUT: 'SF_CLI_TIMEOUT',
    
    // Authentication Errors
    AUTH_FAILED: 'AUTHENTICATION_FAILED',
    ORG_NOT_FOUND: 'ORGANIZATION_NOT_FOUND',
    INVALID_ORG: 'INVALID_ORGANIZATION',
    
    // File System Errors
    FILE_NOT_FOUND: 'FILE_NOT_FOUND',
    FILE_ACCESS_ERROR: 'FILE_ACCESS_ERROR',
    DIRECTORY_NOT_FOUND: 'DIRECTORY_NOT_FOUND',
    
    // Network Errors
    NETWORK_ERROR: 'NETWORK_ERROR',
    TIMEOUT_ERROR: 'TIMEOUT_ERROR',
    
    // Validation Errors
    INVALID_INPUT: 'INVALID_INPUT',
    SECURITY_VIOLATION: 'SECURITY_VIOLATION',
    
    // Internal Errors
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    CONFIGURATION_ERROR: 'CONFIGURATION_ERROR'
} as const;

/**
 * Log levels for consistent logging
 */
export const LOG_LEVELS = {
    ERROR: 'error',
    WARN: 'warn', 
    INFO: 'info',
    DEBUG: 'debug',
    TRACE: 'trace'
} as const;

/**
 * Type-safe access to configuration values
 */
export type SFConfig = typeof SF_CONFIG;
export type ExtensionConfigKeys = typeof EXTENSION_CONFIG_KEYS;
export type Commands = typeof COMMANDS;
export type ErrorCodes = typeof ERROR_CODES;
export type LogLevel = typeof LOG_LEVELS[keyof typeof LOG_LEVELS];
import * as vscode from 'vscode';
import * as path from 'path';
import { ConfigurationManager, SF_CONFIG, EXTENSION_CONFIG_KEYS } from '../config';
import { ErrorHandler, ErrorHandlingStrategy } from '../errors/ErrorHandler';
import { AVAILABLE_METADATA_TYPES } from '../services/ManifestManager';

/**
 * User preference categories for organization
 */
export interface PreferenceCategory {
    id: string;
    title: string;
    description: string;
    icon: string;
    settings: PreferenceSetting[];
}

/**
 * Individual preference setting definition
 */
export interface PreferenceSetting {
    key: string;
    title: string;
    description: string;
    type: 'number' | 'string' | 'boolean' | 'select' | 'multiselect' | 'range';
    defaultValue: any;
    currentValue?: any;
    options?: Array<{ value: any; label: string; description?: string }>;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    validation?: {
        required?: boolean;
        min?: number;
        max?: number;
        pattern?: string;
    };
}

/**
 * Webview provider for user preferences management
 */
export class UserPreferencesWebview {
    private panel: vscode.WebviewPanel | undefined;
    private config: ConfigurationManager;
    private errorHandler: ErrorHandler;
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.config = ConfigurationManager.getInstance();
        this.errorHandler = ErrorHandler.getInstance();
    }

    /**
     * Show the user preferences webview
     */
    public async show(categoryId?: string): Promise<void> {
        if (this.panel) {
            this.panel.reveal();
            if (categoryId) {
                this.focusCategory(categoryId);
            }
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'userPreferences',
            'SF Org Compare - User Preferences',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'media'))
                ]
            }
        );

        this.panel.webview.html = this.getWebviewContent();
        this.setupWebviewMessageHandling();

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        // Send initial preferences data
        this.sendPreferencesData();
    }

    /**
     * Focus on a specific category
     */
    private focusCategory(categoryId: string): void {
        if (this.panel) {
            this.panel.webview.postMessage({
                command: 'focusCategory',
                categoryId
            });
        }
    }

    /**
     * Send current preferences data to webview
     */
    private sendPreferencesData(): void {
        if (this.panel) {
            this.panel.webview.postMessage({
                command: 'loadPreferences',
                categories: this.getPreferenceCategories()
            });
        }
    }

    /**
     * Get preference categories with current values
     */
    private getPreferenceCategories(): PreferenceCategory[] {
        return [
            // General preferences
            {
                id: 'general',
                title: 'General',
                description: 'Basic extension settings and behavior',
                icon: 'gear',
                settings: [
                    {
                        key: EXTENSION_CONFIG_KEYS.KEYS.AUTO_REFRESH,
                        title: 'Auto Refresh',
                        description: 'Automatically refresh organization data on startup',
                        type: 'boolean',
                        defaultValue: false,
                        currentValue: this.config.isAutoRefreshEnabled()
                    },
                    {
                        key: EXTENSION_CONFIG_KEYS.KEYS.SHOW_PROGRESS,
                        title: 'Show Progress',
                        description: 'Display progress indicators for long-running operations',
                        type: 'boolean',
                        defaultValue: true,
                        currentValue: this.config.shouldShowProgress()
                    }
                ]
            },

            // Performance preferences
            {
                id: 'performance',
                title: 'Performance',
                description: 'Timeout and concurrency settings',
                icon: 'pulse',
                settings: [
                    {
                        key: EXTENSION_CONFIG_KEYS.KEYS.DEFAULT_TIMEOUT,
                        title: 'Default Timeout',
                        description: 'Default timeout for operations in milliseconds',
                        type: 'number',
                        defaultValue: 30000,
                        currentValue: this.config.getTimeout('default'),
                        min: 5000,
                        max: 300000,
                        step: 1000,
                        unit: 'ms'
                    },
                    {
                        key: EXTENSION_CONFIG_KEYS.KEYS.EXTENDED_TIMEOUT,
                        title: 'Extended Timeout',
                        description: 'Extended timeout for large operations in milliseconds',
                        type: 'number',
                        defaultValue: 60000,
                        currentValue: this.config.getTimeout('extended'),
                        min: 10000,
                        max: 600000,
                        step: 1000,
                        unit: 'ms'
                    },
                    {
                        key: EXTENSION_CONFIG_KEYS.KEYS.MAX_CONCURRENT_REQUESTS,
                        title: 'Max Concurrent Requests',
                        description: 'Maximum number of concurrent API requests',
                        type: 'number',
                        defaultValue: 5,
                        currentValue: this.config.getMaxConcurrentRequests(),
                        min: 1,
                        max: 20,
                        step: 1
                    },
                    {
                        key: EXTENSION_CONFIG_KEYS.KEYS.CACHE_TTL,
                        title: 'Cache TTL',
                        description: 'Cache time-to-live in milliseconds',
                        type: 'number',
                        defaultValue: 1800000,
                        currentValue: this.config.getCacheConfig().ttl,
                        min: 60000,
                        max: 3600000,
                        step: 60000,
                        unit: 'ms'
                    }
                ]
            },

            // Salesforce API preferences
            {
                id: 'api',
                title: 'Salesforce API',
                description: 'Salesforce API and connection settings',
                icon: 'cloud',
                settings: [
                    {
                        key: EXTENSION_CONFIG_KEYS.KEYS.API_VERSION,
                        title: 'API Version',
                        description: 'Salesforce API version to use',
                        type: 'select',
                        defaultValue: SF_CONFIG.API.DEFAULT_VERSION,
                        currentValue: this.config.getApiVersion(),
                        options: SF_CONFIG.API.SUPPORTED_VERSIONS.map(version => ({
                            value: version,
                            label: `${version} (${this.getVersionLabel(version)})`,
                            description: this.getVersionDescription(version)
                        }))
                    }
                ]
            },

            // Metadata preferences
            {
                id: 'metadata',
                title: 'Metadata',
                description: 'Metadata types and retrieval settings',
                icon: 'database',
                settings: [
                    {
                        key: EXTENSION_CONFIG_KEYS.KEYS.ENABLED_METADATA_TYPES,
                        title: 'Enabled Metadata Types',
                        description: 'Select which metadata types to retrieve',
                        type: 'multiselect',
                        defaultValue: [...AVAILABLE_METADATA_TYPES.filter(t => t.enabled).map(t => t.name)],
                        currentValue: this.config.getEnabledMetadataTypes(),
                        options: AVAILABLE_METADATA_TYPES.map(type => ({
                            value: type.name,
                            label: type.displayName,
                            description: type.description
                        }))
                    }
                ]
            },

            // UI preferences
            {
                id: 'ui',
                title: 'User Interface',
                description: 'UI appearance and behavior settings',
                icon: 'layout',
                settings: [
                    {
                        key: EXTENSION_CONFIG_KEYS.KEYS.LOG_LEVEL,
                        title: 'Log Level',
                        description: 'Logging verbosity level',
                        type: 'select',
                        defaultValue: 'info',
                        currentValue: this.config.getLogLevel(),
                        options: [
                            { value: 'error', label: 'Error', description: 'Only errors' },
                            { value: 'warn', label: 'Warning', description: 'Errors and warnings' },
                            { value: 'info', label: 'Info', description: 'Errors, warnings, and info' },
                            { value: 'debug', label: 'Debug', description: 'Verbose debugging information' },
                            { value: 'trace', label: 'Trace', description: 'Very detailed trace information' }
                        ]
                    }
                ]
            }
        ];
    }

    /**
     * Get version label for API version
     */
    private getVersionLabel(version: string): string {
        const versionMap: { [key: string]: string } = {
            '58.0': 'Winter \'24',
            '59.0': 'Spring \'24',
            '60.0': 'Summer \'24',
            '61.0': 'Winter \'25'
        };
        return versionMap[version] || 'Unknown';
    }

    /**
     * Get version description for API version
     */
    private getVersionDescription(version: string): string {
        const descriptionMap: { [key: string]: string } = {
            '58.0': 'Stable release with mature features',
            '59.0': 'Enhanced Lightning Web Components',
            '60.0': 'Improved Flow Builder capabilities',
            '61.0': 'Latest features and improvements'
        };
        return descriptionMap[version] || 'Salesforce API version';
    }

    /**
     * Setup webview message handling
     */
    private setupWebviewMessageHandling(): void {
        if (!this.panel) {
            return;
        }

        this.panel.webview.onDidReceiveMessage(async (message) => {
            try {
                switch (message.command) {
                    case 'updateSetting':
                        await this.updateSetting(message.key, message.value);
                        break;
                    case 'resetToDefaults':
                        await this.resetToDefaults();
                        break;
                    case 'exportSettings':
                        await this.exportSettings();
                        break;
                    case 'importSettings':
                        await this.importSettings();
                        break;
                    case 'validateSettings':
                        await this.validateSettings();
                        break;
                    default:
                        console.warn('Unknown command:', message.command);
                }
            } catch (error) {
                this.errorHandler.handleError(error as Error, ErrorHandlingStrategy.LOG_AND_CONTINUE, { context: 'UserPreferencesWebview.messageHandler' });
                if (this.panel) {
                    this.panel.webview.postMessage({
                        command: 'error',
                        message: error instanceof Error ? error.message : 'Unknown error occurred'
                    });
                }
            }
        });
    }

    /**
     * Update a specific setting
     */
    private async updateSetting(key: string, value: any): Promise<void> {
        try {
            await this.config.set(key, value);
            
            if (this.panel) {
                this.panel.webview.postMessage({
                    command: 'settingUpdated',
                    key,
                    value,
                    success: true
                });
            }
        } catch (error) {
            this.errorHandler.handleError(error as Error, ErrorHandlingStrategy.LOG_AND_CONTINUE, { context: 'UserPreferencesWebview.updateSetting' });
            
            if (this.panel) {
                this.panel.webview.postMessage({
                    command: 'settingUpdated',
                    key,
                    value,
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
    }

    /**
     * Reset all settings to defaults
     */
    private async resetToDefaults(): Promise<void> {
        try {
            await this.config.resetToDefaults();
            this.sendPreferencesData();
            
            if (this.panel) {
                this.panel.webview.postMessage({
                    command: 'resetComplete',
                    success: true
                });
            }
        } catch (error) {
            this.errorHandler.handleError(error as Error, ErrorHandlingStrategy.LOG_AND_CONTINUE, { context: 'UserPreferencesWebview.resetToDefaults' });
            
            if (this.panel) {
                this.panel.webview.postMessage({
                    command: 'resetComplete',
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
    }

    /**
     * Export current settings
     */
    private async exportSettings(): Promise<void> {
        try {
            const config = this.config.getConfiguration();
            const settings = JSON.stringify(config, null, 2);
            
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file('sf-org-compare-settings.json'),
                filters: {
                    'JSON Files': ['json'],
                    'All Files': ['*']
                }
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(settings, 'utf8'));
                vscode.window.showInformationMessage('Settings exported successfully');
            }
        } catch (error) {
            this.errorHandler.handleError(error as Error, ErrorHandlingStrategy.LOG_AND_CONTINUE, { context: 'UserPreferencesWebview.exportSettings' });
            vscode.window.showErrorMessage(`Failed to export settings: ${error}`);
        }
    }

    /**
     * Import settings from file
     */
    private async importSettings(): Promise<void> {
        try {
            const uri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                    'JSON Files': ['json'],
                    'All Files': ['*']
                }
            });

            if (uri && uri[0]) {
                const content = await vscode.workspace.fs.readFile(uri[0]);
                const settings = JSON.parse(content.toString());
                
                // Apply imported settings
                for (const [key, value] of Object.entries(settings)) {
                    await this.config.set(key, value);
                }
                
                this.sendPreferencesData();
                vscode.window.showInformationMessage('Settings imported successfully');
            }
        } catch (error) {
            this.errorHandler.handleError(error as Error, ErrorHandlingStrategy.LOG_AND_CONTINUE, { context: 'UserPreferencesWebview.importSettings' });
            vscode.window.showErrorMessage(`Failed to import settings: ${error}`);
        }
    }

    /**
     * Validate current settings
     */
    private async validateSettings(): Promise<void> {
        try {
            const validation = this.config.validateConfiguration();
            
            if (this.panel) {
                this.panel.webview.postMessage({
                    command: 'validationResult',
                    valid: validation.valid,
                    errors: validation.errors
                });
            }
        } catch (error) {
            this.errorHandler.handleError(error as Error, ErrorHandlingStrategy.LOG_AND_CONTINUE, { context: 'UserPreferencesWebview.validateSettings' });
        }
    }

    /**
     * Get the webview HTML content
     */
    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>User Preferences</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 20px;
        }
        
        .header {
            margin-bottom: 30px;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 20px;
        }
        
        .header h1 {
            margin: 0 0 10px 0;
            color: var(--vscode-titleBar-activeForeground);
        }
        
        .header p {
            margin: 0;
            color: var(--vscode-descriptionForeground);
        }
        
        .categories {
            display: grid;
            gap: 20px;
        }
        
        .category {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 20px;
            background-color: var(--vscode-panel-background);
        }
        
        .category-header {
            display: flex;
            align-items: center;
            margin-bottom: 15px;
        }
        
        .category-icon {
            margin-right: 10px;
            font-size: 18px;
        }
        
        .category-title {
            font-size: 18px;
            font-weight: 600;
            margin: 0;
        }
        
        .category-description {
            color: var(--vscode-descriptionForeground);
            margin: 5px 0 0 0;
            font-size: 14px;
        }
        
        .settings {
            display: grid;
            gap: 15px;
        }
        
        .setting {
            display: grid;
            gap: 8px;
        }
        
        .setting-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
        }
        
        .setting-title {
            font-weight: 500;
            margin: 0;
        }
        
        .setting-description {
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
            margin: 0;
        }
        
        .setting-control {
            margin-top: 5px;
        }
        
        input, select {
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            padding: 6px 8px;
            font-family: inherit;
            font-size: inherit;
        }
        
        input[type="checkbox"] {
            margin-right: 8px;
        }
        
        .actions {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid var(--vscode-panel-border);
            display: flex;
            gap: 10px;
        }
        
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            padding: 8px 12px;
            cursor: pointer;
            font-family: inherit;
            font-size: inherit;
        }
        
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .error {
            color: var(--vscode-errorForeground);
            background-color: var(--vscode-errorBackground);
            border: 1px solid var(--vscode-errorBorder);
            border-radius: 3px;
            padding: 10px;
            margin-top: 10px;
        }
        
        .success {
            color: var(--vscode-editorInfo-foreground);
            background-color: var(--vscode-editorInfo-background);
            border: 1px solid var(--vscode-editorInfo-border);
            border-radius: 3px;
            padding: 10px;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>User Preferences</h1>
        <p>Configure SF Org Compare extension settings</p>
    </div>

    <div class="categories" id="categories">
        <!-- Categories will be populated here -->
    </div>

    <div class="actions">
        <button onclick="resetToDefaults()">Reset to Defaults</button>
        <button onclick="exportSettings()">Export Settings</button>
        <button onclick="importSettings()">Import Settings</button>
        <button onclick="validateSettings()">Validate Settings</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let preferences = {};

        // Listen for messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'loadPreferences':
                    preferences = message.categories;
                    renderPreferences();
                    break;
                case 'settingUpdated':
                    handleSettingUpdate(message);
                    break;
                case 'error':
                    showError(message.message);
                    break;
                case 'validationResult':
                    showValidationResult(message);
                    break;
            }
        });

        function renderPreferences() {
            const container = document.getElementById('categories');
            container.innerHTML = '';

            preferences.forEach(category => {
                const categoryEl = document.createElement('div');
                categoryEl.className = 'category';
                categoryEl.innerHTML = \`
                    <div class="category-header">
                        <div class="category-icon">\${getIconHtml(category.icon)}</div>
                        <div>
                            <h3 class="category-title">\${category.title}</h3>
                            <p class="category-description">\${category.description}</p>
                        </div>
                    </div>
                    <div class="settings">
                        \${category.settings.map(setting => renderSetting(setting)).join('')}
                    </div>
                \`;
                container.appendChild(categoryEl);
            });
        }

        function renderSetting(setting) {
            return \`
                <div class="setting">
                    <div class="setting-header">
                        <h4 class="setting-title">\${setting.title}</h4>
                    </div>
                    <p class="setting-description">\${setting.description}</p>
                    <div class="setting-control">
                        \${renderSettingControl(setting)}
                    </div>
                </div>
            \`;
        }

        function renderSettingControl(setting) {
            switch (setting.type) {
                case 'boolean':
                    return \`<label><input type="checkbox" \${setting.currentValue ? 'checked' : ''} onchange="updateSetting('\${setting.key}', this.checked)"> \${setting.title}</label>\`;
                case 'number':
                    return \`<input type="number" value="\${setting.currentValue}" min="\${setting.min || ''}" max="\${setting.max || ''}" step="\${setting.step || 1}" onchange="updateSetting('\${setting.key}', parseFloat(this.value))"> \${setting.unit || ''}\`;
                case 'select':
                    const options = setting.options.map(opt => \`<option value="\${opt.value}" \${opt.value === setting.currentValue ? 'selected' : ''}>\${opt.label}</option>\`).join('');
                    return \`<select onchange="updateSetting('\${setting.key}', this.value)">\${options}</select>\`;
                case 'multiselect':
                    const checkboxes = setting.options.map(opt => 
                        \`<label><input type="checkbox" value="\${opt.value}" \${setting.currentValue.includes(opt.value) ? 'checked' : ''} onchange="updateMultiSetting('\${setting.key}')"> \${opt.label}</label>\`
                    ).join('<br>');
                    return \`<div>\${checkboxes}</div>\`;
                default:
                    return \`<input type="text" value="\${setting.currentValue}" onchange="updateSetting('\${setting.key}', this.value)">\`;
            }
        }

        function getIconHtml(icon) {
            const iconMap = {
                'gear': '⚙️',
                'pulse': '📊',
                'cloud': '☁️',
                'database': '🗃️',
                'layout': '📱',
                'shield': '🛡️'
            };
            return iconMap[icon] || '📋';
        }

        function updateSetting(key, value) {
            vscode.postMessage({
                command: 'updateSetting',
                key: key,
                value: value
            });
        }

        function updateMultiSetting(key) {
            const checkboxes = document.querySelectorAll(\`input[onchange="updateMultiSetting('\${key}')"]\`);
            const values = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
            updateSetting(key, values);
        }

        function resetToDefaults() {
            if (confirm('Reset all settings to defaults? This cannot be undone.')) {
                vscode.postMessage({ command: 'resetToDefaults' });
            }
        }

        function exportSettings() {
            vscode.postMessage({ command: 'exportSettings' });
        }

        function importSettings() {
            vscode.postMessage({ command: 'importSettings' });
        }

        function validateSettings() {
            vscode.postMessage({ command: 'validateSettings' });
        }

        function handleSettingUpdate(message) {
            if (message.success) {
                // Optionally show success feedback
            } else {
                showError(\`Failed to update \${message.key}: \${message.error}\`);
            }
        }

        function showError(message) {
            const errorEl = document.createElement('div');
            errorEl.className = 'error';
            errorEl.textContent = message;
            document.body.appendChild(errorEl);
            setTimeout(() => errorEl.remove(), 5000);
        }

        function showValidationResult(result) {
            const messageEl = document.createElement('div');
            messageEl.className = result.valid ? 'success' : 'error';
            messageEl.textContent = result.valid ? 'All settings are valid' : \`Validation errors: \${result.errors.join(', ')}\`;
            document.body.appendChild(messageEl);
            setTimeout(() => messageEl.remove(), 5000);
        }
    </script>
</body>
</html>`;
    }
}
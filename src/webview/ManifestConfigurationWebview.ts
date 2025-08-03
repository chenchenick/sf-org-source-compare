import * as vscode from 'vscode';
import * as path from 'path';
import { ManifestManager, MetadataType, AVAILABLE_METADATA_TYPES, OrgManifestConfig } from '../services/ManifestManager';
import { EnhancedOrgManager } from '../metadata/EnhancedOrgManager';
import { SalesforceOrg } from '../types';

/**
 * Webview provider for manifest configuration
 */
export class ManifestConfigurationWebview {
    private panel: vscode.WebviewPanel | undefined;
    private manifestManager: ManifestManager;
    private enhancedOrgManager: EnhancedOrgManager;
    private context: vscode.ExtensionContext;

    constructor(
        context: vscode.ExtensionContext,
        manifestManager: ManifestManager,
        enhancedOrgManager: EnhancedOrgManager
    ) {
        this.context = context;
        this.manifestManager = manifestManager;
        this.enhancedOrgManager = enhancedOrgManager;
    }

    /**
     * Show the manifest configuration webview
     */
    public async show(orgId?: string): Promise<void> {
        if (this.panel) {
            this.panel.reveal();
            if (orgId) {
                // Send all orgs first, then the specific org data
                this.sendAllOrgsData();
                this.sendOrgData(orgId);
            }
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'manifestConfiguration',
            'Manifest Configuration',
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

        // Send initial data
        if (orgId) {
            // Send all orgs first, then the specific org data
            this.sendAllOrgsData();
            this.sendOrgData(orgId);
        } else {
            // Find the last modified org and show it by default
            const lastModifiedOrgId = this.getLastModifiedOrgId();
            if (lastModifiedOrgId) {
                // Send all orgs first, then the specific org data
                this.sendAllOrgsData();
                this.sendOrgData(lastModifiedOrgId);
            } else {
                this.sendAllOrgsData();
            }
        }
    }

    /**
     * Get the org with the most recent last modified timestamp
     */
    private getLastModifiedOrgId(): string | null {
        const orgs = this.enhancedOrgManager.getOrgs();
        if (orgs.length === 0) {
            return null;
        }

        let lastModifiedOrg: SalesforceOrg | null = null;
        let lastModifiedTime: Date | null = null;

        for (const org of orgs) {
            const config = this.manifestManager.getOrgManifestConfig(org.id, org.alias);
            if (config.lastModified) {
                const modifiedDate = new Date(config.lastModified);
                if (!lastModifiedTime || modifiedDate > lastModifiedTime) {
                    lastModifiedTime = modifiedDate;
                    lastModifiedOrg = org;
                }
            }
        }

        return lastModifiedOrg ? lastModifiedOrg.id : null;
    }

    /**
     * Setup message handling between webview and extension
     */
    private setupWebviewMessageHandling(): void {
        this.panel!.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'getOrgs':
                    this.sendAllOrgsData();
                    break;
                    
                case 'getOrgConfig':
                    this.sendOrgData(message.orgId);
                    break;
                    
                case 'updateOrgConfig':
                    await this.handleUpdateOrgConfig(message);
                    break;
                    
                case 'resetToDefault':
                    await this.handleResetToDefault(message.orgId);
                    break;
                    
                case 'enableAllTypes':
                    await this.handleEnableAllTypes(message.orgId);
                    break;
                    
                case 'enableCoreTypesOnly':
                    await this.handleEnableCoreTypesOnly(message.orgId);
                    break;
                    
                case 'previewManifest':
                    this.handlePreviewManifest(message.orgId);
                    break;
                    
                default:
                    console.warn('Unknown webview message:', message);
            }
        });
    }

    /**
     * Send data for all orgs to webview
     */
    private sendAllOrgsData(): void {
        const orgs = this.enhancedOrgManager.getOrgs();
        const orgData = orgs.map(org => {
            const config = this.manifestManager.getOrgManifestConfig(org.id, org.alias);
            const stats = this.manifestManager.getManifestStats(org.id);
            
            return {
                id: org.id,
                alias: org.alias,
                username: org.username,
                instanceUrl: org.instanceUrl,
                stats,
                lastModified: config.lastModified
            };
        });

        this.panel!.webview.postMessage({
            command: 'updateOrgsList',
            orgs: orgData
        });
    }

    /**
     * Send detailed data for a specific org to webview
     */
    private sendOrgData(orgId: string): void {
        const org = this.enhancedOrgManager.getOrg(orgId);
        if (!org) {
            vscode.window.showErrorMessage(`Organization not found: ${orgId}`);
            return;
        }

        const config = this.manifestManager.getOrgManifestConfig(orgId, org.alias);
        const metadataTypes = this.manifestManager.getMetadataTypesByCategory();
        const stats = this.manifestManager.getManifestStats(orgId);

        this.panel!.webview.postMessage({
            command: 'updateOrgConfig',
            org: {
                id: org.id,
                alias: org.alias,
                username: org.username,
                instanceUrl: org.instanceUrl
            },
            config,
            metadataTypes: Array.from(metadataTypes.entries()),
            stats
        });
    }

    /**
     * Handle updating org configuration
     */
    private async handleUpdateOrgConfig(message: any): Promise<void> {
        try {
            const { orgId, enabledMetadataTypes, customMembers } = message;
            
            await this.manifestManager.updateOrgManifestConfig(orgId, {
                enabledMetadataTypes,
                customMembers: new Map(Object.entries(customMembers || {}))
            });

            // Send updated data back
            this.sendOrgData(orgId);
            
            vscode.window.showInformationMessage('Manifest configuration updated successfully');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to update manifest configuration: ${error}`);
        }
    }

    /**
     * Handle reset to default configuration
     */
    private async handleResetToDefault(orgId: string): Promise<void> {
        try {
            await this.manifestManager.resetToDefault(orgId);
            this.sendOrgData(orgId);
            vscode.window.showInformationMessage('Manifest configuration reset to default');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to reset configuration: ${error}`);
        }
    }

    /**
     * Handle enable all types
     */
    private async handleEnableAllTypes(orgId: string): Promise<void> {
        try {
            await this.manifestManager.enableAllTypes(orgId);
            this.sendOrgData(orgId);
            vscode.window.showInformationMessage('All metadata types enabled');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to enable all types: ${error}`);
        }
    }

    /**
     * Handle enable core types only
     */
    private async handleEnableCoreTypesOnly(orgId: string): Promise<void> {
        try {
            await this.manifestManager.enableCoreTypesOnly(orgId);
            this.sendOrgData(orgId);
            vscode.window.showInformationMessage('Enabled core metadata types only');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to enable core types: ${error}`);
        }
    }

    /**
     * Handle manifest preview
     */
    private handlePreviewManifest(orgId: string): void {
        const manifest = this.manifestManager.generateManifest(orgId);
        const org = this.enhancedOrgManager.getOrg(orgId);
        
        this.panel!.webview.postMessage({
            command: 'showManifestPreview',
            manifest,
            orgName: org?.alias || org?.username
        });
    }

    /**
     * Generate webview HTML content
     */
    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Manifest Configuration</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 16px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .header {
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 16px;
            margin-bottom: 24px;
        }
        
        .header h1 {
            margin: 0 0 8px 0;
            color: var(--vscode-foreground);
        }
        
        .header p {
            margin: 0;
            color: var(--vscode-descriptionForeground);
        }
        
        .org-selector {
            margin-bottom: 24px;
        }
        
        .org-selector select {
            background: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            padding: 8px 12px;
            border-radius: 2px;
            font-size: 14px;
            min-width: 300px;
        }
        
        .org-info {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 16px;
            margin-bottom: 24px;
        }
        
        .org-info h3 {
            margin: 0 0 8px 0;
        }
        
        .org-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 16px;
            margin-bottom: 16px;
        }
        
        .stat-item {
            text-align: center;
            padding: 12px;
            background: var(--vscode-button-secondaryBackground);
            border-radius: 4px;
        }
        
        .stat-value {
            font-size: 24px;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }
        
        .stat-label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }
        
        .actions {
            display: flex;
            gap: 8px;
            margin-bottom: 24px;
        }
        
        .btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 13px;
        }
        
        .btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        .btn-secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        
        .metadata-categories {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 16px;
        }
        
        .category-card {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 16px;
        }
        
        .category-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }
        
        .category-title {
            font-weight: bold;
            color: var(--vscode-foreground);
        }
        
        .category-toggle {
            font-size: 12px;
            color: var(--vscode-textLink-foreground);
            cursor: pointer;
        }
        
        .metadata-type {
            display: flex;
            align-items: center;
            margin-bottom: 8px;
            padding: 4px;
            border-radius: 2px;
        }
        
        .metadata-type:hover {
            background: var(--vscode-list-hoverBackground);
        }
        
        .metadata-type input[type="checkbox"] {
            margin-right: 8px;
        }
        
        .metadata-type-info {
            flex: 1;
        }
        
        .metadata-type-name {
            font-weight: 500;
        }
        
        .metadata-type-desc {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 2px;
        }
        
        .manifest-preview {
            margin-top: 24px;
            display: none;
        }
        
        .manifest-preview pre {
            background: var(--vscode-textCodeBlock-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 16px;
            overflow-x: auto;
            font-size: 12px;
            max-height: 400px;
        }
        
        .loading {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }
        
        .no-orgs {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🗂️ Manifest Configuration</h1>
            <p>Configure which metadata types to retrieve for each Salesforce organization</p>
        </div>
        
        <div id="loading" class="loading">
            <p>Loading organizations...</p>
        </div>
        
        <div id="no-orgs" class="no-orgs" style="display: none;">
            <p>No organizations found. Please add a Salesforce organization first.</p>
        </div>
        
        <div id="main-content" style="display: none;">
            <div class="org-selector">
                <label for="org-select">Select Organization:</label>
                <select id="org-select">
                    <option value="">Select an organization...</option>
                </select>
            </div>
            
            <div id="org-details" style="display: none;">
                <!-- Org info and configuration will be populated here -->
            </div>
        </div>
        
        <div id="manifest-preview" class="manifest-preview">
            <h3>📄 Manifest Preview</h3>
            <pre id="manifest-content"></pre>
        </div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        let currentOrgId = null;
        let orgData = {};
        
        // Request initial data
        vscode.postMessage({ command: 'getOrgs' });
        
        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'updateOrgsList':
                    updateOrgsList(message.orgs);
                    break;
                case 'updateOrgConfig':
                    updateOrgConfig(message);
                    break;
                case 'showManifestPreview':
                    showManifestPreview(message);
                    break;
            }
        });
        
        function updateOrgsList(orgs) {
            const loading = document.getElementById('loading');
            const noOrgs = document.getElementById('no-orgs');
            const mainContent = document.getElementById('main-content');
            const orgSelect = document.getElementById('org-select');
            
            loading.style.display = 'none';
            
            if (orgs.length === 0) {
                noOrgs.style.display = 'block';
                return;
            }
            
            mainContent.style.display = 'block';
            
            // Clear and populate org selector
            orgSelect.innerHTML = '<option value="">Select an organization...</option>';
            orgs.forEach(org => {
                const option = document.createElement('option');
                option.value = org.id;
                option.textContent = \`\${org.alias || org.username} (\${org.stats.enabledTypes}/\${org.stats.totalAvailableTypes} types)\`;
                orgSelect.appendChild(option);
            });
            
            // Handle org selection
            orgSelect.addEventListener('change', (e) => {
                if (e.target.value) {
                    currentOrgId = e.target.value;
                    vscode.postMessage({ command: 'getOrgConfig', orgId: currentOrgId });
                } else {
                    document.getElementById('org-details').style.display = 'none';
                    hideManifestPreview();
                }
            });
        }
        
        function updateOrgConfig(data) {
            const orgDetails = document.getElementById('org-details');
            const { org, config, metadataTypes, stats } = data;
            
            orgData = data;
            
            orgDetails.innerHTML = \`
                <div class="org-info">
                    <h3>\${org.alias || org.username}</h3>
                    <p><strong>Username:</strong> \${org.username}</p>
                    <p><strong>Instance URL:</strong> \${org.instanceUrl}</p>
                    <p><strong>API Version:</strong> \${config.apiVersion}</p>
                    <p><strong>Last Modified:</strong> \${new Date(config.lastModified).toLocaleString()}</p>
                </div>
                
                <div class="org-stats">
                    <div class="stat-item">
                        <div class="stat-value">\${stats.enabledTypes}</div>
                        <div class="stat-label">Enabled Types</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">\${stats.totalAvailableTypes}</div>
                        <div class="stat-label">Total Available</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">\${stats.categoriesUsed}</div>
                        <div class="stat-label">Categories Used</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">\${stats.disabledTypes}</div>
                        <div class="stat-label">Disabled Types</div>
                    </div>
                </div>
                
                <div class="actions">
                    <button class="btn" onclick="enableAllTypes()">Enable All Types</button>
                    <button class="btn btn-secondary" onclick="enableCoreTypesOnly()">Core Types Only</button>
                    <button class="btn btn-secondary" onclick="resetToDefault()">Reset to Default</button>
                    <button class="btn btn-secondary" onclick="previewManifest()">Preview Manifest</button>
                </div>
                
                <div class="metadata-categories" id="metadata-categories">
                    <!-- Categories will be populated here -->
                </div>
            \`;
            
            // Update org selector to show the selected org
            const orgSelect = document.getElementById('org-select');
            if (orgSelect) {
                orgSelect.value = org.id;
                currentOrgId = org.id;
            }
            
            // Populate metadata categories
            const categoriesContainer = document.getElementById('metadata-categories');
            metadataTypes.forEach(([category, types]) => {
                const categoryCard = createCategoryCard(category, types, config.enabledMetadataTypes);
                categoriesContainer.appendChild(categoryCard);
            });
            
            orgDetails.style.display = 'block';
        }
        
        function createCategoryCard(category, types, enabledTypes) {
            const card = document.createElement('div');
            card.className = 'category-card';
            
            const enabledInCategory = types.filter(type => enabledTypes.includes(type.name)).length;
            
            card.innerHTML = \`
                <div class="category-header">
                    <div class="category-title">\${category} (\${enabledInCategory}/\${types.length})</div>
                    <div class="category-toggle" onclick="toggleCategory('\${category}')">
                        \${enabledInCategory === types.length ? 'Disable All' : 'Enable All'}
                    </div>
                </div>
                <div class="category-types" id="category-\${category}">
                    \${types.map(type => \`
                        <div class="metadata-type">
                            <input type="checkbox" 
                                   id="type-\${type.name}" 
                                   \${enabledTypes.includes(type.name) ? 'checked' : ''}
                                   onchange="toggleMetadataType('\${type.name}', this.checked)">
                            <div class="metadata-type-info">
                                <div class="metadata-type-name">\${type.displayName}</div>
                                <div class="metadata-type-desc">\${type.description}</div>
                            </div>
                        </div>
                    \`).join('')}
                </div>
            \`;
            
            return card;
        }
        
        function toggleMetadataType(typeName, enabled) {
            if (!orgData.config) return;
            
            if (enabled) {
                if (!orgData.config.enabledMetadataTypes.includes(typeName)) {
                    orgData.config.enabledMetadataTypes.push(typeName);
                }
            } else {
                orgData.config.enabledMetadataTypes = orgData.config.enabledMetadataTypes.filter(t => t !== typeName);
            }
            
            saveConfiguration();
        }
        
        function toggleCategory(category) {
            const categoryTypes = orgData.metadataTypes.find(([cat]) => cat === category)?.[1] || [];
            const allEnabled = categoryTypes.every(type => orgData.config.enabledMetadataTypes.includes(type.name));
            
            if (allEnabled) {
                // Disable all in category
                categoryTypes.forEach(type => {
                    orgData.config.enabledMetadataTypes = orgData.config.enabledMetadataTypes.filter(t => t !== type.name);
                    const checkbox = document.getElementById(\`type-\${type.name}\`);
                    if (checkbox) checkbox.checked = false;
                });
            } else {
                // Enable all in category
                categoryTypes.forEach(type => {
                    if (!orgData.config.enabledMetadataTypes.includes(type.name)) {
                        orgData.config.enabledMetadataTypes.push(type.name);
                    }
                    const checkbox = document.getElementById(\`type-\${type.name}\`);
                    if (checkbox) checkbox.checked = true;
                });
            }
            
            saveConfiguration();
        }
        
        function saveConfiguration() {
            vscode.postMessage({
                command: 'updateOrgConfig',
                orgId: currentOrgId,
                enabledMetadataTypes: orgData.config.enabledMetadataTypes,
                customMembers: {}
            });
        }
        
        function enableAllTypes() {
            vscode.postMessage({ command: 'enableAllTypes', orgId: currentOrgId });
        }
        
        function enableCoreTypesOnly() {
            vscode.postMessage({ command: 'enableCoreTypesOnly', orgId: currentOrgId });
        }
        
        function resetToDefault() {
            vscode.postMessage({ command: 'resetToDefault', orgId: currentOrgId });
        }
        
        function previewManifest() {
            vscode.postMessage({ command: 'previewManifest', orgId: currentOrgId });
        }
        
        function showManifestPreview(data) {
            const preview = document.getElementById('manifest-preview');
            const content = document.getElementById('manifest-content');
            
            content.textContent = data.manifest;
            preview.style.display = 'block';
            
            // Scroll to preview
            preview.scrollIntoView({ behavior: 'smooth' });
        }
        
        function hideManifestPreview() {
            document.getElementById('manifest-preview').style.display = 'none';
        }
    </script>
</body>
</html>`;
    }
}
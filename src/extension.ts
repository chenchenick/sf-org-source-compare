import * as vscode from 'vscode';
import { SfOrgCompareProvider } from './providers/SfOrgCompareProvider';
import { OrgManager } from './services/OrgManager';
import { EnhancedOrgManager } from './metadata/EnhancedOrgManager';
import { FileCompareService } from './services/FileCompareService';

// Store service instances for cleanup
let fileCompareService: FileCompareService;
let enhancedOrgManager: EnhancedOrgManager;

export function activate(context: vscode.ExtensionContext) {
	console.log('🚀 Salesforce Org Source Compare extension is now active!');
	vscode.window.showInformationMessage('SF Org Compare extension activated!');

	// Initialize enhanced org manager with comprehensive metadata support
	enhancedOrgManager = new EnhancedOrgManager(context);
	
	// Initialize enhanced org manager asynchronously
	enhancedOrgManager.initialize().then(() => {
		console.log('✅ Enhanced metadata system initialized');
		const configSummary = enhancedOrgManager.getConfigurationSummary();
		console.log(`📊 Metadata support: ${configSummary.enabledTypes} enabled types, ${configSummary.handlerCount} handlers`);
	}).catch(error => {
		console.error('❌ Failed to initialize enhanced metadata system:', error);
		vscode.window.showErrorMessage('Failed to initialize enhanced metadata system. Some features may be limited.');
	});

	// For backward compatibility, also create the old OrgManager
	const orgManager = new OrgManager(context);
	fileCompareService = new FileCompareService(orgManager, enhancedOrgManager);
	const sfOrgCompareProvider = new SfOrgCompareProvider(orgManager, enhancedOrgManager, fileCompareService);

	// Cleanup old sessions on startup
	FileCompareService.cleanupOldSessions().catch(error => {
		console.warn('Failed to cleanup old sessions on startup:', error);
	});

	console.log('📋 Registering tree data provider...');
	vscode.window.registerTreeDataProvider('sfOrgCompareView', sfOrgCompareProvider);
	console.log('✅ Tree data provider registered!');

	const openCompareView = vscode.commands.registerCommand('sf-org-source-compare.openCompareView', () => {
		vscode.commands.executeCommand('sfOrgCompareView.focus');
	});

	const refreshOrgs = vscode.commands.registerCommand('sf-org-source-compare.refreshOrgs', async () => {
		await sfOrgCompareProvider.refresh();
	});

	const refreshTreeView = vscode.commands.registerCommand('sf-org-source-compare.refreshTreeView', () => {
		sfOrgCompareProvider.refreshTreeView();
	});

	const refreshOrg = vscode.commands.registerCommand('sf-org-source-compare.refreshOrg', async (orgItem) => {
		if (orgItem && orgItem.orgId) {
			await sfOrgCompareProvider.refreshOrg(orgItem.orgId);
		}
	});

	const compareFiles = vscode.commands.registerCommand('sf-org-source-compare.compareFiles', () => {
		fileCompareService.compareSelectedFiles();
	});

	const selectOrg = vscode.commands.registerCommand('sf-org-source-compare.selectOrg', (orgItem) => {
		if (orgItem.id === 'no-orgs') {
			orgManager.authenticateOrg().then(async () => {
				await sfOrgCompareProvider.refresh();
			});
		} else {
			sfOrgCompareProvider.selectOrg(orgItem);
		}
	});

	const selectFile = vscode.commands.registerCommand('sf-org-source-compare.selectFile', (fileItem) => {
		if (!fileItem.file) {
			return;
		}

		fileCompareService.selectFile(fileItem.file);
	});

	const openFile = vscode.commands.registerCommand('sf-org-source-compare.openFile', async (fileItem) => {
		if (!fileItem.file || !fileItem.file.filePath) {
			vscode.window.showErrorMessage('File path not available');
			return;
		}

		try {
			const fileUri = vscode.Uri.file(fileItem.file.filePath);
			await vscode.window.showTextDocument(fileUri);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to open file: ${error}`);
		}
	});

	const addOrg = vscode.commands.registerCommand('sf-org-source-compare.addOrg', async () => {
		await orgManager.authenticateOrg();
		await sfOrgCompareProvider.refresh();
	});

	const deleteOrg = vscode.commands.registerCommand('sf-org-source-compare.deleteOrg', async (orgItem) => {
		await sfOrgCompareProvider.deleteOrg(orgItem);
	});

	const clearSelection = vscode.commands.registerCommand('sf-org-source-compare.clearSelection', () => {
		fileCompareService.clearSelection();
		vscode.window.showInformationMessage('File selection cleared');
	});

	const cleanupTempFiles = vscode.commands.registerCommand('sf-org-source-compare.cleanupTempFiles', async () => {
		try {
			await fileCompareService.cleanup();
			await FileCompareService.cleanupOldSessions();
			vscode.window.showInformationMessage('Temporary files cleaned up successfully');
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to cleanup temporary files: ${error}`);
		}
	});

	context.subscriptions.push(
		openCompareView,
		refreshOrgs,
		refreshTreeView,
		refreshOrg,
		compareFiles,
		selectOrg,
		selectFile,
		openFile,
		addOrg,
		deleteOrg,
		clearSelection,
		cleanupTempFiles
	);
}

export async function deactivate() {
	console.log('🧹 Deactivating SF Org Compare extension...');
	
	// Cleanup temporary files
	if (fileCompareService) {
		try {
			await fileCompareService.cleanup();
			console.log('✅ Temporary files cleaned up successfully');
		} catch (error) {
			console.error('❌ Failed to cleanup temporary files:', error);
		}
	}
	
	console.log('👋 SF Org Compare extension deactivated');
}

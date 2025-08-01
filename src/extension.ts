import * as vscode from 'vscode';
import { initializeContainer, Container, ServiceFactory, ServiceTokens } from './di';
import { SfOrgCompareProvider } from './providers/SfOrgCompareProvider';
import { EnhancedOrgManager } from './metadata/EnhancedOrgManager';
import { FileCompareService } from './services/FileCompareService';
import { ManifestConfigurationWebview } from './webview/ManifestConfigurationWebview';
import { UserPreferencesWebview } from './webview/UserPreferencesWebview';
import { FileSearchService } from './search/FileSearchService';
import { UserErrorReporter } from './errors/UserErrorReporter';

// Store DI container and service instances for cleanup
let container: Container;
let serviceFactory: ServiceFactory;
let fileCompareService: FileCompareService;
let enhancedOrgManager: EnhancedOrgManager;
let manifestConfigWebview: ManifestConfigurationWebview;
let userPreferencesWebview: UserPreferencesWebview;
let fileSearchService: FileSearchService;
let userErrorReporter: UserErrorReporter;

export async function activate(context: vscode.ExtensionContext) {
	console.log('🚀 Salesforce Org Source Compare extension is now active!');
	vscode.window.showInformationMessage('SF Org Compare extension activated!');

	try {
		// Initialize dependency injection container
		const diContainer = initializeContainer(context);
		container = diContainer.container;
		serviceFactory = diContainer.serviceFactory;

		// Create core services using DI
		const coreServices = await serviceFactory.createCoreServices();
		enhancedOrgManager = coreServices.enhancedOrgManager;
		fileCompareService = coreServices.fileCompareService;
		const sfOrgCompareProvider = coreServices.sfOrgCompareProvider;
		
		// Create webview services
		manifestConfigWebview = container.resolve<ManifestConfigurationWebview>(ServiceTokens.MANIFEST_CONFIGURATION_WEBVIEW);
		userPreferencesWebview = container.resolve<UserPreferencesWebview>(ServiceTokens.USER_PREFERENCES_WEBVIEW);
		
		// Create search service
		fileSearchService = new FileSearchService(sfOrgCompareProvider, fileCompareService);
		
		// Create error reporting service
		userErrorReporter = container.resolve<UserErrorReporter>(ServiceTokens.USER_ERROR_REPORTER);

		console.log('📋 Registering tree data provider...');
		vscode.window.registerTreeDataProvider('sfOrgCompareView', sfOrgCompareProvider);
		console.log('✅ Tree data provider registered!');
		

		// Register commands
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

		const openMultiWayComparison = vscode.commands.registerCommand('sf-org-source-compare.openMultiWayComparison', async () => {
			try {
				if (!fileCompareService.canCompare()) {
					vscode.window.showWarningMessage('Please select at least 2 files for comparison.');
					return;
				}

				const compareType = fileCompareService.getCompareType();
				if (compareType === 'two-way') {
					// For two files, use regular comparison
					await fileCompareService.compareSelectedFiles();
				} else {
					// For 3+ files, use multi-way comparison
					const multiFileCompareWebview = container.resolve(ServiceTokens.MULTI_FILE_COMPARE_WEBVIEW) as any;
					const multiFileCompareService = container.resolve(ServiceTokens.MULTI_FILE_COMPARE_SERVICE) as any;

					const selection = {
						files: fileCompareService.getSelectedFiles(),
						compareType: compareType,
						layout: multiFileCompareService.getRecommendedLayout(fileCompareService.getSelectedFiles().length),
						maxFiles: fileCompareService.getMaxFiles()
					};

					await multiFileCompareWebview.show(selection);
				}
			} catch (error) {
				await userErrorReporter.reportOperationFailure(
					'Open multi-way comparison',
					error as Error
				);
			}
		});

		const selectOrg = vscode.commands.registerCommand('sf-org-source-compare.selectOrg', (orgItem) => {
			if (orgItem.id === 'no-orgs') {
				enhancedOrgManager.authenticateOrg().then(async () => {
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
				await userErrorReporter.reportError(
					new Error('File path not available'),
					'Opening file'
				);
				return;
			}

			try {
				const fileUri = vscode.Uri.file(fileItem.file.filePath);
				await vscode.window.showTextDocument(fileUri);
			} catch (error) {
				await userErrorReporter.reportFileSystemError(
					fileItem.file.filePath,
					'opening file',
					error as Error
				);
			}
		});

		const addOrg = vscode.commands.registerCommand('sf-org-source-compare.addOrg', async () => {
			await enhancedOrgManager.authenticateOrg();
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
				await userErrorReporter.reportOperationFailure(
					'Cleanup temporary files',
					error as Error
				);
			}
		});

		const configureManifest = vscode.commands.registerCommand('sf-org-source-compare.configureManifest', async (orgItem) => {
			try {
				const orgId = orgItem?.orgId;
				await manifestConfigWebview.show(orgId);
			} catch (error) {
				await userErrorReporter.reportOperationFailure(
					'Open manifest configuration',
					error as Error
				);
			}
		});

		const openUserPreferences = vscode.commands.registerCommand('sf-org-source-compare.openUserPreferences', async (categoryId?: string) => {
			try {
				await userPreferencesWebview.show(categoryId);
			} catch (error) {
				await userErrorReporter.reportOperationFailure(
					'Open user preferences',
					error as Error
				);
			}
		});

		const openFileSearch = vscode.commands.registerCommand('sf-org-source-compare.openFileSearch', async () => {
			try {
				await fileSearchService.openFileSearch();
			} catch (error) {
				await userErrorReporter.reportOperationFailure(
					'Open file search',
					error as Error
				);
			}
		});

		// Register all commands with VS Code
		context.subscriptions.push(
			openCompareView,
			refreshOrgs,
			refreshTreeView,
			refreshOrg,
			compareFiles,
			openMultiWayComparison,
			selectOrg,
			selectFile,
			openFile,
			addOrg,
			deleteOrg,
			clearSelection,
			cleanupTempFiles,
			configureManifest,
			openUserPreferences,
			openFileSearch
		);

		console.log('✅ Extension activation completed successfully with DI');

	} catch (error) {
		console.error('❌ Failed to activate extension:', error);
		
		// Try to use enhanced error reporting if available, otherwise fall back to basic message
		if (userErrorReporter) {
			await userErrorReporter.reportOperationFailure('Activate extension', error as Error);
		} else {
			vscode.window.showErrorMessage(`Failed to activate SF Org Compare extension: ${error}`);
		}
		
		// Cleanup on activation failure
		if (container) {
			await container.dispose();
		}
		throw error;
	}
}

export async function deactivate() {
	console.log('🧹 Deactivating SF Org Compare extension...');
	
	try {
		// Cleanup temporary files
		if (fileCompareService) {
			try {
				await fileCompareService.cleanup();
				console.log('✅ Temporary files cleaned up successfully');
			} catch (error) {
				console.error('❌ Failed to cleanup temporary files:', error);
			}
		}

		// Dispose of DI container and all managed services
		if (container) {
			try {
				await container.dispose();
				console.log('✅ DI container and services disposed successfully');
			} catch (error) {
				console.error('❌ Failed to dispose DI container:', error);
			}
		}
	} catch (error) {
		console.error('❌ Error during deactivation:', error);
	}
	
	console.log('👋 SF Org Source Compare extension deactivated');
}

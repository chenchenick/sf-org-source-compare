import * as vscode from 'vscode';
import { SfOrgCompareProvider } from './providers/SfOrgCompareProvider';
import { OrgManager } from './services/OrgManager';
import { FileCompareService } from './services/FileCompareService';

export function activate(context: vscode.ExtensionContext) {
	console.log('🚀 Salesforce Org Source Compare extension is now active!');
	vscode.window.showInformationMessage('SF Org Compare extension activated!');

	const orgManager = new OrgManager(context);
	const fileCompareService = new FileCompareService(orgManager);
	const sfOrgCompareProvider = new SfOrgCompareProvider(orgManager, fileCompareService);

	console.log('📋 Registering tree data provider...');
	vscode.window.registerTreeDataProvider('sfOrgCompareView', sfOrgCompareProvider);
	console.log('✅ Tree data provider registered!');

	const openCompareView = vscode.commands.registerCommand('sf-org-source-compare.openCompareView', () => {
		vscode.commands.executeCommand('sfOrgCompareView.focus');
	});

	const refreshOrgs = vscode.commands.registerCommand('sf-org-source-compare.refreshOrgs', () => {
		sfOrgCompareProvider.refresh();
	});

	const compareFiles = vscode.commands.registerCommand('sf-org-source-compare.compareFiles', () => {
		fileCompareService.compareSelectedFiles();
	});

	const selectOrg = vscode.commands.registerCommand('sf-org-source-compare.selectOrg', (orgItem) => {
		if (orgItem.id === 'no-orgs') {
			orgManager.authenticateOrg().then(() => {
				sfOrgCompareProvider.refresh();
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

	const addOrg = vscode.commands.registerCommand('sf-org-source-compare.addOrg', async () => {
		await orgManager.authenticateOrg();
		sfOrgCompareProvider.refresh();
	});

	const deleteOrg = vscode.commands.registerCommand('sf-org-source-compare.deleteOrg', async (orgItem) => {
		await sfOrgCompareProvider.deleteOrg(orgItem);
	});

	const clearSelection = vscode.commands.registerCommand('sf-org-source-compare.clearSelection', () => {
		fileCompareService.clearSelection();
		vscode.window.showInformationMessage('File selection cleared');
	});

	context.subscriptions.push(
		openCompareView,
		refreshOrgs,
		compareFiles,
		selectOrg,
		selectFile,
		addOrg,
		deleteOrg,
		clearSelection
	);
}

export function deactivate() {}

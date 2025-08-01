import * as vscode from 'vscode';
import { Container, ServiceTokens, ServiceLifetime } from './Container';
import { EnhancedOrgManager } from '../metadata/EnhancedOrgManager';
import { FileCompareService } from '../services/FileCompareService';
import { SfOrgCompareProvider } from '../providers/SfOrgCompareProvider';
import { SourceRetrievalService } from '../services/SourceRetrievalService';
import { ManifestManager } from '../services/ManifestManager';
import { OrgCacheService } from '../services/OrgCacheService';
import { ManifestConfigurationWebview } from '../webview/ManifestConfigurationWebview';
import { UserPreferencesWebview } from '../webview/UserPreferencesWebview';
import { MultiFileCompareWebview } from '../webview/MultiFileCompareWebview';
import { MultiFileCompareService } from '../services/MultiFileCompareService';
import { ConfigurationManager } from '../config/ConfigurationManager';
import { SecureCommandExecutor } from '../security/SecureCommandExecutor';
import { ErrorHandler } from '../errors/ErrorHandler';
import { UserErrorReporter } from '../errors/UserErrorReporter';
import { MetadataRegistry } from '../metadata/MetadataRegistry';
import { MetadataConfiguration } from '../metadata/MetadataConfiguration';
import { ParallelProcessor } from '../metadata/ParallelProcessor';
import { ProgressManager } from '../progress/ProgressManager';

/**
 * Register all application services with the DI container
 */
export function registerServices(container: Container): void {
    // Configuration services (singletons)
    container.registerFactory(
        ServiceTokens.CONFIGURATION_MANAGER,
        () => ConfigurationManager.getInstance(),
        ServiceLifetime.Singleton
    );

    // Error handling (singleton)
    container.registerFactory(
        ServiceTokens.ERROR_HANDLER,
        () => ErrorHandler.getInstance(),
        ServiceLifetime.Singleton
    );

    container.registerFactory(
        ServiceTokens.USER_ERROR_REPORTER,
        () => UserErrorReporter.getInstance(),
        ServiceLifetime.Singleton
    );

    // Security services (singleton)
    container.register(
        ServiceTokens.SECURE_COMMAND_EXECUTOR,
        SecureCommandExecutor,
        ServiceLifetime.Singleton
    );

    // Metadata services (singletons)
    container.registerFactory(
        ServiceTokens.METADATA_REGISTRY,
        () => MetadataRegistry.getInstance(),
        ServiceLifetime.Singleton
    );

    container.registerFactory(
        ServiceTokens.METADATA_CONFIGURATION,
        () => MetadataConfiguration.getInstance(),
        ServiceLifetime.Singleton
    );

    container.registerFactory(
        ServiceTokens.PARALLEL_PROCESSOR,
        (registry: MetadataRegistry) => new ParallelProcessor(registry),
        ServiceLifetime.Singleton,
        [ServiceTokens.METADATA_REGISTRY]
    );

    container.registerFactory(
        ServiceTokens.PROGRESS_MANAGER,
        () => ProgressManager.getInstance(),
        ServiceLifetime.Singleton
    );

    // Core business services
    container.register(
        ServiceTokens.MANIFEST_MANAGER,
        ManifestManager,
        ServiceLifetime.Singleton,
        [ServiceTokens.EXTENSION_CONTEXT]
    );

    container.register(
        ServiceTokens.SOURCE_RETRIEVAL_SERVICE,
        SourceRetrievalService,
        ServiceLifetime.Singleton,
        [ServiceTokens.MANIFEST_MANAGER]
    );

    container.register(
        ServiceTokens.ORG_CACHE_SERVICE,
        OrgCacheService,
        ServiceLifetime.Singleton,
        [ServiceTokens.EXTENSION_CONTEXT]
    );

    container.register(
        ServiceTokens.ENHANCED_ORG_MANAGER,
        EnhancedOrgManager,
        ServiceLifetime.Singleton,
        [ServiceTokens.EXTENSION_CONTEXT]
    );

    container.register(
        ServiceTokens.FILE_COMPARE_SERVICE,
        FileCompareService,
        ServiceLifetime.Singleton,
        [ServiceTokens.ENHANCED_ORG_MANAGER]
    );

    // UI services (scoped to extension lifetime)
    container.register(
        ServiceTokens.SF_ORG_COMPARE_PROVIDER,
        SfOrgCompareProvider,
        ServiceLifetime.Singleton,
        [ServiceTokens.ENHANCED_ORG_MANAGER, ServiceTokens.FILE_COMPARE_SERVICE, ServiceTokens.ORG_CACHE_SERVICE]
    );

    // Multi-way comparison services
    container.register(
        ServiceTokens.MULTI_FILE_COMPARE_SERVICE,
        MultiFileCompareService,
        ServiceLifetime.Singleton,
        [ServiceTokens.ENHANCED_ORG_MANAGER]
    );

    // Webview services
    container.register(
        ServiceTokens.MANIFEST_CONFIGURATION_WEBVIEW,
        ManifestConfigurationWebview,
        ServiceLifetime.Singleton,
        [ServiceTokens.EXTENSION_CONTEXT, ServiceTokens.MANIFEST_MANAGER, ServiceTokens.ENHANCED_ORG_MANAGER]
    );

    container.register(
        ServiceTokens.USER_PREFERENCES_WEBVIEW,
        UserPreferencesWebview,
        ServiceLifetime.Singleton,
        [ServiceTokens.EXTENSION_CONTEXT]
    );

    container.register(
        ServiceTokens.MULTI_FILE_COMPARE_WEBVIEW,
        MultiFileCompareWebview,
        ServiceLifetime.Singleton,
        [ServiceTokens.EXTENSION_CONTEXT, ServiceTokens.MULTI_FILE_COMPARE_SERVICE]
    );
}

/**
 * Service factory for creating configured services with proper dependencies
 */
export class ServiceFactory {
    constructor(private container: Container) {}

    /**
     * Create and initialize the Enhanced Org Manager
     */
    public async createEnhancedOrgManager(): Promise<EnhancedOrgManager> {
        const orgManager = this.container.resolve<EnhancedOrgManager>(ServiceTokens.ENHANCED_ORG_MANAGER);
        
        // Initialize asynchronously
        try {
            await orgManager.initialize();
            console.log('✅ Enhanced metadata system initialized via DI');
            const configSummary = orgManager.getConfigurationSummary();
            console.log(`📊 Metadata support: ${configSummary.enabledTypes} enabled types, ${configSummary.handlerCount} handlers`);
        } catch (error) {
            console.error('❌ Failed to initialize enhanced metadata system via DI:', error);
            throw error;
        }

        return orgManager;
    }

    /**
     * Create the File Compare Service with proper cleanup initialization
     */
    public async createFileCompareService(): Promise<FileCompareService> {
        const fileCompareService = this.container.resolve<FileCompareService>(ServiceTokens.FILE_COMPARE_SERVICE);
        
        // Cleanup old sessions on startup
        try {
            await FileCompareService.cleanupOldSessions();
            console.log('✅ Old sessions cleaned up via DI');
        } catch (error) {
            console.warn('Failed to cleanup old sessions on startup via DI:', error);
        }

        return fileCompareService;
    }

    /**
     * Create the SF Org Compare Provider
     */
    public createSfOrgCompareProvider(): SfOrgCompareProvider {
        return this.container.resolve<SfOrgCompareProvider>(ServiceTokens.SF_ORG_COMPARE_PROVIDER);
    }

    /**
     * Get all core services needed for the extension
     */
    public async createCoreServices(): Promise<{
        enhancedOrgManager: EnhancedOrgManager;
        fileCompareService: FileCompareService;
        sfOrgCompareProvider: SfOrgCompareProvider;
    }> {
        const enhancedOrgManager = await this.createEnhancedOrgManager();
        const fileCompareService = await this.createFileCompareService();
        const sfOrgCompareProvider = this.createSfOrgCompareProvider();

        return {
            enhancedOrgManager,
            fileCompareService,
            sfOrgCompareProvider
        };
    }
}

/**
 * Initialize the DI container with all services
 */
export function initializeContainer(context: vscode.ExtensionContext): { container: Container; serviceFactory: ServiceFactory } {
    const container = new Container(context);
    registerServices(container);
    const serviceFactory = new ServiceFactory(container);
    
    console.log('🏗️ Dependency injection container initialized');
    console.log(`📦 Registered services: ${container.getRegisteredServices().length}`);
    
    return { container, serviceFactory };
}
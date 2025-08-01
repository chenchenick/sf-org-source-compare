import * as vscode from 'vscode';

/**
 * Service lifecycle management
 */
export enum ServiceLifetime {
    /** Single instance per container */
    Singleton = 'singleton',
    /** New instance every time */
    Transient = 'transient',
    /** Single instance per scope/context */
    Scoped = 'scoped'
}

/**
 * Service registration descriptor
 */
export interface ServiceDescriptor<T = any> {
    token: string | symbol;
    implementation?: new (...args: any[]) => T;
    factory?: (...args: any[]) => T;
    instance?: T;
    lifetime: ServiceLifetime;
    dependencies?: (string | symbol)[];
}

/**
 * Dependency injection container for managing service instantiation and lifecycle
 */
export class Container {
    private services = new Map<string | symbol, ServiceDescriptor>();
    private instances = new Map<string | symbol, any>();
    private context?: vscode.ExtensionContext;

    constructor(context?: vscode.ExtensionContext) {
        this.context = context;
        this.registerCoreServices();
    }

    /**
     * Register core VSCode services
     */
    private registerCoreServices(): void {
        if (this.context) {
            this.registerInstance('vscode.ExtensionContext', this.context);
        }
    }

    /**
     * Register a service with its implementation class
     */
    public register<T>(
        token: string | symbol,
        implementation: new (...args: any[]) => T,
        lifetime: ServiceLifetime = ServiceLifetime.Singleton,
        dependencies: (string | symbol)[] = []
    ): this {
        this.services.set(token, {
            token,
            implementation,
            lifetime,
            dependencies
        });
        return this;
    }

    /**
     * Register a service with a factory function
     */
    public registerFactory<T>(
        token: string | symbol,
        factory: (...args: any[]) => T,
        lifetime: ServiceLifetime = ServiceLifetime.Singleton,
        dependencies: (string | symbol)[] = []
    ): this {
        this.services.set(token, {
            token,
            factory,
            lifetime,
            dependencies
        });
        return this;
    }

    /**
     * Register a service instance directly
     */
    public registerInstance<T>(token: string | symbol, instance: T): this {
        this.services.set(token, {
            token,
            instance,
            lifetime: ServiceLifetime.Singleton,
            dependencies: []
        });
        this.instances.set(token, instance);
        return this;
    }

    /**
     * Resolve a service by token
     */
    public resolve<T>(token: string | symbol): T {
        const descriptor = this.services.get(token);
        if (!descriptor) {
            throw new Error(`Service '${String(token)}' is not registered`);
        }

        // Return existing instance for singletons
        if (descriptor.lifetime === ServiceLifetime.Singleton && this.instances.has(token)) {
            return this.instances.get(token);
        }

        // Create new instance
        const instance = this.createInstance(descriptor);

        // Store singleton instances
        if (descriptor.lifetime === ServiceLifetime.Singleton) {
            this.instances.set(token, instance);
        }

        return instance;
    }

    /**
     * Create instance from descriptor
     */
    private createInstance<T>(descriptor: ServiceDescriptor<T>): T {
        // Use existing instance
        if (descriptor.instance) {
            return descriptor.instance;
        }

        // Resolve dependencies
        const dependencies = descriptor.dependencies?.map(dep => this.resolve(dep)) || [];

        // Use factory function
        if (descriptor.factory) {
            return descriptor.factory(...dependencies);
        }

        // Use implementation class
        if (descriptor.implementation) {
            return new descriptor.implementation(...dependencies);
        }

        throw new Error(`Cannot create instance for service '${String(descriptor.token)}'`);
    }

    /**
     * Check if a service is registered
     */
    public isRegistered(token: string | symbol): boolean {
        return this.services.has(token);
    }

    /**
     * Get all registered service tokens
     */
    public getRegisteredServices(): (string | symbol)[] {
        return Array.from(this.services.keys());
    }

    /**
     * Clear all services and instances
     */
    public clear(): void {
        this.services.clear();
        this.instances.clear();
    }

    /**
     * Dispose of all disposable services
     */
    public async dispose(): Promise<void> {
        const disposableInstances = Array.from(this.instances.values())
            .filter(instance => instance && typeof instance.dispose === 'function');

        for (const instance of disposableInstances) {
            try {
                if (instance.dispose.constructor.name === 'AsyncFunction') {
                    await instance.dispose();
                } else {
                    instance.dispose();
                }
            } catch (error) {
                console.error('Error disposing service:', error);
            }
        }

        this.instances.clear();
    }

    /**
     * Create a child container with inherited services
     */
    public createChildContainer(): Container {
        const child = new Container(this.context);
        
        // Inherit singleton instances
        for (const [token, descriptor] of this.services.entries()) {
            if (descriptor.lifetime === ServiceLifetime.Singleton && this.instances.has(token)) {
                child.registerInstance(token, this.instances.get(token));
            } else {
                child.services.set(token, { ...descriptor });
            }
        }

        return child;
    }
}

/**
 * Service tokens for type-safe registration and resolution
 */
export const ServiceTokens = {
    // Core services
    EXTENSION_CONTEXT: 'vscode.ExtensionContext',
    
    // Application services
    ENHANCED_ORG_MANAGER: 'EnhancedOrgManager',
    FILE_COMPARE_SERVICE: 'FileCompareService',
    SF_ORG_COMPARE_PROVIDER: 'SfOrgCompareProvider',
    SOURCE_RETRIEVAL_SERVICE: 'SourceRetrievalService',
    MANIFEST_MANAGER: 'ManifestManager',
    MANIFEST_CONFIGURATION_WEBVIEW: 'ManifestConfigurationWebview',
    USER_PREFERENCES_WEBVIEW: 'UserPreferencesWebview',
    MULTI_FILE_COMPARE_WEBVIEW: 'MultiFileCompareWebview',
    MULTI_FILE_COMPARE_SERVICE: 'MultiFileCompareService',
    ORG_CACHE_SERVICE: 'OrgCacheService',
    
    // Configuration services
    CONFIGURATION_MANAGER: 'ConfigurationManager',
    
    // Security services
    SECURE_COMMAND_EXECUTOR: 'SecureCommandExecutor',
    
    // Error handling
    ERROR_HANDLER: 'ErrorHandler',
    USER_ERROR_REPORTER: 'UserErrorReporter',
    
    // Utilities
    METADATA_REGISTRY: 'MetadataRegistry',
    PARALLEL_PROCESSOR: 'ParallelProcessor',
    METADATA_CONFIGURATION: 'MetadataConfiguration',
    PROGRESS_MANAGER: 'ProgressManager'
} as const;

/**
 * Global container instance
 */
let globalContainer: Container | undefined;

/**
 * Get or create the global container
 */
export function getContainer(context?: vscode.ExtensionContext): Container {
    if (!globalContainer) {
        globalContainer = new Container(context);
    }
    return globalContainer;
}

/**
 * Reset the global container (mainly for testing)
 */
export function resetContainer(): void {
    globalContainer?.dispose();
    globalContainer = undefined;
}
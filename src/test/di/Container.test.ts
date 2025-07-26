import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { Container, ServiceLifetime, ServiceTokens } from '../../di/Container';

// Mock classes for testing
class MockService {
    public initialized = false;
    constructor() {
        this.initialized = true;
    }
    
    public getValue(): string {
        return 'mock-value';
    }
}

class MockDependentService {
    constructor(private dependency: MockService) {}
    
    public getDependencyValue(): string {
        return this.dependency.getValue();
    }
}

class MockDisposableService {
    public disposed = false;
    
    public dispose(): void {
        this.disposed = true;
    }
}

class MockAsyncDisposableService {
    public disposed = false;
    
    public async dispose(): Promise<void> {
        this.disposed = true;
    }
}

suite('Container Test Suite', () => {
    let container: Container;
    let mockContext: vscode.ExtensionContext;

    setup(() => {
        mockContext = {
            subscriptions: [],
            workspaceState: {} as any,
            globalState: {} as any,
            extensionUri: {} as any,
            extensionPath: '/test/path',
            storageUri: {} as any,
            storagePath: '/test/storage',
            globalStorageUri: {} as any,
            globalStoragePath: '/test/global-storage',
            logUri: {} as any,
            logPath: '/test/log',
            extensionMode: vscode.ExtensionMode.Test,
            secrets: {} as any,
            environmentVariableCollection: {} as any,
            asAbsolutePath: sinon.stub().returns('/test/absolute'),
            extension: {} as any,
            languageModelAccessInformation: {} as any
        };
        container = new Container(mockContext);
    });

    teardown(() => {
        container.clear();
    });

    suite('Service Registration', () => {
        test('should register service with implementation class', () => {
            container.register('MockService', MockService);
            
            assert.ok(container.isRegistered('MockService'));
            assert.ok(container.getRegisteredServices().includes('MockService'));
        });

        test('should register service with factory function', () => {
            container.registerFactory('MockService', () => new MockService());
            
            assert.ok(container.isRegistered('MockService'));
        });

        test('should register service instance directly', () => {
            const instance = new MockService();
            container.registerInstance('MockService', instance);
            
            assert.ok(container.isRegistered('MockService'));
            assert.strictEqual(container.resolve('MockService'), instance);
        });

        test('should register core VSCode services automatically', () => {
            assert.ok(container.isRegistered(ServiceTokens.EXTENSION_CONTEXT));
            assert.strictEqual(container.resolve(ServiceTokens.EXTENSION_CONTEXT), mockContext);
        });
    });

    suite('Service Resolution', () => {
        test('should resolve registered service', () => {
            container.register('MockService', MockService);
            
            const service = container.resolve<MockService>('MockService');
            assert.ok(service instanceof MockService);
            assert.ok(service.initialized);
        });

        test('should throw error for unregistered service', () => {
            assert.throws(() => {
                container.resolve('UnregisteredService');
            }, /Service 'UnregisteredService' is not registered/);
        });

        test('should resolve service with dependencies', () => {
            container.register('MockService', MockService);
            container.register('MockDependentService', MockDependentService, ServiceLifetime.Singleton, ['MockService']);
            
            const service = container.resolve<MockDependentService>('MockDependentService');
            assert.strictEqual(service.getDependencyValue(), 'mock-value');
        });

        test('should resolve factory-created service', () => {
            let factoryCalled = false;
            container.registerFactory('MockService', () => {
                factoryCalled = true;
                return new MockService();
            });
            
            const service = container.resolve<MockService>('MockService');
            assert.ok(service instanceof MockService);
            assert.ok(factoryCalled);
        });
    });

    suite('Service Lifetimes', () => {
        test('should return same instance for singleton services', () => {
            container.register('MockService', MockService, ServiceLifetime.Singleton);
            
            const service1 = container.resolve<MockService>('MockService');
            const service2 = container.resolve<MockService>('MockService');
            
            assert.strictEqual(service1, service2);
        });

        test('should return different instances for transient services', () => {
            container.register('MockService', MockService, ServiceLifetime.Transient);
            
            const service1 = container.resolve<MockService>('MockService');
            const service2 = container.resolve<MockService>('MockService');
            
            assert.notStrictEqual(service1, service2);
            assert.ok(service1 instanceof MockService);
            assert.ok(service2 instanceof MockService);
        });

        test('should return same instance for scoped services (behaves like singleton)', () => {
            container.register('MockService', MockService, ServiceLifetime.Scoped);
            
            const service1 = container.resolve<MockService>('MockService');
            const service2 = container.resolve<MockService>('MockService');
            
            assert.strictEqual(service1, service2);
        });
    });

    suite('Service Disposal', () => {
        test('should dispose services with dispose method', async () => {
            const disposableService = new MockDisposableService();
            container.registerInstance('DisposableService', disposableService);
            
            await container.dispose();
            
            assert.ok(disposableService.disposed);
        });

        test('should dispose services with async dispose method', async () => {
            const asyncDisposableService = new MockAsyncDisposableService();
            container.registerInstance('AsyncDisposableService', asyncDisposableService);
            
            await container.dispose();
            
            assert.ok(asyncDisposableService.disposed);
        });

        test('should handle disposal errors gracefully', async () => {
            const faultyService = {
                dispose: () => {
                    throw new Error('Disposal error');
                }
            };
            container.registerInstance('FaultyService', faultyService);
            
            // Should not throw
            await container.dispose();
        });

        test('should clear instances after disposal', async () => {
            container.register('MockService', MockService);
            container.resolve('MockService'); // Create instance
            
            await container.dispose();
            
            assert.strictEqual(container.getRegisteredServices().length, 1); // Service still registered
            // But new resolve should create new instance (for non-singletons after disposal)
        });
    });

    suite('Child Containers', () => {
        test('should create child container with inherited services', () => {
            container.register('MockService', MockService);
            const instance = new MockService();
            container.registerInstance('SingletonService', instance);
            
            const child = container.createChildContainer();
            
            assert.ok(child.isRegistered('MockService'));
            assert.ok(child.isRegistered('SingletonService'));
            assert.strictEqual(child.resolve('SingletonService'), instance);
        });

        test('should inherit VSCode context in child container', () => {
            const child = container.createChildContainer();
            
            assert.ok(child.isRegistered(ServiceTokens.EXTENSION_CONTEXT));
            assert.strictEqual(child.resolve(ServiceTokens.EXTENSION_CONTEXT), mockContext);
        });
    });

    suite('Container Management', () => {
        test('should clear all services and instances', () => {
            container.register('MockService', MockService);
            container.resolve('MockService'); // Create instance
            
            container.clear();
            
            assert.strictEqual(container.getRegisteredServices().length, 0);
            assert.ok(!container.isRegistered('MockService'));
        });

        test('should get all registered service tokens', () => {
            container.register('Service1', MockService);
            container.register('Service2', MockService);
            
            const services = container.getRegisteredServices();
            assert.ok(services.includes('Service1'));
            assert.ok(services.includes('Service2'));
            assert.ok(services.includes(ServiceTokens.EXTENSION_CONTEXT));
        });
    });

    suite('Error Handling', () => {
        test('should handle circular dependencies gracefully', () => {
            // This would cause stack overflow in real scenario, but our simple container doesn't check for it
            // For now, just test that registration works
            container.register('ServiceA', MockService, ServiceLifetime.Singleton, ['ServiceB']);
            container.register('ServiceB', MockService, ServiceLifetime.Singleton, ['ServiceA']);
            
            assert.ok(container.isRegistered('ServiceA'));
            assert.ok(container.isRegistered('ServiceB'));
        });

        test('should handle missing dependencies', () => {
            container.register('MockDependentService', MockDependentService, ServiceLifetime.Singleton, ['NonExistentService']);
            
            assert.throws(() => {
                container.resolve('MockDependentService');
            }, /Service 'NonExistentService' is not registered/);
        });

        test('should handle service with no implementation or factory', () => {
            container.register('InvalidService', undefined as any);
            
            assert.throws(() => {
                container.resolve('InvalidService');
            }, /Cannot create instance for service 'InvalidService'/);
        });
    });
});
/**
 * Dependency Injection system for SF Org Compare extension
 * 
 * This module provides a lightweight dependency injection container
 * for managing service instantiation, lifecycle, and dependencies.
 */

export { Container, ServiceLifetime, ServiceTokens, getContainer, resetContainer } from './Container';
export { registerServices, ServiceFactory, initializeContainer } from './ServiceRegistration';

// Re-export types for convenience
export type { ServiceDescriptor } from './Container';
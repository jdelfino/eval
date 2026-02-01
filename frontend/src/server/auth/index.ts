/**
 * Authentication module exports.
 * Provides convenient access to auth types, interfaces, and implementations.
 */

// Types
export * from './types';

// Interfaces
export * from './interfaces';

// Implementations
export { InMemoryUserRepository } from './local';
export { RBACService } from './rbac';

// Permissions
export * from './permissions';

// Instance
export { getAuthProvider, getUserRepository, getNamespaceRepository } from './instance';

// API helpers (including AuthContext type)
export type { AuthContext } from './api-helpers';

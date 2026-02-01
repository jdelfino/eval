/**
 * Public API for persistence layer
 *
 * This module provides a simple factory function to create storage backends
 * and exposes all necessary types and interfaces.
 */

import {
  SupabaseUserRepository,
  SupabaseSessionRepository,
  SupabaseRevisionRepository,
  SupabaseProblemRepository,
  SupabaseClassRepository,
  SupabaseSectionRepository,
  SupabaseMembershipRepository,
  SupabaseNamespaceRepository,
  SupabaseInvitationRepository,
} from './supabase';
import {
  ISessionRepository,
  IRevisionRepository,
  IUserRepository,
  IProblemRepository,
  IStorageRepository,
} from './interfaces';
import type { IClassRepository, ISectionRepository, IMembershipRepository } from '../classes/interfaces';
import type { INamespaceRepository } from '../auth/interfaces';
import type { IInvitationRepository } from '../invitations/interfaces';
// StorageConfig type available from './types'

/**
 * Supabase storage backend implementation
 *
 * Uses Supabase repositories for all data persistence operations.
 * All repositories use RLS-backed access control via the provided accessToken.
 */
export class StorageBackend implements IStorageRepository {
  public readonly sessions: ISessionRepository;
  public readonly revisions: IRevisionRepository;
  public readonly users: IUserRepository;
  public readonly problems: IProblemRepository;
  public readonly classes: IClassRepository;
  public readonly sections: ISectionRepository;
  public readonly memberships: IMembershipRepository;

  constructor(accessToken: string) {
    // Create Supabase repository instances with RLS-backed access control
    this.sessions = new SupabaseSessionRepository(accessToken);
    this.revisions = new SupabaseRevisionRepository(accessToken);
    this.users = new SupabaseUserRepository(accessToken);
    this.problems = new SupabaseProblemRepository(accessToken);
    this.classes = new SupabaseClassRepository(accessToken);
    this.sections = new SupabaseSectionRepository(accessToken);
    this.memberships = new SupabaseMembershipRepository(accessToken);
  }

  async initialize(): Promise<void> {
    // Initialize all repositories with optional lifecycle methods
    const optionalInits: Promise<void>[] = [];
    if (this.sessions.initialize) {
      optionalInits.push(this.sessions.initialize());
    }
    if (this.revisions.initialize) {
      optionalInits.push(this.revisions.initialize());
    }
    if (this.problems.initialize) {
      optionalInits.push(this.problems.initialize());
    }
    if (this.users.initialize) {
      optionalInits.push(this.users.initialize());
    }
    if (this.classes.initialize) {
      optionalInits.push(this.classes.initialize());
    }
    if (this.sections.initialize) {
      optionalInits.push(this.sections.initialize());
    }
    if (this.memberships.initialize) {
      optionalInits.push(this.memberships.initialize());
    }

    await Promise.all(optionalInits);
  }

  async shutdown(): Promise<void> {
    const shutdowns: Promise<void>[] = [];

    // All lifecycle methods are optional
    if (this.sessions.shutdown) {
      shutdowns.push(this.sessions.shutdown());
    }
    if (this.revisions.shutdown) {
      shutdowns.push(this.revisions.shutdown());
    }
    if (this.problems.shutdown) {
      shutdowns.push(this.problems.shutdown());
    }
    if (this.users.shutdown) {
      shutdowns.push(this.users.shutdown());
    }
    if (this.classes.shutdown) {
      shutdowns.push(this.classes.shutdown());
    }
    if (this.sections.shutdown) {
      shutdowns.push(this.sections.shutdown());
    }
    if (this.memberships.shutdown) {
      shutdowns.push(this.memberships.shutdown());
    }

    await Promise.all(shutdowns);
  }

  async health(): Promise<boolean> {
    const healthChecks: Promise<boolean>[] = [];

    // All lifecycle methods are optional - if not implemented, assume healthy
    if (this.sessions.health) {
      healthChecks.push(this.sessions.health());
    }
    if (this.revisions.health) {
      healthChecks.push(this.revisions.health());
    }
    if (this.problems.health) {
      healthChecks.push(this.problems.health());
    }
    if (this.users.health) {
      healthChecks.push(this.users.health());
    }
    if (this.classes.health) {
      healthChecks.push(this.classes.health());
    }
    if (this.sections.health) {
      healthChecks.push(this.sections.health());
    }
    if (this.memberships.health) {
      healthChecks.push(this.memberships.health());
    }

    // If no health checks are implemented, assume healthy
    if (healthChecks.length === 0) {
      return true;
    }

    const results = await Promise.all(healthChecks);
    // All repositories must be healthy
    return results.every(r => r);
  }

  async transaction<T>(fn: (tx: import('./interfaces').TransactionContext) => Promise<T>): Promise<T> {
    // TODO: Implement real Supabase transactions using .rpc() or manual BEGIN/COMMIT
    // For now, execute directly (same as local storage)
    const context: import('./interfaces').TransactionContext = {
      sessions: this.sessions,
      revisions: this.revisions,
      problems: this.problems,
      users: this.users,
      classes: this.classes,
      sections: this.sections,
      memberships: this.memberships,
    };
    return fn(context);
  }
}

/**
 * Factory function to create and initialize a storage backend
 *
 * @param accessToken - JWT access token for RLS policies (required)
 * @returns Initialized storage backend with RLS-backed access control
 *
 * @example
 * ```typescript
 * const storage = await createStorage(auth.accessToken);
 *
 * // Use storage
 * const session = await storage.sessions.getSession('session-123');
 *
 * // Clean up when done
 * await storage.shutdown();
 * ```
 */
export async function createStorage(accessToken: string): Promise<IStorageRepository> {
  const storage = new StorageBackend(accessToken);
  await storage.initialize();
  return storage;
}

// ============================================================================
// Individual Repository Factory Functions
// ============================================================================
// These provide direct access to specific repositories without the full
// StorageBackend. Prefer these for most API routes.

/**
 * Get session repository with RLS-backed access control.
 * @param accessToken - JWT access token for RLS policies (required)
 */
export function getSessionRepository(accessToken: string): ISessionRepository {
  return new SupabaseSessionRepository(accessToken);
}

/**
 * Get revision repository with RLS-backed access control.
 * @param accessToken - JWT access token for RLS policies (required)
 */
export function getRevisionRepository(accessToken: string): IRevisionRepository {
  return new SupabaseRevisionRepository(accessToken);
}

/**
 * Get user repository with RLS-backed access control.
 * @param accessToken - JWT access token for RLS policies (required)
 */
export function getUserRepository(accessToken: string): IUserRepository {
  return new SupabaseUserRepository(accessToken);
}

/**
 * Get problem repository with RLS-backed access control.
 * @param accessToken - JWT access token for RLS policies (required)
 */
export function getProblemRepository(accessToken: string): IProblemRepository {
  return new SupabaseProblemRepository(accessToken);
}

/**
 * Get namespace repository with RLS-backed access control.
 * @param accessToken - JWT access token for RLS policies (required)
 */
export function getNamespaceRepository(accessToken: string): INamespaceRepository {
  return new SupabaseNamespaceRepository(accessToken);
}

/**
 * Get invitation repository with RLS-backed access control.
 * @param accessToken - JWT access token for RLS policies (required)
 */
export function getInvitationRepository(accessToken: string): IInvitationRepository {
  return new SupabaseInvitationRepository(accessToken);
}

// Re-export all types and interfaces for convenience
export * from './types';
export * from './interfaces';

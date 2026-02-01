/**
 * Role-Based Access Control (RBAC) service.
 * Handles authorization and permission checking for users.
 */

import { User, AuthorizationError } from './types';
import { IRBACService } from './interfaces';
import { ROLE_PERMISSIONS } from './permissions';

/**
 * RBAC service for checking user permissions and access control.
 *
 * Note: For session access checks, we need a way to query session data.
 * This will be injected when we integrate with the session manager.
 */
export class RBACService implements IRBACService {
  private sessionRepository?: any; // Will be properly typed when session persistence is implemented

  constructor(sessionRepository?: any) {
    this.sessionRepository = sessionRepository;
  }

  /**
   * Check if a user has a specific permission.
   */
  hasPermission(user: User, permission: string): boolean {
    const rolePermissions = ROLE_PERMISSIONS[user.role];
    // Type-safe check: permission is a string, rolePermissions is Permission[]
    // This works because TypeScript's structural typing allows string[] to accept string
    return rolePermissions.some(p => p === permission);
  }

  /**
   * Check if a user can access a specific coding session.
   * System admins, namespace admins, and instructors can access all sessions.
   * Students can only access sessions they're enrolled in.
   */
  async canAccessSession(user: User, sessionId: string): Promise<boolean> {
    // System admins, namespace admins, and instructors can access any session
    if (user.role === 'system-admin' || user.role === 'namespace-admin' || user.role === 'instructor') {
      return true;
    }

    // Students can only access sessions they're in
    // SECURITY: Fail closed - deny access when session repository is not configured
    if (!this.sessionRepository) {
      console.warn('[RBAC] Session repository not configured, denying student access');
      return false;
    }

    try {
      const session = await this.sessionRepository.getSession(sessionId);
      if (!session) {
        return false;
      }

      // Check if student is in the session
      return session.students?.some((s: any) => s.id === user.id) ?? false;
    } catch (error) {
      console.error('[RBAC] Error checking session access:', error);
      return false;
    }
  }

  /**
   * Check if a user can manage (modify/delete) another user.
   * System admins can manage anyone including other system admins.
   * Namespace admins can manage users within their namespace (instructors and students).
   * Instructors can manage students within their namespace.
   * Students cannot manage anyone.
   */
  canManageUser(actor: User, target: User): boolean {
    // System admins can manage anyone
    if (actor.role === 'system-admin') {
      return true;
    }

    // Namespace admins can manage instructors and students (but not system admins or other namespace admins)
    // CRITICAL: Must check namespace boundary
    if (actor.role === 'namespace-admin') {
      if (target.role !== 'instructor' && target.role !== 'student') {
        return false;
      }
      return actor.namespaceId === target.namespaceId;
    }

    // Instructors can only manage students within their namespace
    // CRITICAL: Must check namespace boundary
    if (actor.role === 'instructor') {
      if (target.role !== 'student') {
        return false;
      }
      return actor.namespaceId === target.namespaceId;
    }

    // Students cannot manage anyone
    return false;
  }

  /**
   * Get all permissions for a given role.
   */
  getRolePermissions(role: User['role']): string[] {
    return ROLE_PERMISSIONS[role];
  }

  /**
   * Assert that a user has a permission, throwing if not.
   */
  assertPermission(user: User, permission: string): void {
    if (!this.hasPermission(user, permission)) {
      throw new AuthorizationError(
        `User ${user.email} (${user.role}) lacks permission: ${permission}`
      );
    }
  }

  /**
   * Assert that a user can access a session, throwing if not.
   */
  async assertCanAccessSession(user: User, sessionId: string): Promise<void> {
    const canAccess = await this.canAccessSession(user, sessionId);
    if (!canAccess) {
      throw new AuthorizationError(
        `User ${user.email} cannot access session: ${sessionId}`
      );
    }
  }

  /**
   * Assert that a user can manage another user, throwing if not.
   */
  assertCanManageUser(actor: User, target: User): void {
    if (!this.canManageUser(actor, target)) {
      throw new AuthorizationError(
        `User ${actor.email} (${actor.role}) cannot manage user ${target.email}`
      );
    }
  }
}

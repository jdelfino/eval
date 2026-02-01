/**
 * Capacity service for managing namespace user limits
 *
 * Handles checking and enforcing capacity limits for namespaces.
 * Pending invitations count against the limit to prevent over-capacity
 * states when users accept their invitations.
 */

import { NamespaceCapacityUsage } from '../auth/types';
import { INamespaceRepository } from '../auth/interfaces';
import { IInvitationRepository } from './interfaces';
import { InvitationError, InvitableRole } from './types';

/**
 * Extended capacity usage including pending invitations
 */
export interface CapacityUsageWithPending extends NamespaceCapacityUsage {
  /** Number of pending instructor invitations */
  pendingInstructorInvitations: number;
  /** Number of pending namespace-admin invitations (count as instructors for capacity) */
  pendingNamespaceAdminInvitations: number;
  /** Effective instructor count (current + pending) */
  effectiveInstructorCount: number;
}

/**
 * Service for checking and enforcing namespace capacity limits
 */
export class CapacityService {
  constructor(
    private namespaceRepository: INamespaceRepository,
    private invitationRepository: IInvitationRepository
  ) {}

  /**
   * Get capacity usage for a namespace, including pending invitations
   *
   * @param namespaceId - The namespace ID
   * @returns Capacity usage info with pending counts, or null if namespace not found
   */
  async getCapacityUsage(namespaceId: string): Promise<CapacityUsageWithPending | null> {
    const baseUsage = await this.namespaceRepository.getCapacityUsage(namespaceId);

    if (!baseUsage) {
      return null;
    }

    // Count pending invitations by role
    const [pendingInstructorInvitations, pendingNamespaceAdminInvitations] = await Promise.all([
      this.invitationRepository.countPendingInvitations(namespaceId, 'instructor'),
      this.invitationRepository.countPendingInvitations(namespaceId, 'namespace-admin'),
    ]);

    // Namespace admins and instructors both count against the instructor limit
    const effectiveInstructorCount =
      baseUsage.instructorCount + pendingInstructorInvitations + pendingNamespaceAdminInvitations;

    return {
      ...baseUsage,
      pendingInstructorInvitations,
      pendingNamespaceAdminInvitations,
      effectiveInstructorCount,
    };
  }

  /**
   * Check if a user with the given role can be added to the namespace
   *
   * Considers both current users and pending invitations when checking capacity.
   * Students are checked against maxStudents, while instructors and namespace-admins
   * are checked against maxInstructors.
   *
   * @param namespaceId - The namespace ID
   * @param role - The role to check ('instructor', 'namespace-admin', or 'student')
   * @returns True if capacity allows adding the user, false otherwise
   * @throws Error if namespace not found
   */
  async canAddUser(namespaceId: string, role: InvitableRole | 'student'): Promise<boolean> {
    const usage = await this.getCapacityUsage(namespaceId);

    if (!usage) {
      throw new Error(`Namespace not found: ${namespaceId}`);
    }

    if (role === 'student') {
      // Students check against maxStudents
      if (usage.maxStudents === null) {
        return true; // Unlimited
      }
      return usage.studentCount < usage.maxStudents;
    }

    // Instructors and namespace-admins check against maxInstructors
    if (usage.maxInstructors === null) {
      return true; // Unlimited
    }

    return usage.effectiveInstructorCount < usage.maxInstructors;
  }

  /**
   * Enforce capacity limits for a namespace
   *
   * Throws an InvitationError if the namespace is at capacity for the given role.
   * Use this before creating invitations or registering users.
   *
   * @param namespaceId - The namespace ID
   * @param role - The role to check ('instructor', 'namespace-admin', or 'student')
   * @throws InvitationError with code NAMESPACE_AT_CAPACITY if at limit
   * @throws Error if namespace not found
   */
  async enforceCapacity(namespaceId: string, role: InvitableRole | 'student'): Promise<void> {
    const canAdd = await this.canAddUser(namespaceId, role);

    if (!canAdd) {
      const usage = await this.getCapacityUsage(namespaceId);
      const roleDisplay = role === 'student' ? 'students' : 'instructors';
      const limit = role === 'student' ? usage?.maxStudents : usage?.maxInstructors;
      const current = role === 'student' ? usage?.studentCount : usage?.effectiveInstructorCount;

      throw new InvitationError(
        `Namespace is at capacity for ${roleDisplay} (${current}/${limit})`,
        'NAMESPACE_AT_CAPACITY'
      );
    }
  }
}

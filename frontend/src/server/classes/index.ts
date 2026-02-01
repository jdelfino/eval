/**
 * Classes module - Multi-tenancy organizational structure
 * 
 * Provides data models and repository interfaces for organizing users
 * into classes and sections. Enables instructors to manage multiple
 * course sections and students to enroll via join codes.
 * 
 * @module server/classes
 */

// Export all types
export type {
  Class,
  Section,
  SectionMembership,
  SectionWithClass,
  SectionStats,
  SectionFilters,
} from './types';

// Export all interfaces
export type {
  IClassRepository,
  ISectionRepository,
  IMembershipRepository,
  IJoinCodeService,
} from './interfaces';

// Export implementations
export { ClassRepository } from './local';
export { SectionRepository } from './local';
export { MembershipRepository } from './local';
export { generateJoinCode, isValidJoinCodeFormat } from './join-code-service';

// Factory functions for RLS-backed repositories
import type { IClassRepository, ISectionRepository, IMembershipRepository } from './interfaces';
import {
  SupabaseClassRepository,
  SupabaseSectionRepository,
  SupabaseMembershipRepository,
} from '../persistence/supabase';

/**
 * Get class repository with RLS-backed access control.
 *
 * @param accessToken - JWT access token for RLS policies (required)
 */
export function getClassRepository(accessToken: string): IClassRepository {
  return new SupabaseClassRepository(accessToken);
}

/**
 * Get section repository with RLS-backed access control.
 *
 * @param accessToken - JWT access token for RLS policies (required)
 */
export function getSectionRepository(accessToken: string): ISectionRepository {
  return new SupabaseSectionRepository(accessToken);
}

/**
 * Get membership repository with RLS-backed access control.
 *
 * @param accessToken - JWT access token for RLS policies (required)
 */
export function getMembershipRepository(accessToken: string): IMembershipRepository {
  return new SupabaseMembershipRepository(accessToken);
}

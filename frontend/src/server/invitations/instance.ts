/**
 * Factory functions for invitation-related services.
 *
 * These services are created per-request with accessToken for RLS-backed
 * access control. Some admin operations use getSupabaseClient() for
 * service_role access.
 */

import { InvitationService } from './invitation-service';
import { CapacityService } from './capacity-service';
import { StudentRegistrationService } from './student-registration-service';
import { IInvitationRepository } from './interfaces';
import { SupabaseInvitationRepository } from '../persistence/supabase/invitation-repository';
import { SupabaseNamespaceRepository } from '../persistence/supabase/namespace-repository';
import { SupabaseSectionRepository } from '../persistence/supabase/section-repository';
import { SupabaseMembershipRepository } from '../persistence/supabase/membership-repository';
import { getAuthProvider } from '../auth';
import { getSupabaseClient, SERVICE_ROLE_MARKER } from '../supabase/client';

/**
 * Get invitation repository with RLS-backed access control.
 * @param accessToken - JWT access token for RLS policies (required)
 */
export function getInvitationRepository(accessToken: string): IInvitationRepository {
  return new SupabaseInvitationRepository(accessToken);
}

/**
 * Get capacity service with RLS-backed access control.
 * @param accessToken - JWT access token for RLS policies (required)
 */
export function getCapacityService(accessToken: string): CapacityService {
  const namespaceRepository = new SupabaseNamespaceRepository(accessToken);
  const invitationRepository = new SupabaseInvitationRepository(accessToken);
  return new CapacityService(namespaceRepository, invitationRepository);
}

/**
 * Get invitation service with RLS-backed access control.
 * @param accessToken - JWT access token for RLS policies (required)
 */
export function getInvitationService(accessToken: string): InvitationService {
  const invitationRepository = new SupabaseInvitationRepository(accessToken);
  const capacityService = getCapacityService(accessToken);
  const supabaseAdmin = getSupabaseClient(); // Admin operations use service_role
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  return new InvitationService(
    invitationRepository,
    capacityService,
    supabaseAdmin,
    appUrl
  );
}

/**
 * Get student registration service.
 *
 * This service handles public student registration which always uses service_role
 * because the user doesn't exist yet and creating users requires admin privileges.
 */
export async function getStudentRegistrationService(): Promise<StudentRegistrationService> {
  // Use existing Supabase repositories with service_role
  // Student registration is a special case that requires admin access:
  // 1. The user doesn't exist yet during registration
  // 2. Creating users/memberships requires admin privileges
  // 3. RLS can't apply because there's no authenticated user
  //
  // We reuse the regular Supabase repositories by passing a "service" marker
  // that tells getSupabaseClientWithAuth to use service_role
  const sectionRepository = new SupabaseSectionRepository(SERVICE_ROLE_MARKER);
  const namespaceRepository = new SupabaseNamespaceRepository(SERVICE_ROLE_MARKER);
  const membershipRepository = new SupabaseMembershipRepository(SERVICE_ROLE_MARKER);

  // Capacity service also uses service_role for registration
  const capacityServiceNamespaceRepo = new SupabaseNamespaceRepository(SERVICE_ROLE_MARKER);
  const capacityServiceInvitationRepo = new SupabaseInvitationRepository(SERVICE_ROLE_MARKER);
  const capacityService = new CapacityService(capacityServiceNamespaceRepo, capacityServiceInvitationRepo);

  const authProvider = await getAuthProvider();

  return new StudentRegistrationService(
    sectionRepository,
    namespaceRepository,
    capacityService,
    authProvider,
    membershipRepository
  );
}

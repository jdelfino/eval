/**
 * Typed API client functions for registration flows.
 *
 * GET endpoints are public (no auth required) -- users hit these before having an account.
 * POST endpoints require authentication (Firebase JWT) -- users create a Firebase account first.
 */

import { publicGet } from '@/lib/public-api-client';
import { apiPost } from '@/lib/api-client';
import type { User, InvitationDetails, RegisterStudentInfo } from '@/types/api';

/**
 * Validate an invitation token and return invitation details.
 * Public (no auth required).
 */
export async function getInvitationDetails(token: string): Promise<InvitationDetails> {
  return publicGet<InvitationDetails>(`/auth/accept-invite?token=${encodeURIComponent(token)}`);
}

/**
 * Accept an invitation and create a user profile.
 * Requires Firebase JWT (call after creating Firebase account).
 * Returns the created User.
 */
export async function acceptInvite(token: string, displayName?: string): Promise<User> {
  return apiPost<User>('/auth/accept-invite', {
    token,
    display_name: displayName || undefined,
  });
}

/**
 * Validate a join code and return section/class info.
 * Public (no auth required).
 */
export async function getStudentRegistrationInfo(code: string): Promise<RegisterStudentInfo> {
  return publicGet<RegisterStudentInfo>(`/auth/register-student?code=${encodeURIComponent(code)}`);
}

/**
 * Register a student and enroll them in a section.
 * Requires Firebase JWT (call after creating Firebase account).
 * Returns the created User.
 */
export async function registerStudent(joinCode: string, displayName?: string): Promise<User> {
  return apiPost<User>('/auth/register-student', {
    join_code: joinCode,
    display_name: displayName || undefined,
  });
}

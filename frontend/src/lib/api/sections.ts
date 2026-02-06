/**
 * Typed API client functions for student-facing section operations.
 *
 * These functions wrap the generic api-client methods and provide
 * clean, typed interfaces. The backend returns plain objects/arrays
 * (not wrapped), so these functions return the response directly.
 */

import { apiGet, apiPost, apiDelete } from '@/lib/api-client';
import type { MySectionInfo, SectionMembership, Session } from '@/types/api';

/**
 * List all sections the current user is enrolled in (as student or instructor).
 * @returns Array of MySectionInfo objects (backend returns plain array)
 */
export async function listMySections(): Promise<MySectionInfo[]> {
  return apiGet<MySectionInfo[]>('/sections/my');
}

/**
 * Join a section using its join code.
 * @param joinCode - The section's join code
 * @returns The created SectionMembership object (backend returns plain object)
 */
export async function joinSection(joinCode: string): Promise<SectionMembership> {
  return apiPost<SectionMembership>('/sections/join', { join_code: joinCode });
}

/**
 * Leave a section.
 * @param sectionId - The section ID to leave
 */
export async function leaveSection(sectionId: string): Promise<void> {
  await apiDelete(`/sections/${sectionId}/leave`);
}

/**
 * Get all sessions for a section.
 * @param sectionId - The section ID
 * @returns Array of Session objects (backend returns plain array)
 */
export async function getActiveSessions(sectionId: string): Promise<Session[]> {
  return apiGet<Session[]>(`/sections/${sectionId}/sessions`);
}

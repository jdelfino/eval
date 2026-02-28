/**
 * Typed API client functions for preview mode.
 */

import { apiPost, apiFetch } from '@/lib/api-client';

export interface PreviewResponse {
  preview_user_id: string;
  section_id: string;
}

/**
 * Enter preview mode for a section.
 * Creates a preview student if needed, enrolls them in the section.
 * Must be called BEFORE setPreviewSectionId so the request goes through without the preview header.
 *
 * @param sectionId - The section ID to preview as a student
 * @returns Preview response containing preview_user_id and section_id
 */
export async function enterPreview(sectionId: string): Promise<PreviewResponse> {
  return apiPost<PreviewResponse>(`/api/v1/sections/${sectionId}/preview`);
}

/**
 * Exit preview mode for a section.
 * Unenrolls the preview student from the section (best-effort).
 * Must be called AFTER setPreviewSectionId(null) so the request goes through without the preview header.
 *
 * @param sectionId - The section ID to exit preview for
 */
export async function exitPreview(sectionId: string): Promise<void> {
  await apiFetch(`/api/v1/sections/${sectionId}/preview`, { method: 'DELETE' });
}

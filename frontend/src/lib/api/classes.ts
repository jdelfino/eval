/**
 * Typed API client functions for class and section management.
 *
 * These functions wrap the generic api-client methods and provide
 * clean, typed interfaces. The backend returns plain objects/arrays
 * (not wrapped), so these functions return the response directly.
 */

import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client';
import type { Class, Section, User } from '@/types/api';

/**
 * Response structure for getClass endpoint.
 */
export interface ClassDetailsResponse {
  class: Class;
  sections: Section[];
  instructorNames: Record<string, string>;
  sectionInstructors: Record<string, string[]>;
}

/**
 * Get a single class with its sections and instructor names.
 * @param id - The class ID
 * @returns ClassDetailsResponse containing class, sections, and instructorNames
 */
export async function getClass(id: string): Promise<ClassDetailsResponse> {
  return apiGet<ClassDetailsResponse>(`/classes/${id}`);
}

/**
 * List all classes accessible to the current user.
 * @returns Array of Class objects (backend returns plain array)
 */
export async function listClasses(): Promise<Class[]> {
  return apiGet<Class[]>('/classes');
}

/**
 * Create a new class.
 * @param name - The class name
 * @param description - Optional class description
 * @returns The created Class object (backend returns plain object)
 */
export async function createClass(name: string, description?: string): Promise<Class> {
  return apiPost<Class>('/classes', { name, description });
}

/**
 * Update an existing class.
 * @param id - The class ID to update
 * @param updates - Partial class fields to update
 * @returns The updated Class object (backend returns plain object)
 */
export async function updateClass(id: string, updates: Partial<Class>): Promise<Class> {
  return apiPatch<Class>(`/classes/${id}`, updates);
}

/**
 * Delete a class.
 * @param id - The class ID to delete
 */
export async function deleteClass(id: string): Promise<void> {
  await apiDelete(`/classes/${id}`);
}

/**
 * Options for creating a section.
 */
export interface CreateSectionOptions {
  name: string;
  semester?: string;
  schedule?: string;
  location?: string;
  capacity?: number;
}

/**
 * Create a new section within a class.
 * @param classId - The parent class ID
 * @param options - Section creation options (name required, others optional)
 * @returns The created Section object (backend returns plain object)
 */
export async function createSection(classId: string, options: CreateSectionOptions): Promise<Section> {
  return apiPost<Section>(`/classes/${classId}/sections`, options);
}

/**
 * Update an existing section.
 * @param sectionId - The section ID to update
 * @param updates - Partial section fields to update
 * @returns The updated Section object (backend returns plain object)
 */
export async function updateSection(sectionId: string, updates: Partial<Section>): Promise<Section> {
  return apiPatch<Section>(`/sections/${sectionId}`, updates);
}

/**
 * Regenerate the join code for a section.
 * @param sectionId - The section ID
 * @returns The Section object with the new join code (backend returns plain object)
 */
export async function regenerateJoinCode(sectionId: string): Promise<Section> {
  return apiPost<Section>(`/sections/${sectionId}/regenerate-code`);
}

/**
 * Add a co-instructor to a section by email.
 * @param sectionId - The section ID
 * @param email - The email of the instructor to add
 */
export async function addCoInstructor(sectionId: string, email: string): Promise<void> {
  await apiPost(`/sections/${sectionId}/instructors`, { email });
}

/**
 * Remove a co-instructor from a section.
 * @param sectionId - The section ID
 * @param userId - The user ID of the instructor to remove
 */
export async function removeCoInstructor(sectionId: string, userId: string): Promise<void> {
  await apiDelete(`/sections/${sectionId}/instructors/${userId}`);
}

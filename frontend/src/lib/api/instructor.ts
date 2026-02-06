/**
 * Typed API client functions for instructor-specific operations.
 *
 * These functions wrap the generic api-client methods and provide
 * clean, typed interfaces.
 */

import { apiGet } from '@/lib/api-client';
import type { Class, Section, Session } from '@/types/api';

/**
 * Dashboard response with recent classes, sections, and sessions.
 */
export interface InstructorDashboard {
  classes: Class[];
  sections: Section[];
  sessions: Session[];
}

/**
 * Get the instructor dashboard data.
 * @returns InstructorDashboard object with classes, sections, and sessions
 */
export async function getInstructorDashboard(): Promise<InstructorDashboard> {
  return apiGet<InstructorDashboard>('/instructor/dashboard');
}

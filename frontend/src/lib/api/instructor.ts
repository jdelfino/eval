/**
 * Typed API client functions for instructor-specific operations.
 *
 * These functions wrap the generic api-client methods and provide
 * clean, typed interfaces.
 */

import { apiGet } from '@/lib/api-client';

/**
 * Section summary within the instructor dashboard.
 */
export interface DashboardSection {
  id: string;
  name: string;
  join_code: string;
  semester?: string;
  studentCount: number;
  /**
   * G4 (T13) section pointer (sections.current_session_id), or absent/null.
   * A non-null value is the section's "current problem" / rejoin target. The
   * pointer alone does NOT mean "live now" — that additionally requires
   * `lastActivity` to be within the 60-min liveness window (no server-side
   * presence exists).
   */
  currentSessionId?: string;
  /**
   * The current pointer session's last_activity timestamp (ISO 8601), or
   * absent/null when the pointer is unset. Used for the 60-min "Live now"
   * liveness heuristic on the instructor home strip.
   */
  lastActivity?: string;
}

/**
 * Class summary within the instructor dashboard.
 */
export interface DashboardClass {
  id: string;
  name: string;
  sections: DashboardSection[];
}

/**
 * Dashboard response with classes containing nested sections.
 */
export interface InstructorDashboard {
  classes: DashboardClass[];
}

/**
 * Get the instructor dashboard data.
 * @returns InstructorDashboard object with classes and their sections
 */
export async function getInstructorDashboard(): Promise<InstructorDashboard> {
  return apiGet<InstructorDashboard>('/instructor/dashboard');
}

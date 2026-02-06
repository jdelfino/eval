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
  activeSessionId?: string;
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

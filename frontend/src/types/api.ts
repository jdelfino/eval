/**
 * Client-side TypeScript types matching Go backend API response shapes.
 *
 * Field names match the JSON serialization from the Go structs:
 * - User has NO json tags in Go, so fields are PascalCase.
 * - All other types use snake_case json tags.
 */

// ---------------------------------------------------------------------------
// Enums / union types
// ---------------------------------------------------------------------------

export type UserRole = 'system-admin' | 'namespace-admin' | 'instructor' | 'student';

export type SessionStatus = 'active' | 'completed';

export type MembershipRole = 'instructor' | 'student';

// ---------------------------------------------------------------------------
// API error — re-exported from lib/api-error for convenience
// ---------------------------------------------------------------------------

export { ApiError } from '@/lib/api-error';

// ---------------------------------------------------------------------------
// Domain types — field names match JSON keys from the Go backend
// ---------------------------------------------------------------------------

/** User — matches Go store.User JSON tags (snake_case). */
export interface User {
  id: string;
  external_id: string | null;
  email: string;
  role: UserRole;
  namespace_id: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Namespace {
  id: string;
  display_name: string;
  active: boolean;
  max_instructors: number | null;
  max_students: number | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export interface Class {
  id: string;
  namespace_id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Section {
  id: string;
  namespace_id: string;
  class_id: string;
  name: string;
  semester: string | null;
  join_code: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Problem {
  id: string;
  namespace_id: string;
  title: string;
  description: string | null;
  starter_code: string | null;
  test_cases: import('./problem').TestCase[] | null;
  execution_settings: import('./problem').ExecutionSettings | null;
  author_id: string;
  class_id: string | null;
  tags: string[];
  solution: string | null;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  namespace_id: string;
  section_id: string;
  section_name: string;
  problem: Problem | null;
  featured_student_id: string | null;
  featured_code: string | null;
  featured_execution_settings?: unknown;
  creator_id: string;
  participants: string[];
  status: SessionStatus;
  created_at: string;
  last_activity: string;
  ended_at: string | null;
}

export interface SessionStudent {
  id: string;
  session_id: string;
  user_id: string;
  name: string;
  code: string;
  execution_settings: unknown;
  joined_at: string;
}

export interface SectionMembership {
  id: string;
  user_id: string;
  section_id: string;
  role: MembershipRole;
  joined_at: string;
}

export interface Revision {
  id: string;
  namespace_id: string;
  session_id: string;
  user_id: string;
  timestamp: string;
  is_diff: boolean;
  diff: string | null;
  full_code: string | null;
  base_revision_id: string | null;
  execution_result: unknown;
}

// ---------------------------------------------------------------------------
// Composite response types
// ---------------------------------------------------------------------------

/**
 * MySectionInfo — matches Go MySectionInfo struct.
 * Returns section with class name for student-facing section list.
 */
export interface MySectionInfo {
  section: Section;
  class_name: string;
}

export interface SessionState {
  session: Session;
  students: SessionStudent[];
  join_code: string;
}

/** Subset of Problem fields exposed by the public-state endpoint. */
export interface SessionPublicProblem {
  title: string;
  description: string | null;
  starter_code: string | null;
}

export interface SessionPublicState {
  problem: SessionPublicProblem | null;
  featured_student_id: string | null;
  featured_code: string | null;
  featured_execution_settings?: unknown;
  join_code: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Registration / invitation types
// ---------------------------------------------------------------------------

/** Invitation details returned by GET /auth/accept-invite. Matches store.SerializedInvitation. */
export interface InvitationDetails {
  id: string;
  email: string;
  target_role: 'namespace-admin' | 'instructor';
  namespace_id: string;
  status: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
  consumed_by: string | null;
  revoked_at: string | null;
}

/** Response from GET /auth/register-student. */
export interface RegisterStudentInfo {
  section: Section;
  class: Class;
}

/** Public problem data returned by GET /public/problems/:id. */
export interface PublicProblem {
  id: string;
  title: string;
  description: string | null;
  solution: string | null;
  starter_code: string | null;
  class_id: string;
  class_name: string | null;
  tags: string[];
}

// ---------------------------------------------------------------------------
// Student work
// ---------------------------------------------------------------------------

/** StudentWork — student's persistent work on a problem in a section. */
export interface StudentWork {
  id: string;
  user_id: string;
  section_id: string;
  problem_id: string;
  code: string;
  execution_settings: unknown;
  last_update: string;
  created_at: string;
}

/** StudentWork with problem data (from GET /student-work/:id). */
export interface StudentWorkWithProblem extends StudentWork {
  problem: Problem;
}

/** SectionProblem — a problem published to a section. */
export interface SectionProblem {
  id: string;
  section_id: string;
  problem_id: string;
  published_by: string;
  show_solution: boolean;
  published_at: string;
}

/** PublishedProblemWithStatus — problem published to a section with student's work status.
 *  Wire format matches Go's PublishedProblemWithStatus (embedded SectionProblem + nested Problem + optional StudentWork). */
export interface PublishedProblemWithStatus extends SectionProblem {
  id: string;
  published_by: string;
  problem: Problem;
  student_work?: StudentWork;
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export interface ExecutionResult {
  success: boolean;
  output: string;
  error: string;
  execution_time_ms: number;
  stdin?: string;
}

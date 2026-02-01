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
// API error
// ---------------------------------------------------------------------------

export interface ApiError {
  error: string;
}

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
  test_cases: unknown;
  execution_settings: unknown;
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
  problem: unknown;
  featured_student_id: string | null;
  featured_code: string | null;
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
  last_update: string;
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

export interface SessionState {
  session: Session;
  students: SessionStudent[];
  join_code: string;
}

export interface SessionPublicState {
  problem: unknown;
  featured_student_id: string | null;
  featured_code: string | null;
  join_code: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export interface ExecutionResult {
  success: boolean;
  output: string;
  error: string;
  execution_time: number;
  stdin?: string;
}

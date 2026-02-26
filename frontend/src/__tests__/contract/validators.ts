/**
 * Shared validation helpers for contract tests.
 *
 * Type-safe validators that use TypeScript interfaces to catch API mismatches at compile time.
 */

import { User, Session, SessionStudent, ExecutionResult, SectionProblem, PublishedProblemWithStatus, StudentWork, StudentProgress, StudentWorkSummary } from '@/types/api';
import type { SerializedInvitation } from '@/lib/api/invitations';
import type {
  StudentJoinedData,
  StudentCodeUpdatedData,
  SessionEndedData,
  SessionReplacedData,
  FeaturedStudentChangedData,
  ProblemUpdatedData,
  SessionStartedInSectionData,
  SessionEndedInSectionData,
} from '@/types/realtime-events';

const SNAKE_CASE_RE = /^[a-z][a-z0-9_]*$/;

/** Assert every key in the object is snake_case. */
export function expectSnakeCaseKeys(obj: object, label: string) {
  for (const key of Object.keys(obj)) {
    expect(key).toMatch(SNAKE_CASE_RE);
  }
  // Explicitly assert no PascalCase leaks for common fields
  expect(obj).not.toHaveProperty('Email');
  expect(obj).not.toHaveProperty('Role');
  expect(obj).not.toHaveProperty('ID');
  expect(obj).not.toHaveProperty('CreatedAt');
  expect(obj).not.toHaveProperty('UpdatedAt');
  expect(obj).not.toHaveProperty('NamespaceID');
  expect(obj).not.toHaveProperty('DisplayName');
}

// ---------------------------------------------------------------------------
// Composite shape validators - Type-safe versions using typed interfaces
// ---------------------------------------------------------------------------

/** Validate the shape of a User object from the backend. */
export function validateUserShape(user: User) {
  expect(typeof user.id).toBe('string');
  expect(typeof user.email).toBe('string');
  expect(typeof user.role).toBe('string');
  expect(typeof user.created_at).toBe('string');
  expect(typeof user.updated_at).toBe('string');
  // nullable fields
  expect(user.external_id === null || typeof user.external_id === 'string').toBe(true);
  expect(user.namespace_id === null || typeof user.namespace_id === 'string').toBe(true);
  expect(user.display_name === null || typeof user.display_name === 'string').toBe(true);
  expectSnakeCaseKeys(user, 'User');
}

/** Validate the shape of a SerializedInvitation object from the backend. */
export function validateInvitationShape(inv: SerializedInvitation) {
  expectSnakeCaseKeys(inv, 'SerializedInvitation');
  expect(typeof inv.id).toBe('string');
  expect(typeof inv.email).toBe('string');
  expect(typeof inv.target_role).toBe('string');
  expect(typeof inv.namespace_id).toBe('string');
  expect(typeof inv.created_by).toBe('string');
  expect(typeof inv.created_at).toBe('string');
  expect(typeof inv.expires_at).toBe('string');
  // nullable fields
  expect(inv.consumed_at === null || typeof inv.consumed_at === 'string').toBe(true);
  expect(inv.consumed_by === null || typeof inv.consumed_by === 'string').toBe(true);
  expect(inv.revoked_at === null || typeof inv.revoked_at === 'string').toBe(true);
}

/** Validate the shape of a Session object from the backend. */
export function validateSessionShape(session: Session) {
  expect(typeof session.id).toBe('string');
  expect(typeof session.namespace_id).toBe('string');
  expect(typeof session.section_id).toBe('string');
  expect(typeof session.section_name).toBe('string');
  expect('problem' in session).toBe(true);
  expect(session.featured_student_id === null || typeof session.featured_student_id === 'string').toBe(true);
  expect(session.featured_code === null || typeof session.featured_code === 'string').toBe(true);
  expect(typeof session.creator_id).toBe('string');
  expect(Array.isArray(session.participants)).toBe(true);
  expect(typeof session.status).toBe('string');
  expect(typeof session.created_at).toBe('string');
  expect(typeof session.last_activity).toBe('string');
  expect(session.ended_at === null || typeof session.ended_at === 'string').toBe(true);
  expectSnakeCaseKeys(session, 'Session');
}

/** Validate the shape of a SessionStudent object with type-safe field access. */
export function validateSessionStudentShape(obj: SessionStudent, label = 'SessionStudent') {
  expect(typeof obj.id).toBe('string');
  expect(typeof obj.session_id).toBe('string');
  expect(typeof obj.user_id).toBe('string');
  expect(typeof obj.name).toBe('string');
  expect('code' in obj).toBe(true);
  expect('execution_settings' in obj).toBe(true);
  expect(typeof obj.joined_at).toBe('string');
  expectSnakeCaseKeys(obj, label);
}

/** Validate the shape of an ExecutionResult object from the backend. */
export function validateExecutionResultShape(obj: ExecutionResult, label = 'ExecutionResult') {
  expect(typeof obj.success).toBe('boolean');
  expect(typeof obj.execution_time_ms).toBe('number');
  // output and error use omitempty — only present when non-empty
  if ('output' in obj) {
    expect(typeof obj.output).toBe('string');
  }
  if ('error' in obj) {
    expect(typeof obj.error).toBe('string');
  }
  expectSnakeCaseKeys(obj, label);
}

/** Validate the shape of a SectionProblem object from the backend. */
export function validateSectionProblemShape(obj: SectionProblem, label = 'SectionProblem') {
  expect(typeof obj.id).toBe('string');
  expect(typeof obj.section_id).toBe('string');
  expect(typeof obj.problem_id).toBe('string');
  expect(typeof obj.published_by).toBe('string');
  expect(typeof obj.show_solution).toBe('boolean');
  expect(typeof obj.published_at).toBe('string');
  expectSnakeCaseKeys(obj, label);
}

/** Validate the shape of a PublishedProblemWithStatus object from the backend. */
export function validatePublishedProblemWithStatusShape(
  obj: PublishedProblemWithStatus,
  label = 'PublishedProblemWithStatus'
) {
  // SectionProblem fields
  expect(typeof obj.section_id).toBe('string');
  expect(typeof obj.problem_id).toBe('string');
  expect(typeof obj.show_solution).toBe('boolean');
  expect(typeof obj.published_at).toBe('string');
  // Additional fields
  expect(typeof obj.id).toBe('string');
  expect(typeof obj.published_by).toBe('string');
  // Nested problem object
  expect(typeof obj.problem).toBe('object');
  expect(obj.problem).not.toBeNull();
  // student_work is optional — null or object
  expect(obj.student_work === null || obj.student_work === undefined || typeof obj.student_work === 'object').toBe(true);
  expectSnakeCaseKeys(obj, label);
}

/** Validate the shape of a StudentWork object from the backend. */
export function validateStudentWorkShape(obj: StudentWork, label = 'StudentWork') {
  expect(typeof obj.id).toBe('string');
  expect(typeof obj.user_id).toBe('string');
  expect(typeof obj.section_id).toBe('string');
  expect(typeof obj.problem_id).toBe('string');
  expect(typeof obj.code).toBe('string');
  // execution_settings is nullable (null or object)
  expect(obj.execution_settings === null || typeof obj.execution_settings === 'object').toBe(true);
  expect(typeof obj.last_update).toBe('string');
  expect(typeof obj.created_at).toBe('string');
  expectSnakeCaseKeys(obj, label);
}

/** Validate the shape of a StudentWorkWithProblem object from the backend. */
export function validateStudentWorkWithProblemShape(
  obj: StudentWork & { problem: object },
  label = 'StudentWorkWithProblem'
) {
  validateStudentWorkShape(obj, label);
  expect(typeof obj.problem).toBe('object');
  expect(obj.problem).not.toBeNull();
}

/** Validate the shape of a StudentProgress object from the backend. */
export function validateStudentProgressShape(obj: StudentProgress, label = 'StudentProgress') {
  expect(typeof obj.user_id).toBe('string');
  expect(typeof obj.display_name).toBe('string');
  expect(typeof obj.email).toBe('string');
  expect(typeof obj.problems_started).toBe('number');
  expect(typeof obj.total_problems).toBe('number');
  // last_active is nullable
  expect(obj.last_active === null || typeof obj.last_active === 'string').toBe(true);
  expectSnakeCaseKeys(obj, label);
}

/** Validate the shape of a StudentWorkSummary object from the backend. */
export function validateStudentWorkSummaryShape(obj: StudentWorkSummary, label = 'StudentWorkSummary') {
  // problem is a full Problem object
  expect(typeof obj.problem).toBe('object');
  expect(obj.problem).not.toBeNull();
  expect(typeof obj.problem.id).toBe('string');
  expect(typeof obj.problem.title).toBe('string');
  expectSnakeCaseKeys(obj.problem, `${label}.problem`);
  // published_at is a string
  expect(typeof obj.published_at).toBe('string');
  // student_work is null or a StudentWork object
  if (obj.student_work !== null) {
    expect(typeof obj.student_work).toBe('object');
    validateStudentWorkShape(obj.student_work!, `${label}.student_work`);
  }
  expectSnakeCaseKeys(obj, label);
}

// ---------------------------------------------------------------------------
// Realtime event payload shape validators
// ---------------------------------------------------------------------------

/** Validate the shape of a student_joined event payload. */
export function validateStudentJoinedShape(obj: StudentJoinedData) {
  expect(typeof obj.user_id).toBe('string');
  expect(typeof obj.display_name).toBe('string');
  expectSnakeCaseKeys(obj, 'StudentJoinedData');
}

/** Validate the shape of a student_code_updated event payload. */
export function validateStudentCodeUpdatedShape(obj: StudentCodeUpdatedData) {
  expect(typeof obj.user_id).toBe('string');
  expect(typeof obj.code).toBe('string');
  // execution_settings is optional (omitempty) — if present, not undefined
  if ('execution_settings' in obj) {
    expect(obj.execution_settings !== undefined).toBe(true);
  }
  expectSnakeCaseKeys(obj, 'StudentCodeUpdatedData');
}

/** Validate the shape of a session_ended event payload. */
export function validateSessionEndedShape(obj: SessionEndedData) {
  expect(typeof obj.session_id).toBe('string');
  expect(typeof obj.reason).toBe('string');
  expectSnakeCaseKeys(obj, 'SessionEndedData');
}

/**
 * Validate the shape of a session_replaced event payload.
 * NOTE: newSessionId uses camelCase (Go JSON tag inconsistency) — expectSnakeCaseKeys is NOT called.
 */
export function validateSessionReplacedShape(obj: SessionReplacedData) {
  expect(typeof obj.newSessionId).toBe('string');
  // Intentionally does NOT call expectSnakeCaseKeys — newSessionId is a known camelCase exception
}

/** Validate the shape of a featured_student_changed event payload. */
export function validateFeaturedStudentChangedShape(obj: FeaturedStudentChangedData) {
  expect(typeof obj.user_id).toBe('string');
  expect(typeof obj.code).toBe('string');
  if ('execution_settings' in obj) {
    expect(obj.execution_settings !== undefined).toBe(true);
  }
  expectSnakeCaseKeys(obj, 'FeaturedStudentChangedData');
}

/** Validate the shape of a problem_updated event payload. */
export function validateProblemUpdatedShape(obj: ProblemUpdatedData) {
  expect(typeof obj.problem_id).toBe('string');
  expectSnakeCaseKeys(obj, 'ProblemUpdatedData');
}

/** Validate the shape of a session_started_in_section event payload. */
export function validateSessionStartedInSectionShape(obj: SessionStartedInSectionData) {
  expect(typeof obj.session_id).toBe('string');
  expect(obj.problem !== undefined && obj.problem !== null).toBe(true);
  expectSnakeCaseKeys(obj, 'SessionStartedInSectionData');
}

/** Validate the shape of a session_ended_in_section event payload. */
export function validateSessionEndedInSectionShape(obj: SessionEndedInSectionData) {
  expect(typeof obj.session_id).toBe('string');
  expectSnakeCaseKeys(obj, 'SessionEndedInSectionData');
}

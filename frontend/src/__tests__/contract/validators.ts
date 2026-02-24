/**
 * Shared validation helpers for contract tests.
 *
 * Type-safe validators that use TypeScript interfaces to catch API mismatches at compile time.
 */

import { User, Session, SessionStudent, ExecutionResult } from '@/types/api';
import type { SerializedInvitation } from '@/lib/api/invitations';

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
  expect(typeof obj.last_update).toBe('string');
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

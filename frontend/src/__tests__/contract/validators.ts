/**
 * Shared validation helpers for contract tests.
 *
 * These validators work with both typed objects and raw JSON responses.
 */

const SNAKE_CASE_RE = /^[a-z][a-z0-9_]*$/;

// Helper type for objects that can be indexed
type Indexable = Record<string, unknown>;

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

/** Assert a string field is present and is a string. */
export function expectString(obj: object, field: string) {
  expect(obj).toHaveProperty(field);
  expect(typeof (obj as Indexable)[field]).toBe('string');
}

/** Assert a field is a string or null. */
export function expectNullableString(obj: object, field: string) {
  expect(obj).toHaveProperty(field);
  const value = (obj as Indexable)[field];
  expect(value === null || typeof value === 'string').toBe(true);
}

/** Assert a field is a boolean. */
export function expectBoolean(obj: object, field: string) {
  expect(obj).toHaveProperty(field);
  expect(typeof (obj as Indexable)[field]).toBe('boolean');
}

/** Assert a field is an array. */
export function expectArray(obj: object, field: string) {
  expect(obj).toHaveProperty(field);
  expect(Array.isArray((obj as Indexable)[field])).toBe(true);
}

/** Assert a field is a number. */
export function expectNumber(obj: object, field: string) {
  expect(obj).toHaveProperty(field);
  expect(typeof (obj as Indexable)[field]).toBe('number');
}

/** Assert a field is a number or null. */
export function expectNullableNumber(obj: object, field: string) {
  expect(obj).toHaveProperty(field);
  const value = (obj as Indexable)[field];
  expect(value === null || typeof value === 'number').toBe(true);
}

// ---------------------------------------------------------------------------
// Composite shape validators
// ---------------------------------------------------------------------------

/** Validate the shape of a User object from the backend. */
export function validateUserShape(user: object) {
  expectString(user, 'id');
  expectNullableString(user, 'external_id');
  expectString(user, 'email');
  expectString(user, 'role');
  expectNullableString(user, 'namespace_id');
  expectNullableString(user, 'display_name');
  expectString(user, 'created_at');
  expectString(user, 'updated_at');
  expectSnakeCaseKeys(user, 'User');
}

/** Validate the shape of a SerializedInvitation object from the backend. */
export function validateInvitationShape(inv: object) {
  expectSnakeCaseKeys(inv, 'SerializedInvitation');
  expectString(inv, 'id');
  expectString(inv, 'email');
  expectString(inv, 'target_role');
  expectString(inv, 'namespace_id');
  expectString(inv, 'created_by');
  expectString(inv, 'created_at');
  expectString(inv, 'expires_at');
  expectNullableString(inv, 'consumed_at');
  expectNullableString(inv, 'consumed_by');
  expectNullableString(inv, 'revoked_at');
}

/** Validate the shape of a Session object from the backend. */
export function validateSessionShape(session: object) {
  expectString(session, 'id');
  expectString(session, 'namespace_id');
  expectString(session, 'section_id');
  expectString(session, 'section_name');
  expect(session).toHaveProperty('problem');
  expectNullableString(session, 'featured_student_id');
  expectNullableString(session, 'featured_code');
  expectString(session, 'creator_id');
  expectArray(session, 'participants');
  expectString(session, 'status');
  expectString(session, 'created_at');
  expectString(session, 'last_activity');
  expectNullableString(session, 'ended_at');
  expectSnakeCaseKeys(session, 'Session');
}

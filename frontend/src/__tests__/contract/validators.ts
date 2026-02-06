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

/** Assert a field is a number or null. */
export function expectNullableNumber(obj: object, field: string) {
  expect(obj).toHaveProperty(field);
  const value = (obj as Indexable)[field];
  expect(value === null || typeof value === 'number').toBe(true);
}

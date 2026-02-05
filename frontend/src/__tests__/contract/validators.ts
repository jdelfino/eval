/**
 * Shared validation helpers for contract tests.
 */

const SNAKE_CASE_RE = /^[a-z][a-z0-9_]*$/;

/** Assert every key in the object is snake_case. */
export function expectSnakeCaseKeys(obj: Record<string, unknown>, label: string) {
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
export function expectString(obj: Record<string, unknown>, field: string) {
  expect(obj).toHaveProperty(field);
  expect(typeof obj[field]).toBe('string');
}

/** Assert a field is a string or null. */
export function expectNullableString(obj: Record<string, unknown>, field: string) {
  expect(obj).toHaveProperty(field);
  expect(obj[field] === null || typeof obj[field] === 'string').toBe(true);
}

/** Assert a field is a boolean. */
export function expectBoolean(obj: Record<string, unknown>, field: string) {
  expect(obj).toHaveProperty(field);
  expect(typeof obj[field]).toBe('boolean');
}

/** Assert a field is an array. */
export function expectArray(obj: Record<string, unknown>, field: string) {
  expect(obj).toHaveProperty(field);
  expect(Array.isArray(obj[field])).toBe(true);
}

/** Assert a field is a number or null. */
export function expectNullableNumber(obj: Record<string, unknown>, field: string) {
  expect(obj).toHaveProperty(field);
  expect(obj[field] === null || typeof obj[field] === 'number').toBe(true);
}

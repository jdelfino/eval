/**
 * Integration test: listClasses()
 * Validates that the typed API function works correctly against the real backend.
 */
import { configureTestAuth, INSTRUCTOR_TOKEN, resetAuthProvider } from './helpers';
import { listClasses } from '@/lib/api/classes';
import {
  expectSnakeCaseKeys,
  } from './validators';

describe('listClasses()', () => {
  beforeAll(() => {
    configureTestAuth(INSTRUCTOR_TOKEN);
  });

  afterAll(() => {
    resetAuthProvider();
  });

  it('returns Class[] with correct snake_case shape', async () => {
    const classes = await listClasses();

    expect(Array.isArray(classes)).toBe(true);
    expect(classes.length).toBeGreaterThan(0);

    const cls = classes[0];

    // Field presence and types
    expect(typeof cls.id).toBe('string');
    expect(typeof cls.namespace_id).toBe('string');
    expect(typeof cls.name).toBe('string');
    expect(cls.description === null || typeof cls.description === 'string').toBe(true);
    expect(typeof cls.created_by).toBe('string');
    expect(typeof cls.created_at).toBe('string');
    expect(typeof cls.updated_at).toBe('string');

    // No PascalCase
    expectSnakeCaseKeys(cls, 'Class');
  });
});

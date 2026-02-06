/**
 * Integration test: listClasses()
 * Validates that the typed API function works correctly against the real backend.
 */
import { configureTestAuth, INSTRUCTOR_TOKEN, resetAuthProvider } from './helpers';
import { listClasses } from '@/lib/api/classes';
import {
  expectSnakeCaseKeys,
  expectString,
  expectNullableString,
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
    expectString(cls, 'id');
    expectString(cls, 'namespace_id');
    expectString(cls, 'name');
    expectNullableString(cls, 'description');
    expectString(cls, 'created_by');
    expectString(cls, 'created_at');
    expectString(cls, 'updated_at');

    // No PascalCase
    expectSnakeCaseKeys(cls, 'Class');
  });
});

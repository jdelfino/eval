/**
 * Integration test: listMySections()
 * Validates that the typed API function works correctly against the real backend.
 */
import { configureTestAuth, INSTRUCTOR_TOKEN, resetAuthProvider } from './helpers';
import { listMySections } from '@/lib/api/sections';
import {
  expectSnakeCaseKeys,
  expectString,
  expectNullableString,
  expectBoolean,
} from './validators';

describe('listMySections()', () => {
  beforeAll(() => {
    configureTestAuth(INSTRUCTOR_TOKEN);
  });

  afterAll(() => {
    resetAuthProvider();
  });

  it('returns MySectionInfo[] with correct snake_case shape', async () => {
    const sections = await listMySections();

    expect(Array.isArray(sections)).toBe(true);

    // The instructor may or may not have sections. If enrolled, validate the shape.
    if (sections.length > 0) {
      const item = sections[0];

      // MySectionInfo has { section: Section, class_name: string }
      expectSnakeCaseKeys(item, 'MySectionInfo');
      expect(item).toHaveProperty('section');
      expectString(item, 'class_name');

      const sec = item.section;
      expectString(sec, 'id');
      expectString(sec, 'namespace_id');
      expectString(sec, 'class_id');
      expectString(sec, 'name');
      expectNullableString(sec, 'semester');
      expectString(sec, 'join_code');
      expectBoolean(sec, 'active');
      expectString(sec, 'created_at');
      expectString(sec, 'updated_at');

      expectSnakeCaseKeys(sec, 'Section');
    }
  });
});

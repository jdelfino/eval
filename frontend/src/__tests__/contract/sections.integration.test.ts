/**
 * Integration test: listMySections()
 * Validates that the typed API function works correctly against the real backend.
 */
import { configureTestAuth, INSTRUCTOR_TOKEN, resetAuthProvider } from './helpers';
import { listMySections } from '@/lib/api/sections';

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
      expect('section' in item).toBe(true);
      expect(typeof item.class_name).toBe('string');

      const sec = item.section;
      expect(typeof sec.id).toBe('string');
      expect(typeof sec.namespace_id).toBe('string');
      expect(typeof sec.class_id).toBe('string');
      expect(typeof sec.name).toBe('string');
      expect(sec.semester === null || typeof sec.semester === 'string').toBe(true);
      expect(typeof sec.join_code).toBe('string');
      expect(typeof sec.active).toBe('boolean');
      expect(typeof sec.created_at).toBe('string');
      expect(typeof sec.updated_at).toBe('string');

    }
  });
});

/**
 * Contract test: GET /api/v1/sections/my
 * Validates the MySectionInfo[] response shape matches frontend expectations.
 */
import { contractFetch } from './helpers';
import {
  expectSnakeCaseKeys,
  expectString,
  expectNullableString,
  expectBoolean,
} from './validators';

describe('GET /api/v1/sections/my', () => {
  it('returns an array of MySectionInfo objects with correct snake_case shape', async () => {
    const res = await contractFetch('/api/v1/sections/my');
    expect(res.status).toBe(200);

    const sections = await res.json();
    expect(Array.isArray(sections)).toBe(true);

    // The admin may or may not be enrolled. If enrolled, validate the shape.
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

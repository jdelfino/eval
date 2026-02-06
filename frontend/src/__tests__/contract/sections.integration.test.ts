/**
 * Contract test: GET /api/v1/sections/my
 * Validates the MySectionInfo[] response shape matches frontend expectations.
 *
 * Also tests that the typed API client functions work correctly with the backend.
 */
import { contractFetch, INSTRUCTOR_TOKEN } from './helpers';
import {
  expectSnakeCaseKeys,
  expectString,
  expectNullableString,
  expectBoolean,
} from './validators';
import { listMySections } from '@/lib/api/sections';

// Mock fetch for typed API client tests
const originalFetch = global.fetch;

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

  describe('listMySections typed API client', () => {
    beforeAll(() => {
      // Mock fetch to use contract test token
      global.fetch = jest.fn().mockImplementation((url: string, init?: RequestInit) => {
        return originalFetch(url, {
          ...init,
          headers: {
            ...init?.headers,
            Authorization: `Bearer ${INSTRUCTOR_TOKEN}`,
          },
        });
      });
    });

    afterAll(() => {
      global.fetch = originalFetch;
    });

    it('returns MySectionInfo[] directly (not wrapped)', async () => {
      const sections = await listMySections();
      expect(Array.isArray(sections)).toBe(true);

      // If there are sections, verify the shape
      if (sections.length > 0) {
        const item = sections[0];
        expect(item).toHaveProperty('section');
        expect(item).toHaveProperty('class_name');
        expect(typeof item.class_name).toBe('string');
        expect(item.section).toHaveProperty('id');
        expect(item.section).toHaveProperty('namespace_id');
      }
    });
  });
});

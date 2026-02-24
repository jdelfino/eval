/**
 * Integration tests for ALL class and section typed API functions.
 * Validates response shapes and snake_case conventions against the real backend.
 *
 * Covers:
 *   1. getClass(id)
 *   2. createClass(name, description?)
 *   3. updateClass(id, updates)
 *   4. deleteClass(id)
 *   5. createSection(classId, options)
 *   6. updateSection(sectionId, updates)
 *   7. regenerateJoinCode(sectionId)
 *   8. addCoInstructor(sectionId, email)
 *   9. removeCoInstructor(sectionId, userId)
 */
import { configureTestAuth, INSTRUCTOR_TOKEN, resetAuthProvider } from './helpers';
import { state } from './shared-state';
import {
  getClass,
  createClass,
  updateClass,
  deleteClass,
  createSection,
  updateSection,
  regenerateJoinCode,
  addCoInstructor,
  removeCoInstructor,
} from '@/lib/api/classes';
import {
  expectSnakeCaseKeys,
  } from './validators';

/** Validate the shape of a Class object. */
function validateClassShape(cls: import("@/types/api").Class) {
  expect(typeof cls.id).toBe('string');
  expect(typeof cls.namespace_id).toBe('string');
  expect(typeof cls.name).toBe('string');
  expect(cls.description === null || typeof cls.description === 'string').toBe(true);
  expect(typeof cls.created_by).toBe('string');
  expect(typeof cls.created_at).toBe('string');
  expect(typeof cls.updated_at).toBe('string');
  expectSnakeCaseKeys(cls, 'Class');
}

/** Validate the shape of a Section object. */
function validateSectionShape(sec: import("@/types/api").Section) {
  expect(typeof sec.id).toBe('string');
  expect(typeof sec.namespace_id).toBe('string');
  expect(typeof sec.class_id).toBe('string');
  expect(typeof sec.name).toBe('string');
  expect(sec.semester === null || typeof sec.semester === 'string').toBe(true);
  expect(typeof sec.join_code).toBe('string');
  expect(typeof sec.active).toBe('boolean');
  expect(typeof sec.created_at).toBe('string');
  expect(typeof sec.updated_at).toBe('string');
  expectSnakeCaseKeys(sec, 'Section');
}

describe('Classes API — full coverage', () => {
  // Track resources created during mutating tests for cleanup
  let createdClassId: string | null = null;
  let createdSectionId: string | null = null;

  beforeAll(() => {
    configureTestAuth(INSTRUCTOR_TOKEN);
  });

  afterAll(async () => {
    // Clean up the class created for mutating tests (cascades to sections)
    if (createdClassId) {
      try {
        await deleteClass(createdClassId);
      } catch {
        // Best-effort cleanup; ignore errors
      }
    }
    resetAuthProvider();
  });

  // ──────────────────────────────────────────────
  // 1. getClass
  // ──────────────────────────────────────────────
  describe('getClass(id)', () => {
    it('returns ClassDetailsResponse with correct snake_case shape', async () => {
      const classId = state.classId;
      expect(classId).toBeTruthy();

      const result = await getClass(classId);

      // Top-level keys
      expect('class' in result).toBe(true);
      expect('sections' in result).toBe(true);
      expect('instructorNames' in result).toBe(true);

      // Class sub-object
      validateClassShape(result.class);
      expect(result.class.id).toBe(classId);

      // Sections sub-array
      expect(Array.isArray(result.sections)).toBe(true);
      if (result.sections.length > 0) {
        validateSectionShape(result.sections[0]);
      }

      // instructorNames is Record<string, string>
      expect(typeof result.instructorNames).toBe('object');
      expect(result.instructorNames).not.toBeNull();
      for (const [key, value] of Object.entries(result.instructorNames)) {
        expect(typeof key).toBe('string');
        expect(typeof value).toBe('string');
      }
    });
  });

  // ──────────────────────────────────────────────
  // 2. createClass
  // ──────────────────────────────────────────────
  describe('createClass(name, description?)', () => {
    it('creates a class and returns Class with correct shape', async () => {
      const name = `contract-test-class-${Date.now()}`;
      const description = 'Created by contract test';

      const cls = await createClass(name, description);

      validateClassShape(cls);
      expect(cls.name).toBe(name);
      expect(cls.description).toBe(description);

      // Store for subsequent mutating tests and cleanup
      createdClassId = cls.id;
    });

    it('creates a class without description', async () => {
      const name = `contract-no-desc-${Date.now()}`;

      const cls = await createClass(name);

      validateClassShape(cls);
      expect(cls.name).toBe(name);
      // description should be null or the empty string when omitted
      expect(cls.description === null || cls.description === '' || cls.description === undefined).toBe(true);

      // Clean up this extra class immediately
      await deleteClass(cls.id);
    });
  });

  // ──────────────────────────────────────────────
  // 3. updateClass
  // ──────────────────────────────────────────────
  describe('updateClass(id, updates)', () => {
    it('updates a class and returns the updated Class', async () => {
      expect(createdClassId).toBeTruthy();

      const updatedName = `updated-contract-${Date.now()}`;
      const cls = await updateClass(createdClassId!, { name: updatedName });

      validateClassShape(cls);
      expect(cls.id).toBe(createdClassId);
      expect(cls.name).toBe(updatedName);
    });
  });

  // ──────────────────────────────────────────────
  // 5. createSection (before deleteClass so we have a class to attach to)
  // ──────────────────────────────────────────────
  describe('createSection(classId, options)', () => {
    it('creates a section and returns Section with correct shape', async () => {
      expect(createdClassId).toBeTruthy();

      const section = await createSection(createdClassId!, {
        name: `contract-section-${Date.now()}`,
        semester: 'Spring 2026',
      });

      validateSectionShape(section);
      expect(section.class_id).toBe(createdClassId);
      expect(section.semester).toBe('Spring 2026');
      expect(section.active).toBe(true);

      // Store for subsequent section tests
      createdSectionId = section.id;
    });
  });

  // ──────────────────────────────────────────────
  // 6. updateSection
  // ──────────────────────────────────────────────
  describe('updateSection(sectionId, updates)', () => {
    it('updates a section and returns the updated Section', async () => {
      expect(createdSectionId).toBeTruthy();

      const updatedName = `updated-section-${Date.now()}`;
      const section = await updateSection(createdSectionId!, { name: updatedName });

      validateSectionShape(section);
      expect(section.id).toBe(createdSectionId);
      expect(section.name).toBe(updatedName);
    });
  });

  // ──────────────────────────────────────────────
  // 7. regenerateJoinCode
  // ──────────────────────────────────────────────
  describe('regenerateJoinCode(sectionId)', () => {
    it('regenerates the join code and returns Section with new code', async () => {
      expect(createdSectionId).toBeTruthy();

      const section = await regenerateJoinCode(createdSectionId!);

      validateSectionShape(section);
      expect(section.id).toBe(createdSectionId);
      // join_code should be a non-empty string
      expect(typeof section.join_code).toBe('string');
      expect(section.join_code.length).toBeGreaterThan(0);
    });
  });

  // ──────────────────────────────────────────────
  // 8. addCoInstructor
  // ──────────────────────────────────────────────
  describe('addCoInstructor(sectionId, email)', () => {
    it('calls addCoInstructor without throwing (void return)', async () => {
      expect(createdSectionId).toBeTruthy();

      try {
        // Use a plausible email; the backend may reject if user does not exist (404/422).
        // The contract test validates the call shape, not business logic.
        await addCoInstructor(createdSectionId!, 'co-instructor-contract@test.local');
        // If it succeeds, the return is void — nothing further to validate.
      } catch (err: unknown) {
        // 404 or 422 is acceptable — user may not exist in the test DB.
        // Any other status is unexpected.
        const status = (err as { status?: number }).status;
        if (status === 404 || status === 422) {
          // Expected: user not found or validation error. Contract shape is void anyway.
          return;
        }
        throw err;
      }
    });
  });

  // ──────────────────────────────────────────────
  // 9. removeCoInstructor
  // ──────────────────────────────────────────────
  describe('removeCoInstructor(sectionId, userId)', () => {
    it('calls removeCoInstructor without throwing (void return)', async () => {
      expect(createdSectionId).toBeTruthy();

      try {
        // Use a dummy userId; the backend may reject with 404 if not found.
        await removeCoInstructor(createdSectionId!, '00000000-0000-0000-0000-000000000000');
      } catch (err: unknown) {
        const status = (err as { status?: number }).status;
        if (status === 404 || status === 422) {
          // Expected: user not an instructor on this section. Contract shape is void anyway.
          return;
        }
        throw err;
      }
    });
  });

  // ──────────────────────────────────────────────
  // 4. deleteClass (last, since it removes the class we used above)
  // ──────────────────────────────────────────────
  describe('deleteClass(id)', () => {
    it('deletes a class without throwing (void return)', async () => {
      expect(createdClassId).toBeTruthy();

      // deleteClass returns void; if it does not throw, the contract is satisfied.
      await deleteClass(createdClassId!);

      // Mark as cleaned up so afterAll does not attempt double-delete
      createdClassId = null;
      createdSectionId = null;
    });

    it('returns 404 when fetching the deleted class', async () => {
      // This test depends on the previous one having run successfully.
      // We re-create a class, delete it, then confirm getClass throws.
      const tempClass = await createClass(`delete-verify-${Date.now()}`);
      await deleteClass(tempClass.id);

      try {
        await getClass(tempClass.id);
        // If getClass succeeds, the delete did not work as expected
        fail('Expected getClass to throw after deletion');
      } catch (err: unknown) {
        const status = (err as { status?: number }).status;
        expect(status).toBe(404);
      }
    });
  });
});

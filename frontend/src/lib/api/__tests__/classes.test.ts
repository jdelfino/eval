/**
 * Unit tests for the typed API client functions for classes.
 * These tests verify that the typed API functions correctly call the underlying
 * api-client methods and return responses directly (backend returns plain objects).
 *
 * @jest-environment jsdom
 */

const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
const mockApiPatch = jest.fn();
const mockApiDelete = jest.fn();

jest.mock('@/lib/api-client', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiPatch: (...args: unknown[]) => mockApiPatch(...args),
  apiDelete: (...args: unknown[]) => mockApiDelete(...args),
}));

import {
  listClasses,
  createClass,
  updateClass,
  deleteClass,
  createSection,
  updateSection,
  regenerateJoinCode,
  addCoInstructor,
  removeCoInstructor,
} from '../classes';
import type { Class, Section } from '@/types/api';

const fakeClass: Class = {
  id: 'c1',
  namespace_id: 'ns-1',
  name: 'CS 101',
  description: null,
  created_by: 'u1',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const fakeSection: Section = {
  id: 's1',
  namespace_id: 'ns-1',
  class_id: 'c1',
  name: 'Section A',
  semester: 'Fall 2024',
  join_code: 'ABC123',
  active: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('lib/api/classes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listClasses', () => {
    it('calls GET /classes and returns plain Class array', async () => {
      // Backend returns plain array (not wrapped)
      mockApiGet.mockResolvedValue([fakeClass]);

      const result = await listClasses();

      expect(mockApiGet).toHaveBeenCalledWith('/classes');
      expect(result).toEqual([fakeClass]);
    });

    it('returns empty array when API returns empty array', async () => {
      mockApiGet.mockResolvedValue([]);

      const result = await listClasses();

      expect(result).toEqual([]);
    });
  });

  describe('createClass', () => {
    it('calls POST /classes with name and description, returns plain Class', async () => {
      // Backend returns plain object (not wrapped)
      mockApiPost.mockResolvedValue(fakeClass);

      const result = await createClass('CS 101', 'Intro to CS');

      expect(mockApiPost).toHaveBeenCalledWith('/classes', { name: 'CS 101', description: 'Intro to CS' });
      expect(result).toEqual(fakeClass);
    });

    it('calls POST /classes with name only when description is omitted', async () => {
      mockApiPost.mockResolvedValue(fakeClass);

      const result = await createClass('CS 101');

      expect(mockApiPost).toHaveBeenCalledWith('/classes', { name: 'CS 101', description: undefined });
      expect(result).toEqual(fakeClass);
    });
  });

  describe('updateClass', () => {
    it('calls PATCH /classes/{id} and returns plain Class', async () => {
      const updated = { ...fakeClass, name: 'CS 102' };
      mockApiPatch.mockResolvedValue(updated);

      const result = await updateClass('c1', { name: 'CS 102' });

      expect(mockApiPatch).toHaveBeenCalledWith('/classes/c1', { name: 'CS 102' });
      expect(result).toEqual(updated);
    });
  });

  describe('deleteClass', () => {
    it('calls DELETE /classes/{id} and returns void', async () => {
      mockApiDelete.mockResolvedValue(undefined);

      const result = await deleteClass('c1');

      expect(mockApiDelete).toHaveBeenCalledWith('/classes/c1');
      expect(result).toBeUndefined();
    });
  });

  describe('createSection', () => {
    it('calls POST /classes/{classId}/sections and returns plain Section', async () => {
      // Backend returns plain object (not wrapped)
      mockApiPost.mockResolvedValue(fakeSection);

      const result = await createSection('c1', 'Section A', 'Fall 2024');

      expect(mockApiPost).toHaveBeenCalledWith('/classes/c1/sections', { name: 'Section A', semester: 'Fall 2024' });
      expect(result).toEqual(fakeSection);
    });

    it('calls POST with semester undefined when omitted', async () => {
      mockApiPost.mockResolvedValue(fakeSection);

      const result = await createSection('c1', 'Section A');

      expect(mockApiPost).toHaveBeenCalledWith('/classes/c1/sections', { name: 'Section A', semester: undefined });
      expect(result).toEqual(fakeSection);
    });
  });

  describe('updateSection', () => {
    it('calls PATCH /sections/{sectionId} and returns plain Section', async () => {
      const updated = { ...fakeSection, name: 'Section B' };
      mockApiPatch.mockResolvedValue(updated);

      const result = await updateSection('s1', { name: 'Section B' });

      expect(mockApiPatch).toHaveBeenCalledWith('/sections/s1', { name: 'Section B' });
      expect(result).toEqual(updated);
    });
  });

  describe('regenerateJoinCode', () => {
    it('calls POST /sections/{sectionId}/regenerate-code and returns Section with new code', async () => {
      const updatedSection = { ...fakeSection, join_code: 'NEW456' };
      // Backend returns plain Section object (not wrapped)
      mockApiPost.mockResolvedValue(updatedSection);

      const result = await regenerateJoinCode('s1');

      expect(mockApiPost).toHaveBeenCalledWith('/sections/s1/regenerate-code');
      expect(result).toEqual(updatedSection);
    });
  });

  describe('addCoInstructor', () => {
    it('calls POST /sections/{sectionId}/instructors with email', async () => {
      mockApiPost.mockResolvedValue(undefined);

      const result = await addCoInstructor('s1', 'co@test.com');

      expect(mockApiPost).toHaveBeenCalledWith('/sections/s1/instructors', { email: 'co@test.com' });
      expect(result).toBeUndefined();
    });
  });

  describe('removeCoInstructor', () => {
    it('calls DELETE /sections/{sectionId}/instructors/{userId}', async () => {
      mockApiDelete.mockResolvedValue(undefined);

      const result = await removeCoInstructor('s1', 'u2');

      expect(mockApiDelete).toHaveBeenCalledWith('/sections/s1/instructors/u2');
      expect(result).toBeUndefined();
    });
  });
});

/**
 * Unit tests for sections API client functions.
 * @jest-environment jsdom
 */

const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
const mockApiDelete = jest.fn();

jest.mock('@/lib/api-client', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiDelete: (...args: unknown[]) => mockApiDelete(...args),
}));

import {
  listMySections,
  joinSection,
  leaveSection,
  getActiveSessions,
  getClassSections,
  getSectionInstructors,
  deleteSection,
} from '../sections';
import type { MySectionInfo, SectionMembership, Session, Section } from '@/types/api';

describe('sections API client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listMySections', () => {
    it('calls GET /sections/my and returns array directly', async () => {
      const mockSections: MySectionInfo[] = [
        {
          section: {
            id: 's1',
            namespace_id: 'ns-1',
            class_id: 'c1',
            name: 'Section A',
            semester: 'Fall 2024',
            join_code: 'ABC',
            active: true,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
          class_name: 'CS 101',
        },
      ];
      mockApiGet.mockResolvedValue(mockSections);

      const result = await listMySections();

      expect(mockApiGet).toHaveBeenCalledWith('/sections/my');
      expect(result).toEqual(mockSections);
    });
  });

  describe('joinSection', () => {
    it('calls POST /sections/join and returns SectionMembership directly', async () => {
      const mockMembership: SectionMembership = {
        id: 'mem-1',
        user_id: 'u1',
        section_id: 's1',
        role: 'student',
        joined_at: '2024-01-01T00:00:00Z',
      };
      mockApiPost.mockResolvedValue(mockMembership);

      const result = await joinSection('JOIN123');

      expect(mockApiPost).toHaveBeenCalledWith('/sections/join', { join_code: 'JOIN123' });
      expect(result).toEqual(mockMembership);
    });
  });

  describe('leaveSection', () => {
    it('calls DELETE /sections/{id}/membership and returns void', async () => {
      mockApiDelete.mockResolvedValue(undefined);

      await leaveSection('s1');

      expect(mockApiDelete).toHaveBeenCalledWith('/sections/s1/membership');
    });
  });

  describe('getActiveSessions', () => {
    it('calls GET /sections/{id}/sessions and returns array directly', async () => {
      const mockSessions: Session[] = [
        {
          id: 'sess1',
          namespace_id: 'ns-1',
          section_id: 's1',
          section_name: 'Section A',
          problem: null,
          featured_student_id: null,
          featured_code: null,
          creator_id: 'u1',
          participants: [],
          status: 'active',
          created_at: '2024-01-01T00:00:00Z',
          last_activity: '2024-01-01T00:00:00Z',
          ended_at: null,
        },
      ];
      mockApiGet.mockResolvedValue(mockSessions);

      const result = await getActiveSessions('s1');

      expect(mockApiGet).toHaveBeenCalledWith('/sections/s1/sessions');
      expect(result).toEqual(mockSessions);
    });
  });

  describe('getClassSections', () => {
    it('calls GET /classes/{id}/sections and returns Section array', async () => {
      const mockSections: Section[] = [
        {
          id: 's1',
          namespace_id: 'ns-1',
          class_id: 'c1',
          name: 'Section A',
          semester: 'Fall 2024',
          join_code: 'ABC',
          active: true,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];
      mockApiGet.mockResolvedValue(mockSections);

      const result = await getClassSections('c1');

      expect(mockApiGet).toHaveBeenCalledWith('/classes/c1/sections');
      expect(result).toEqual(mockSections);
    });
  });

  describe('getSectionInstructors', () => {
    it('calls GET /sections/{id}/instructors and returns SectionMembership[]', async () => {
      const mockMemberships = [
        {
          id: 'm1',
          user_id: 'u1',
          section_id: 's1',
          role: 'instructor',
          joined_at: '2024-01-01T00:00:00Z',
        },
      ];
      mockApiGet.mockResolvedValue(mockMemberships);

      const result = await getSectionInstructors('s1');

      expect(mockApiGet).toHaveBeenCalledWith('/sections/s1/instructors');
      expect(result).toEqual(mockMemberships);
    });

    it('returns empty array when no instructors', async () => {
      mockApiGet.mockResolvedValue([]);

      const result = await getSectionInstructors('s1');

      expect(result).toEqual([]);
    });
  });

  describe('deleteSection', () => {
    it('calls DELETE /sections/{id}', async () => {
      mockApiDelete.mockResolvedValue(undefined);

      await deleteSection('s1');

      expect(mockApiDelete).toHaveBeenCalledWith('/sections/s1');
    });
  });
});

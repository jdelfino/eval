/**
 * Unit tests for instructor API client functions.
 * @jest-environment jsdom
 */

const mockApiGet = jest.fn();

jest.mock('@/lib/api-client', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
}));

import { getInstructorDashboard } from '../instructor';
import type { InstructorDashboard } from '../instructor';

describe('instructor API client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getInstructorDashboard', () => {
    it('calls GET /instructor/dashboard and returns dashboard data', async () => {
      const mockDashboard: InstructorDashboard = {
        classes: [{
          id: 'c1', namespace_id: 'ns-1', name: 'CS101', description: null,
          created_by: 'u1', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
        }],
        sections: [{
          id: 's1', namespace_id: 'ns-1', class_id: 'c1', name: 'Section A',
          semester: 'Fall 2024', join_code: 'ABC', active: true,
          created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
        }],
        sessions: [{
          id: 'sess1', namespace_id: 'ns-1', section_id: 's1', section_name: 'Section A',
          problem: null, featured_student_id: null, featured_code: null,
          creator_id: 'u1', participants: [], status: 'active',
          created_at: '2024-01-01T00:00:00Z', last_activity: '2024-01-01T00:00:00Z', ended_at: null,
        }],
      };
      mockApiGet.mockResolvedValue(mockDashboard);

      const result = await getInstructorDashboard();

      expect(mockApiGet).toHaveBeenCalledWith('/instructor/dashboard');
      expect(result).toEqual(mockDashboard);
    });

    it('returns empty arrays when no data exists', async () => {
      const emptyDashboard: InstructorDashboard = {
        classes: [],
        sections: [],
        sessions: [],
      };
      mockApiGet.mockResolvedValue(emptyDashboard);

      const result = await getInstructorDashboard();

      expect(mockApiGet).toHaveBeenCalledWith('/instructor/dashboard');
      expect(result).toEqual(emptyDashboard);
    });
  });
});

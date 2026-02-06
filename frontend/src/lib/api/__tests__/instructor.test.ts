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
        classes: [{ id: 'c1', name: 'CS101', namespace_id: 'ns-1', created_at: '2024-01-01T00:00:00Z' }],
        sections: [{ id: 's1', name: 'Section A', class_id: 'c1', created_at: '2024-01-01T00:00:00Z' }],
        sessions: [{ id: 'sess1', section_id: 's1', status: 'active', created_at: '2024-01-01T00:00:00Z' }],
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

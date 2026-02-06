import { getInstructorDashboard } from '../instructor';

// Mock the api-client module
const mockApiGet = jest.fn();
jest.mock('@/lib/api-client', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
}));

describe('instructor API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getInstructorDashboard', () => {
    it('calls GET /instructor/dashboard', async () => {
      const fakeData = {
        classes: [
          {
            id: 'c1',
            name: 'CS 101',
            sections: [
              { id: 's1', name: 'Section A', join_code: 'ABC123', studentCount: 25 },
            ],
          },
        ],
      };
      mockApiGet.mockResolvedValue(fakeData);

      const result = await getInstructorDashboard();

      expect(mockApiGet).toHaveBeenCalledWith('/instructor/dashboard');
      expect(result).toEqual(fakeData);
    });
  });
});

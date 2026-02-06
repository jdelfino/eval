/**
 * Unit tests for admin API client functions.
 * @jest-environment jsdom
 */

const mockApiGet = jest.fn();
const mockApiPut = jest.fn();
const mockApiDelete = jest.fn();

jest.mock('@/lib/api-client', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPut: (...args: unknown[]) => mockApiPut(...args),
  apiDelete: (...args: unknown[]) => mockApiDelete(...args),
}));

import {
  getAdminStats,
  listAdminUsers,
  changeUserRole,
  deleteAdminUser,
} from '../admin';
import type { User } from '@/types/api';

describe('admin API client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAdminStats', () => {
    it('calls GET /admin/stats and transforms response', async () => {
      // Backend returns raw shape
      mockApiGet.mockResolvedValue({
        users_by_role: { 'system-admin': 1, instructor: 3, student: 6 },
        class_count: 5,
        section_count: 8,
        active_sessions: 2,
      });

      const result = await getAdminStats();

      expect(mockApiGet).toHaveBeenCalledWith('/admin/stats');
      expect(result).toEqual({
        users: { total: 10, byRole: { admin: 1, instructor: 3, student: 6 } },
        classes: { total: 5 },
        sections: { total: 8 },
        sessions: { active: 2 },
      });
    });

    it('includes namespace query param when provided', async () => {
      mockApiGet.mockResolvedValue({});

      await getAdminStats('ns-123');

      expect(mockApiGet).toHaveBeenCalledWith('/admin/stats?namespace=ns-123');
    });
  });

  describe('listAdminUsers', () => {
    it('calls GET /admin/users and returns users array', async () => {
      const mockUsers: User[] = [
        {
          id: 'u1',
          external_id: 'ext-1',
          email: 'user@example.com',
          role: 'instructor',
          namespace_id: 'ns-1',
          display_name: 'Test User',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];
      mockApiGet.mockResolvedValue(mockUsers);

      const result = await listAdminUsers();

      expect(mockApiGet).toHaveBeenCalledWith('/admin/users');
      expect(result).toEqual(mockUsers);
    });

    it('includes namespace and role query params when provided', async () => {
      mockApiGet.mockResolvedValue([]);

      await listAdminUsers({ namespaceId: 'ns-1', role: 'student' });

      expect(mockApiGet).toHaveBeenCalledWith('/admin/users?namespace=ns-1&role=student');
    });
  });

  describe('changeUserRole', () => {
    it('calls PUT /admin/users/{userId}/role with role body and returns updated user', async () => {
      const mockUser: User = {
        id: 'u1',
        external_id: 'ext-1',
        email: 'user@example.com',
        role: 'instructor',
        namespace_id: 'ns-1',
        display_name: 'Test User',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      mockApiPut.mockResolvedValue(mockUser);

      const result = await changeUserRole('u1', 'instructor');

      expect(mockApiPut).toHaveBeenCalledWith('/admin/users/u1/role', { role: 'instructor' });
      expect(result).toEqual(mockUser);
    });
  });

  describe('deleteAdminUser', () => {
    it('calls DELETE /admin/users/{userId}', async () => {
      mockApiDelete.mockResolvedValue(undefined);

      await deleteAdminUser('u1');

      expect(mockApiDelete).toHaveBeenCalledWith('/admin/users/u1');
    });
  });
});

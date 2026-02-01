/**
 * Unit tests for DELETE /api/admin/users/[id]
 * Tests user deletion endpoint with proper role-based access control
 */

import { DELETE } from '../route';
import { getAuthProvider } from '@/server/auth';
import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@/server/auth/types';
import { RBACService } from '@/server/auth/rbac';

// Mock dependencies
jest.mock('@/server/auth');
jest.mock('@/server/auth/api-helpers', () => ({
  requirePermission: jest.fn(),
  getNamespaceContext: jest.fn((req: any, user: any) => user.namespaceId || 'default'),
}));

import { requirePermission } from '@/server/auth/api-helpers';

const mockGetAuthProvider = getAuthProvider as jest.MockedFunction<typeof getAuthProvider>;
const mockRequirePermission = requirePermission as jest.MockedFunction<typeof requirePermission>;

// Helper to create auth context
function createAuthContext(user: User) {
  return {
    user,
    accessToken: 'test-access-token',
    rbac: new RBACService(user),
  };
}

describe('DELETE /api/admin/users/[id]', () => {
  let mockAuthProvider: any;
  let mockUserRepository: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup mock user repository
    mockUserRepository = {
      getUser: jest.fn(),
      deleteUser: jest.fn(),
      listUsers: jest.fn(),
    };

    // Setup mock auth provider
    mockAuthProvider = {
      getSession: jest.fn(),
      deleteUser: jest.fn(),
      userRepository: mockUserRepository,
    };
    mockGetAuthProvider.mockResolvedValue(mockAuthProvider);
  });

  const createMockRequest = (sessionId?: string): NextRequest => {
    const url = 'http://localhost:3000/api/admin/users/user123';
    const request = new NextRequest(url, {
      method: 'DELETE',
    });

    // Mock cookies
    if (sessionId) {
      Object.defineProperty(request, 'cookies', {
        value: {
          get: jest.fn((name: string) =>
            name === 'sessionId' ? { value: sessionId } : undefined
          ),
        },
        configurable: true,
      });
    } else {
      Object.defineProperty(request, 'cookies', {
        value: {
          get: jest.fn(() => undefined),
        },
        configurable: true,
      });
    }

    return request;
  };

  describe('Authentication', () => {
    it('should return 401 when no session cookie is provided', async () => {
      mockRequirePermission.mockResolvedValue(
        NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      );

      const request = createMockRequest();
      const params = Promise.resolve({ id: 'user123' });

      const response = await DELETE(request, { params });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Not authenticated');
    });

    it('should return 401 when session is invalid', async () => {
      mockRequirePermission.mockResolvedValue(
        NextResponse.json({ error: 'Invalid session' }, { status: 401 })
      );

      const request = createMockRequest('invalid-session');
      const params = Promise.resolve({ id: 'user123' });

      const response = await DELETE(request, { params });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid session');
    });
  });

  describe('Authorization', () => {
    it('should allow instructors to delete users', async () => {
      const instructor: User = {
        id: 'instructor1',
        email: "test@example.com",
        role: 'instructor',
        namespaceId: 'default',
        createdAt: new Date(),
      };
      mockRequirePermission.mockResolvedValue(createAuthContext(instructor));

      const request = createMockRequest('instructor-session');
      const params = Promise.resolve({ id: 'user123' });

      mockUserRepository.getUser.mockResolvedValue({
        id: 'user123',
        role: 'student',
        namespaceId: 'default',
        createdAt: new Date(),
      });
      mockUserRepository.listUsers.mockResolvedValue([
        { id: 'instructor1', username: 'instructor1', role: 'instructor', namespaceId: 'default', createdAt: new Date() },
        { id: 'instructor2', username: 'instructor2', role: 'instructor', namespaceId: 'default', createdAt: new Date() },
      ]);
      mockAuthProvider.deleteUser.mockResolvedValue(undefined);

      const response = await DELETE(request, { params });

      expect(response.status).toBe(200);
      expect(mockAuthProvider.deleteUser).toHaveBeenCalledWith('user123');
    });

    it('should allow admins to delete users', async () => {
      const admin: User = {
        id: 'admin1',
        email: "test@example.com",
        role: 'namespace-admin',
        namespaceId: 'default',
        createdAt: new Date(),
      };
      mockRequirePermission.mockResolvedValue(createAuthContext(admin));

      const request = createMockRequest('admin-session');
      const params = Promise.resolve({ id: 'user123' });

      mockUserRepository.getUser.mockResolvedValue({
        id: 'user123',
        role: 'student',
        namespaceId: 'default',
        createdAt: new Date(),
      });
      mockUserRepository.listUsers.mockResolvedValue([
        { id: 'instructor1', username: 'instructor1', role: 'instructor', namespaceId: 'default', createdAt: new Date() },
      ]);
      mockAuthProvider.deleteUser.mockResolvedValue(undefined);

      const response = await DELETE(request, { params });

      expect(response.status).toBe(200);
      expect(mockAuthProvider.deleteUser).toHaveBeenCalledWith('user123');
    });

    it('should deny students from deleting users', async () => {
      mockRequirePermission.mockResolvedValue(
        NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      );

      const request = createMockRequest('student-session');
      const params = Promise.resolve({ id: 'user123' });

      const response = await DELETE(request, { params });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(mockAuthProvider.deleteUser).not.toHaveBeenCalled();
    });
  });

  describe('Self-Deletion Prevention', () => {
    it('should prevent users from deleting themselves', async () => {
      const instructor: User = {
        id: 'instructor1',
        email: "test@example.com",
        role: 'instructor',
        namespaceId: 'default',
        createdAt: new Date(),
      };
      mockRequirePermission.mockResolvedValue(createAuthContext(instructor));

      const request = createMockRequest('instructor-session');
      const params = Promise.resolve({ id: 'instructor1' });

      const response = await DELETE(request, { params });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Cannot delete your own account');
      expect(mockUserRepository.getUser).not.toHaveBeenCalled();
    });
  });

  describe('Last Admin Protection', () => {
    it('should prevent deletion of the last admin', async () => {
      const admin: User = {
        id: 'admin1',
        email: "test@example.com",
        role: 'system-admin',
        namespaceId: 'default',
        createdAt: new Date(),
      };
      mockRequirePermission.mockResolvedValue(createAuthContext(admin));

      const request = createMockRequest('admin-session');
      const params = Promise.resolve({ id: 'admin2' });

      mockUserRepository.getUser.mockResolvedValue({
        id: 'admin2',
        role: 'namespace-admin',
        namespaceId: 'default',
        createdAt: new Date(),
      });
      // Only one admin in the system
      mockUserRepository.listUsers.mockResolvedValue([
        { id: 'admin2', username: 'admin2', role: 'namespace-admin', namespaceId: 'default', createdAt: new Date() },
      ]);

      const response = await DELETE(request, { params });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Cannot delete the last namespace admin');
      expect(mockAuthProvider.deleteUser).not.toHaveBeenCalled();
    });

    it('should allow deletion when multiple admins exist', async () => {
      const admin: User = {
        id: 'admin1',
        email: "test@example.com",
        role: 'system-admin',
        namespaceId: 'default',
        createdAt: new Date(),
      };
      mockRequirePermission.mockResolvedValue(createAuthContext(admin));

      const request = createMockRequest('admin-session');
      const params = Promise.resolve({ id: 'admin2' });

      mockUserRepository.getUser.mockResolvedValue({
        id: 'admin2',
        role: 'namespace-admin',
        namespaceId: 'default',
        createdAt: new Date(),
      });
      mockUserRepository.listUsers.mockResolvedValue([
        { id: 'admin1', username: 'admin1', role: 'namespace-admin', namespaceId: 'default', createdAt: new Date() },
        { id: 'admin2', username: 'admin2', role: 'namespace-admin', namespaceId: 'default', createdAt: new Date() },
        { id: 'admin3', username: 'admin3', role: 'namespace-admin', namespaceId: 'default', createdAt: new Date() },
      ]);
      mockAuthProvider.deleteUser.mockResolvedValue(undefined);

      const response = await DELETE(request, { params });

      expect(response.status).toBe(200);
      expect(mockAuthProvider.deleteUser).toHaveBeenCalledWith('admin2');
    });

    it('should allow deletion of instructors freely', async () => {
      const admin: User = {
        id: 'admin1',
        email: "test@example.com",
        role: 'namespace-admin',
        namespaceId: 'default',
        createdAt: new Date(),
      };
      mockRequirePermission.mockResolvedValue(createAuthContext(admin));

      const request = createMockRequest('admin-session');
      const params = Promise.resolve({ id: 'instructor1' });

      mockUserRepository.getUser.mockResolvedValue({
        id: 'instructor1',
        role: 'instructor',
        namespaceId: 'default',
        createdAt: new Date(),
      });
      mockAuthProvider.deleteUser.mockResolvedValue(undefined);

      const response = await DELETE(request, { params });

      expect(response.status).toBe(200);
      expect(mockAuthProvider.deleteUser).toHaveBeenCalledWith('instructor1');
      // Should not check for last instructor
      expect(mockUserRepository.listUsers).not.toHaveBeenCalledWith('instructor');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      const instructor: User = {
        id: 'instructor1',
        email: "test@example.com",
        role: 'instructor',
        namespaceId: 'default',
        createdAt: new Date(),
      };
      mockRequirePermission.mockResolvedValue(createAuthContext(instructor));
    });

    it('should return 404 when user does not exist', async () => {
      const request = createMockRequest('instructor-session');
      const params = Promise.resolve({ id: 'nonexistent' });

      mockUserRepository.getUser.mockResolvedValue(null);

      const response = await DELETE(request, { params });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('User not found');
    });

    it('should return 500 for database errors', async () => {
      const request = createMockRequest('instructor-session');
      const params = Promise.resolve({ id: 'user123' });

      mockUserRepository.getUser.mockRejectedValue(new Error('Database error'));

      const response = await DELETE(request, { params });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toContain('Failed to delete user');
    });
  });
});

/**
 * Unit tests for namespace users API routes
 * Tests user management within namespaces
 */

import { GET } from '../route';
import { NextRequest } from 'next/server';
import * as apiHelpers from '@/server/auth/api-helpers';
import { getNamespaceRepository, getUserRepository } from '@/server/auth';

// Mock dependencies
jest.mock('@/server/auth/api-helpers');
jest.mock('@/server/auth');

const mockRequirePermission = apiHelpers.requirePermission as jest.MockedFunction<typeof apiHelpers.requirePermission>;
const mockRequireAuth = apiHelpers.requireAuth as jest.MockedFunction<typeof apiHelpers.requireAuth>;
const mockGetNamespaceRepository = getNamespaceRepository as jest.MockedFunction<typeof getNamespaceRepository>;
const mockGetUserRepository = getUserRepository as jest.MockedFunction<typeof getUserRepository>;

describe('Namespace Users API', () => {
  const mockSystemAdmin = {
    id: 'admin-123',
    email: 'sysadmin@example.com',
    role: 'system-admin' as const,
    namespaceId: null,
    createdAt: new Date(),
    lastLoginAt: new Date(),
  };

  const mockInstructor = {
    id: 'instructor-123',
    email: 'teacher@example.com',
    role: 'instructor' as const,
    namespaceId: 'test-namespace',
    createdAt: new Date(),
    lastLoginAt: new Date(),
  };

  const mockNamespace = {
    id: 'test-namespace',
    displayName: 'Test Namespace',
    active: true,
    createdBy: 'admin-123',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockNamespaceRepo = {
    getNamespace: jest.fn(),
    updateNamespace: jest.fn(),
    deactivateNamespace: jest.fn(),
    listNamespaces: jest.fn(),
    namespaceExists: jest.fn(),
    createNamespace: jest.fn(),
    initialize: jest.fn(),
    shutdown: jest.fn(),
    health: jest.fn(),
  };

  const mockUserRepo = {
    listUsers: jest.fn(),
    getUser: jest.fn(),
    saveUser: jest.fn(),
    updateUser: jest.fn(),
    deleteUser: jest.fn(),
    getUserCount: jest.fn(),
    getUserByEmail: jest.fn(),
    getUsersByNamespace: jest.fn(),
    clear: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNamespaceRepository.mockReturnValue(mockNamespaceRepo as any);
    mockGetUserRepository.mockReturnValue(mockUserRepo as any);
  });

  const mockAuthForUser = (user: any | null, permission: string = 'namespace.viewAll') => {
    if (!user) {
      mockRequirePermission.mockResolvedValue(
        new (require('next/server').NextResponse)(
          JSON.stringify({ error: 'Not authenticated' }),
          { status: 401 }
        )
      );
      mockRequireAuth.mockResolvedValue(
        new (require('next/server').NextResponse)(
          JSON.stringify({ error: 'Not authenticated' }),
          { status: 401 }
        )
      );
    } else {
      const hasPermission = user.role === 'system-admin';
      if (hasPermission) {
        const authContext = {
          user,
          accessToken: 'test-access-token',
          rbac: {
            hasPermission: jest.fn().mockReturnValue(true),
            canManageUser: jest.fn().mockReturnValue(true),
            canAccessSession: jest.fn().mockResolvedValue(true),
            getRolePermissions: jest.fn().mockReturnValue([]),
            assertPermission: jest.fn(),
            assertCanAccessSession: jest.fn().mockResolvedValue(undefined),
            assertCanManageUser: jest.fn(),
          },
        };
        mockRequirePermission.mockResolvedValue(authContext);
        mockRequireAuth.mockResolvedValue(authContext);
      } else {
        mockRequirePermission.mockResolvedValue(
          new (require('next/server').NextResponse)(
            JSON.stringify({ error: `Forbidden: Requires ${permission} permission` }),
            { status: 403 }
          )
        );
        mockRequireAuth.mockResolvedValue(
          new (require('next/server').NextResponse)(
            JSON.stringify({ error: 'Forbidden' }),
            { status: 403 }
          )
        );
      }
    }
  };

  const createMockRequest = (method: string, body?: any): NextRequest => {
    const url = 'http://localhost:3000/api/system/namespaces/test-namespace/users';
    return new NextRequest(url, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
    });
  };

  describe('GET /api/system/namespaces/[id]/users', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuthForUser(null);
      const request = createMockRequest('GET');

      const response = await GET(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Not authenticated');
    });

    it('should return 403 when user is not system-admin', async () => {
      mockAuthForUser(mockInstructor);
      const request = createMockRequest('GET');

      const response = await GET(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
    });

    it('should return 404 when namespace does not exist', async () => {
      mockAuthForUser(mockSystemAdmin);
      mockNamespaceRepo.getNamespace.mockResolvedValue(null);

      const request = createMockRequest('GET');
      const response = await GET(request, { params: Promise.resolve({ id: 'nonexistent' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
    });

    it('should return users in namespace', async () => {
      mockAuthForUser(mockSystemAdmin);
      mockNamespaceRepo.getNamespace.mockResolvedValue(mockNamespace);

      const mockUsers = [
        { id: 'u1', email: 'user1@example.com', role: 'instructor' as const, namespaceId: 'test-namespace', createdAt: new Date(), lastLoginAt: new Date() },
        { id: 'u2', email: 'user2@example.com', role: 'student' as const, namespaceId: 'test-namespace', createdAt: new Date(), lastLoginAt: new Date() },
      ];

      mockUserRepo.listUsers.mockResolvedValue([
        ...mockUsers,
        { id: 'u3', email: 'other@example.com', role: 'instructor' as const, namespaceId: 'other-namespace', createdAt: new Date(), lastLoginAt: new Date() },
      ]);

      const request = createMockRequest('GET');
      const response = await GET(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.users).toHaveLength(2);
      expect(data.users.every((u: any) => u.namespaceId === 'test-namespace')).toBe(true);
    });

    it('should return empty array when namespace has no users', async () => {
      mockAuthForUser(mockSystemAdmin);
      mockNamespaceRepo.getNamespace.mockResolvedValue(mockNamespace);
      mockUserRepo.listUsers.mockResolvedValue([]);

      const request = createMockRequest('GET');
      const response = await GET(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.users).toEqual([]);
    });
  });
});

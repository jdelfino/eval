/**
 * Unit tests for individual namespace API routes
 * Tests GET, PUT, DELETE operations on specific namespaces
 */

import { GET, PUT, DELETE } from '../route';
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

describe('Individual Namespace API', () => {
  const mockSystemAdmin = {
    id: 'admin-123',
    role: 'system-admin' as const,
    namespaceId: null,
    createdAt: new Date(),
    lastLoginAt: new Date(),
  };

  const mockInstructor = {
    id: 'instructor-123',
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
    deleteNamespace: jest.fn(),
    listNamespaces: jest.fn(),
    namespaceExists: jest.fn(),
    createNamespace: jest.fn(),
    initialize: jest.fn(),
    shutdown: jest.fn(),
    health: jest.fn(),
  };

  const mockUserRepo = {
    listUsers: jest.fn().mockResolvedValue([
      { id: 'user1', namespaceId: 'test-namespace' },
      { id: 'user2', namespaceId: 'test-namespace' },
      { id: 'user3', namespaceId: 'other-namespace' },
    ]),
    getUserById: jest.fn(),
    getUserByUsername: jest.fn(),
    createUser: jest.fn(),
    updateUser: jest.fn(),
    deleteUser: jest.fn(),
    initialize: jest.fn(),
    shutdown: jest.fn(),
    health: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNamespaceRepository.mockReturnValue(mockNamespaceRepo as any);
    mockGetUserRepository.mockReturnValue(mockUserRepo as any);
  });

  const mockAuthForUser = (user: any | null, permission: string = 'namespace.manage') => {
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
    const url = 'http://localhost:3000/api/system/namespaces/test-namespace';
    return new NextRequest(url, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
    });
  };

  describe('GET /api/system/namespaces/[id]', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuthForUser(null, 'namespace.viewAll');
      const request = createMockRequest('GET');

      const response = await GET(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Not authenticated');
    });

    it('should return 403 when user is not system-admin', async () => {
      mockAuthForUser(mockInstructor, 'namespace.viewAll');
      const request = createMockRequest('GET');

      const response = await GET(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
    });

    it('should return 404 when namespace does not exist', async () => {
      mockAuthForUser(mockSystemAdmin, 'namespace.viewAll');
      mockNamespaceRepo.getNamespace.mockResolvedValue(null);

      const request = createMockRequest('GET');
      const response = await GET(request, { params: Promise.resolve({ id: 'nonexistent' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
    });

    it('should return namespace details successfully', async () => {
      mockAuthForUser(mockSystemAdmin, 'namespace.viewAll');
      mockNamespaceRepo.getNamespace.mockResolvedValue(mockNamespace);

      const request = createMockRequest('GET');
      const response = await GET(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.namespace.id).toBe('test-namespace');
      expect(data.namespace.displayName).toBe('Test Namespace');
      expect(data.namespace.userCount).toBe(2); // Two users in test-namespace
    });
  });

  describe('PUT /api/system/namespaces/[id]', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuthForUser(null);
      const request = createMockRequest('PUT', { displayName: 'Updated Name' });

      const response = await PUT(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Not authenticated');
    });

    it('should return 403 when user is not system-admin', async () => {
      mockAuthForUser(mockInstructor);
      const request = createMockRequest('PUT', { displayName: 'Updated Name' });

      const response = await PUT(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
    });

    it('should return 404 when namespace does not exist', async () => {
      mockAuthForUser(mockSystemAdmin);
      mockNamespaceRepo.getNamespace.mockResolvedValue(null);

      const request = createMockRequest('PUT', { displayName: 'Updated Name' });
      const response = await PUT(request, { params: Promise.resolve({ id: 'nonexistent' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
    });

    it('should update display name successfully', async () => {
      mockAuthForUser(mockSystemAdmin);
      mockNamespaceRepo.namespaceExists.mockResolvedValue(true);
      mockNamespaceRepo.getNamespace.mockResolvedValue(mockNamespace);

      const updatedNamespace = { ...mockNamespace, displayName: 'Updated Name' };
      mockNamespaceRepo.updateNamespace.mockResolvedValue(updatedNamespace);
      mockNamespaceRepo.getNamespace.mockResolvedValue(updatedNamespace);

      const request = createMockRequest('PUT', { displayName: 'Updated Name' });
      const response = await PUT(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.namespace.displayName).toBe('Updated Name');
      expect(mockNamespaceRepo.updateNamespace).toHaveBeenCalledWith('test-namespace', {
        displayName: 'Updated Name',
      });
    });

    it('should update active status successfully', async () => {
      mockAuthForUser(mockSystemAdmin);
      mockNamespaceRepo.namespaceExists.mockResolvedValue(true);

      const updatedNamespace = { ...mockNamespace, active: false };
      mockNamespaceRepo.updateNamespace.mockResolvedValue(updatedNamespace);
      mockNamespaceRepo.getNamespace.mockResolvedValue(updatedNamespace);

      const request = createMockRequest('PUT', { active: false });
      const response = await PUT(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockNamespaceRepo.updateNamespace).toHaveBeenCalledWith('test-namespace', {
        active: false,
      });
    });

    it('should update both display name and active status', async () => {
      mockAuthForUser(mockSystemAdmin);
      mockNamespaceRepo.namespaceExists.mockResolvedValue(true);

      const updatedNamespace = { ...mockNamespace, displayName: 'New Name', active: false };
      mockNamespaceRepo.updateNamespace.mockResolvedValue(updatedNamespace);
      mockNamespaceRepo.getNamespace.mockResolvedValue(updatedNamespace);

      const request = createMockRequest('PUT', { displayName: 'New Name', active: false });
      const response = await PUT(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockNamespaceRepo.updateNamespace).toHaveBeenCalledWith('test-namespace', {
        displayName: 'New Name',
        active: false,
      });
    });

    it('should return 400 when no updates provided', async () => {
      mockAuthForUser(mockSystemAdmin);
      mockNamespaceRepo.getNamespace.mockResolvedValue(mockNamespace);

      const request = createMockRequest('PUT', {});
      const response = await PUT(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('No update fields provided');
    });

    it('should trim display name when updating', async () => {
      mockAuthForUser(mockSystemAdmin);
      mockNamespaceRepo.namespaceExists.mockResolvedValue(true);
      mockNamespaceRepo.getNamespace.mockResolvedValue(mockNamespace);
      mockNamespaceRepo.updateNamespace.mockResolvedValue({
        ...mockNamespace,
        displayName: 'Trimmed Name',
      });

      const request = createMockRequest('PUT', { displayName: '  Trimmed Name  ' });
      await PUT(request, { params: Promise.resolve({ id: 'test-namespace' }) });

      expect(mockNamespaceRepo.updateNamespace).toHaveBeenCalledWith('test-namespace', {
        displayName: 'Trimmed Name',
      });
    });
  });

  describe('DELETE /api/system/namespaces/[id]', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuthForUser(null, 'namespace.delete');
      const request = createMockRequest('DELETE');

      const response = await DELETE(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Not authenticated');
    });

    it('should return 403 when user is not system-admin', async () => {
      mockAuthForUser(mockInstructor, 'namespace.delete');
      const request = createMockRequest('DELETE');

      const response = await DELETE(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
    });

    it('should return 404 when namespace does not exist', async () => {
      mockAuthForUser(mockSystemAdmin, 'namespace.delete');
      mockNamespaceRepo.namespaceExists.mockResolvedValue(false);

      const request = createMockRequest('DELETE');
      const response = await DELETE(request, { params: Promise.resolve({ id: 'nonexistent' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
    });

    it('should delete namespace successfully', async () => {
      mockAuthForUser(mockSystemAdmin, 'namespace.delete');
      mockNamespaceRepo.namespaceExists.mockResolvedValue(true);
      mockNamespaceRepo.deleteNamespace.mockResolvedValue(undefined);

      const request = createMockRequest('DELETE');
      const response = await DELETE(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockNamespaceRepo.deleteNamespace).toHaveBeenCalledWith('test-namespace');
    });
  });
});

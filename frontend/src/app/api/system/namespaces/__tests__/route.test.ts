/**
 * Unit tests for system namespace API routes
 * Tests namespace CRUD operations with proper authentication and authorization
 */

import { GET, POST } from '../route';
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

describe('System Namespace API', () => {
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

  const mockNamespaceRepo = {
    listNamespaces: jest.fn(),
    namespaceExists: jest.fn(),
    createNamespace: jest.fn(),
    getNamespace: jest.fn(),
    updateNamespace: jest.fn(),
    deactivateNamespace: jest.fn(),
    initialize: jest.fn(),
    shutdown: jest.fn(),
    health: jest.fn(),
  };

  const mockUserRepo = {
    listUsers: jest.fn(),
    getUserByUsername: jest.fn(),
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
    const url = 'http://localhost:3000/api/system/namespaces';
    return new NextRequest(url, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
    });
  };

  describe('GET /api/system/namespaces', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuthForUser(null);
      const request = createMockRequest('GET');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Not authenticated');
    });

    it('should return 403 when user is not system-admin', async () => {
      mockAuthForUser(mockInstructor);
      const request = createMockRequest('GET');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(403);
    });

    it('should return list of namespaces with user counts', async () => {
      mockAuthForUser(mockSystemAdmin);

      const mockNamespaces = [
        {
          id: 'ns1',
          displayName: 'Namespace 1',
          active: true,
          createdBy: 'admin-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'ns2',
          displayName: 'Namespace 2',
          active: true,
          createdBy: 'admin-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockUsers = [
        { id: 'u1', username: 'user1', role: 'instructor' as const, namespaceId: 'ns1', createdAt: new Date(), lastLoginAt: new Date() },
        { id: 'u2', username: 'user2', role: 'instructor' as const, namespaceId: 'ns1', createdAt: new Date(), lastLoginAt: new Date() },
        { id: 'u3', username: 'user3', role: 'instructor' as const, namespaceId: 'ns2', createdAt: new Date(), lastLoginAt: new Date() },
      ];

      mockNamespaceRepo.listNamespaces.mockResolvedValue(mockNamespaces);
      mockUserRepo.listUsers.mockResolvedValue(mockUsers);

      const request = createMockRequest('GET');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.namespaces).toHaveLength(2);
      expect(data.namespaces[0].userCount).toBe(2);
      expect(data.namespaces[1].userCount).toBe(1);
    });

    it('should exclude inactive namespaces by default', async () => {
      mockAuthForUser(mockSystemAdmin);

      const mockNamespaces = [
        {
          id: 'ns1',
          displayName: 'Active',
          active: true,
          createdBy: 'admin-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockNamespaceRepo.listNamespaces.mockResolvedValue(mockNamespaces);
      mockUserRepo.listUsers.mockResolvedValue([]);

      const request = createMockRequest('GET');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(mockNamespaceRepo.listNamespaces).toHaveBeenCalledWith(false);
    });

    it('should include inactive namespaces when requested', async () => {
      mockAuthForUser(mockSystemAdmin);

      mockNamespaceRepo.listNamespaces.mockResolvedValue([]);
      mockUserRepo.listUsers.mockResolvedValue([]);

      const url = 'http://localhost:3000/api/system/namespaces?includeInactive=true';
      const request = new NextRequest(url, { method: 'GET' });
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockNamespaceRepo.listNamespaces).toHaveBeenCalledWith(true);
    });
  });

  describe('POST /api/system/namespaces', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuthForUser(null, 'namespace.create');
      const request = createMockRequest('POST', {
        id: 'test-ns',
        displayName: 'Test Namespace',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Not authenticated');
    });

    it('should return 403 when user is not system-admin', async () => {
      mockAuthForUser(mockInstructor, 'namespace.create');
      const request = createMockRequest('POST', {
        id: 'test-ns',
        displayName: 'Test Namespace',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
    });

    it('should return 400 when namespace ID is missing', async () => {
      mockAuthForUser(mockSystemAdmin, 'namespace.create');
      const request = createMockRequest('POST', {
        displayName: 'Test Namespace',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Namespace ID is required');
    });

    it('should return 400 when display name is missing', async () => {
      mockAuthForUser(mockSystemAdmin, 'namespace.create');
      const request = createMockRequest('POST', {
        id: 'test-ns',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Display name is required');
    });

    it('should return 400 when namespace ID is too short', async () => {
      mockAuthForUser(mockSystemAdmin, 'namespace.create');
      const request = createMockRequest('POST', {
        id: 'ab',
        displayName: 'Test',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('3-32 characters');
    });

    it('should return 400 when namespace ID contains uppercase', async () => {
      mockAuthForUser(mockSystemAdmin, 'namespace.create');
      const request = createMockRequest('POST', {
        id: 'TestNamespace',
        displayName: 'Test',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('lowercase');
    });

    it('should return 400 when namespace ID contains special characters', async () => {
      mockAuthForUser(mockSystemAdmin, 'namespace.create');
      const request = createMockRequest('POST', {
        id: 'test_namespace',
        displayName: 'Test',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('lowercase letters, numbers, and hyphens only');
    });

    it('should return 409 when namespace ID already exists', async () => {
      mockAuthForUser(mockSystemAdmin, 'namespace.create');
      mockNamespaceRepo.namespaceExists.mockResolvedValue(true);

      const request = createMockRequest('POST', {
        id: 'existing-ns',
        displayName: 'Test',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toContain('already exists');
    });

    it('should create namespace successfully', async () => {
      mockAuthForUser(mockSystemAdmin, 'namespace.create');
      mockNamespaceRepo.namespaceExists.mockResolvedValue(false);

      const createdNamespace = {
        id: 'test-ns',
        displayName: 'Test Namespace',
        active: true,
        createdBy: 'admin-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockNamespaceRepo.createNamespace.mockResolvedValue(createdNamespace);

      const request = createMockRequest('POST', {
        id: 'test-ns',
        displayName: 'Test Namespace',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.namespace.id).toBe('test-ns');
      expect(data.namespace.displayName).toBe('Test Namespace');
      expect(mockNamespaceRepo.createNamespace).toHaveBeenCalledWith({
        id: 'test-ns',
        displayName: 'Test Namespace',
        active: true,
        createdBy: 'admin-123',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });

    it('should trim display name when creating namespace', async () => {
      mockAuthForUser(mockSystemAdmin, 'namespace.create');
      mockNamespaceRepo.namespaceExists.mockResolvedValue(false);
      mockNamespaceRepo.createNamespace.mockResolvedValue({
        id: 'test-ns',
        displayName: 'Test Namespace',
        active: true,
        createdBy: 'admin-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = createMockRequest('POST', {
        id: 'test-ns',
        displayName: '  Test Namespace  ',
      });

      await POST(request);

      expect(mockNamespaceRepo.createNamespace).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Test Namespace',
        })
      );
    });
  });

  describe('Namespace ID Validation Regex', () => {
    const namespaceIdRegex = /^[a-z0-9-]{3,32}$/;

    describe('Valid namespace IDs', () => {
      it('should accept lowercase letters only (3 chars)', () => {
        expect(namespaceIdRegex.test('abc')).toBe(true);
      });

      it('should accept lowercase letters only (32 chars)', () => {
        const id = 'a'.repeat(32);
        expect(namespaceIdRegex.test(id)).toBe(true);
      });

      it('should accept lowercase with hyphens', () => {
        expect(namespaceIdRegex.test('test-namespace')).toBe(true);
      });

      it('should accept lowercase with numbers', () => {
        expect(namespaceIdRegex.test('namespace123')).toBe(true);
      });

      it('should accept mix of lowercase, numbers, and hyphens', () => {
        expect(namespaceIdRegex.test('test-namespace-123')).toBe(true);
      });
    });

    describe('Invalid namespace IDs', () => {
      it('should reject ID shorter than 3 characters', () => {
        expect(namespaceIdRegex.test('ab')).toBe(false);
        expect(namespaceIdRegex.test('a')).toBe(false);
        expect(namespaceIdRegex.test('')).toBe(false);
      });

      it('should reject ID longer than 32 characters', () => {
        const id = 'a'.repeat(33);
        expect(namespaceIdRegex.test(id)).toBe(false);
      });

      it('should reject uppercase letters', () => {
        expect(namespaceIdRegex.test('TestNamespace')).toBe(false);
        expect(namespaceIdRegex.test('TESTNAMESPACE')).toBe(false);
      });

      it('should reject spaces', () => {
        expect(namespaceIdRegex.test('test namespace')).toBe(false);
      });

      it('should reject underscores', () => {
        expect(namespaceIdRegex.test('test_namespace')).toBe(false);
      });

      it('should reject special characters', () => {
        expect(namespaceIdRegex.test('test@namespace')).toBe(false);
        expect(namespaceIdRegex.test('test.namespace')).toBe(false);
      });
    });
  });
});


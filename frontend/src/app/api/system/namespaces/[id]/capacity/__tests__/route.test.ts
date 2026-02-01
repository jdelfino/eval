/**
 * Unit tests for namespace capacity API routes
 * Tests GET and PUT operations for capacity management
 */

import { GET, PUT } from '../route';
import { NextRequest } from 'next/server';
import * as apiHelpers from '@/server/auth/api-helpers';
import { getNamespaceRepository } from '@/server/auth';

// Mock dependencies
jest.mock('@/server/auth/api-helpers');
jest.mock('@/server/auth');

const mockRequirePermission = apiHelpers.requirePermission as jest.MockedFunction<typeof apiHelpers.requirePermission>;
const mockGetNamespaceRepository = getNamespaceRepository as jest.MockedFunction<typeof getNamespaceRepository>;

describe('Namespace Capacity API', () => {
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

  const mockCapacityUsage = {
    instructorCount: 5,
    studentCount: 50,
    maxInstructors: 10,
    maxStudents: 100,
  };

  const mockNamespaceRepo = {
    getCapacityUsage: jest.fn(),
    updateCapacityLimits: jest.fn(),
    namespaceExists: jest.fn(),
    getNamespace: jest.fn(),
    createNamespace: jest.fn(),
    listNamespaces: jest.fn(),
    updateNamespace: jest.fn(),
    deleteNamespace: jest.fn(),
    initialize: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNamespaceRepository.mockReturnValue(mockNamespaceRepo as any);
  });

  const mockAuthForUser = (user: any | null) => {
    if (!user) {
      mockRequirePermission.mockResolvedValue(
        new (require('next/server').NextResponse)(
          JSON.stringify({ error: 'Not authenticated' }),
          { status: 401 }
        )
      );
    } else if (user.role !== 'system-admin') {
      mockRequirePermission.mockResolvedValue(
        new (require('next/server').NextResponse)(
          JSON.stringify({ error: 'Forbidden: Requires namespace.manage permission' }),
          { status: 403 }
        )
      );
    } else {
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
    }
  };

  const createMockRequest = (method: string, body?: any): NextRequest => {
    const url = 'http://localhost:3000/api/system/namespaces/test-namespace/capacity';
    return new NextRequest(url, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
    });
  };

  describe('GET /api/system/namespaces/[id]/capacity', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuthForUser(null);
      const request = createMockRequest('GET');

      const response = await GET(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Not authenticated');
    });

    it('should return 403 for non-system-admin', async () => {
      mockAuthForUser(mockInstructor);
      const request = createMockRequest('GET');

      const response = await GET(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Forbidden');
    });

    it('should return 404 for non-existent namespace', async () => {
      mockAuthForUser(mockSystemAdmin);
      mockNamespaceRepo.getCapacityUsage.mockResolvedValue(null);

      const request = createMockRequest('GET');
      const response = await GET(request, { params: Promise.resolve({ id: 'nonexistent' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Namespace not found');
    });

    it('should return current capacity usage and limits', async () => {
      mockAuthForUser(mockSystemAdmin);
      mockNamespaceRepo.getCapacityUsage.mockResolvedValue(mockCapacityUsage);

      const request = createMockRequest('GET');
      const response = await GET(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.capacity).toEqual(mockCapacityUsage);
      expect(data.capacity.instructorCount).toBe(5);
      expect(data.capacity.studentCount).toBe(50);
      expect(data.capacity.maxInstructors).toBe(10);
      expect(data.capacity.maxStudents).toBe(100);
    });

    it('should return null limits when unlimited', async () => {
      mockAuthForUser(mockSystemAdmin);
      const unlimitedCapacity = {
        instructorCount: 5,
        studentCount: 50,
        maxInstructors: null,
        maxStudents: null,
      };
      mockNamespaceRepo.getCapacityUsage.mockResolvedValue(unlimitedCapacity);

      const request = createMockRequest('GET');
      const response = await GET(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.capacity.maxInstructors).toBeNull();
      expect(data.capacity.maxStudents).toBeNull();
    });
  });

  describe('PUT /api/system/namespaces/[id]/capacity', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuthForUser(null);
      const request = createMockRequest('PUT', { maxInstructors: 20 });

      const response = await PUT(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Not authenticated');
    });

    it('should return 403 for non-system-admin', async () => {
      mockAuthForUser(mockInstructor);
      const request = createMockRequest('PUT', { maxInstructors: 20 });

      const response = await PUT(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Forbidden');
    });

    it('should return 404 for non-existent namespace', async () => {
      mockAuthForUser(mockSystemAdmin);
      mockNamespaceRepo.namespaceExists.mockResolvedValue(false);

      const request = createMockRequest('PUT', { maxInstructors: 20 });
      const response = await PUT(request, { params: Promise.resolve({ id: 'nonexistent' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Namespace not found');
    });

    it('should return 400 when no update fields provided', async () => {
      mockAuthForUser(mockSystemAdmin);

      const request = createMockRequest('PUT', {});
      const response = await PUT(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('No update fields provided');
    });

    it('should return 400 for negative maxInstructors', async () => {
      mockAuthForUser(mockSystemAdmin);

      const request = createMockRequest('PUT', { maxInstructors: -5 });
      const response = await PUT(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('maxInstructors cannot be negative');
    });

    it('should return 400 for negative maxStudents', async () => {
      mockAuthForUser(mockSystemAdmin);

      const request = createMockRequest('PUT', { maxStudents: -10 });
      const response = await PUT(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('maxStudents cannot be negative');
    });

    it('should return 400 for non-integer maxInstructors', async () => {
      mockAuthForUser(mockSystemAdmin);

      const request = createMockRequest('PUT', { maxInstructors: 5.5 });
      const response = await PUT(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('maxInstructors must be an integer or null');
    });

    it('should return 400 for non-integer maxStudents', async () => {
      mockAuthForUser(mockSystemAdmin);

      const request = createMockRequest('PUT', { maxStudents: 'fifty' });
      const response = await PUT(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('maxStudents must be an integer or null');
    });

    it('should update maxInstructors successfully', async () => {
      mockAuthForUser(mockSystemAdmin);
      mockNamespaceRepo.namespaceExists.mockResolvedValue(true);
      const updatedCapacity = { ...mockCapacityUsage, maxInstructors: 20 };
      mockNamespaceRepo.getCapacityUsage.mockResolvedValue(updatedCapacity);

      const request = createMockRequest('PUT', { maxInstructors: 20 });
      const response = await PUT(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.capacity.maxInstructors).toBe(20);
      expect(mockNamespaceRepo.updateCapacityLimits).toHaveBeenCalledWith(
        'test-namespace',
        { maxInstructors: 20 }
      );
    });

    it('should update maxStudents successfully', async () => {
      mockAuthForUser(mockSystemAdmin);
      mockNamespaceRepo.namespaceExists.mockResolvedValue(true);
      const updatedCapacity = { ...mockCapacityUsage, maxStudents: 200 };
      mockNamespaceRepo.getCapacityUsage.mockResolvedValue(updatedCapacity);

      const request = createMockRequest('PUT', { maxStudents: 200 });
      const response = await PUT(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.capacity.maxStudents).toBe(200);
      expect(mockNamespaceRepo.updateCapacityLimits).toHaveBeenCalledWith(
        'test-namespace',
        { maxStudents: 200 }
      );
    });

    it('should update both limits successfully', async () => {
      mockAuthForUser(mockSystemAdmin);
      mockNamespaceRepo.namespaceExists.mockResolvedValue(true);
      const updatedCapacity = { ...mockCapacityUsage, maxInstructors: 15, maxStudents: 150 };
      mockNamespaceRepo.getCapacityUsage.mockResolvedValue(updatedCapacity);

      const request = createMockRequest('PUT', { maxInstructors: 15, maxStudents: 150 });
      const response = await PUT(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.capacity.maxInstructors).toBe(15);
      expect(data.capacity.maxStudents).toBe(150);
      expect(mockNamespaceRepo.updateCapacityLimits).toHaveBeenCalledWith(
        'test-namespace',
        { maxInstructors: 15, maxStudents: 150 }
      );
    });

    it('should allow setting limits to null (unlimited)', async () => {
      mockAuthForUser(mockSystemAdmin);
      mockNamespaceRepo.namespaceExists.mockResolvedValue(true);
      const updatedCapacity = {
        instructorCount: 5,
        studentCount: 50,
        maxInstructors: null,
        maxStudents: null,
      };
      mockNamespaceRepo.getCapacityUsage.mockResolvedValue(updatedCapacity);

      const request = createMockRequest('PUT', { maxInstructors: null, maxStudents: null });
      const response = await PUT(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.capacity.maxInstructors).toBeNull();
      expect(data.capacity.maxStudents).toBeNull();
      expect(mockNamespaceRepo.updateCapacityLimits).toHaveBeenCalledWith(
        'test-namespace',
        { maxInstructors: null, maxStudents: null }
      );
    });

    it('should allow setting limits to zero', async () => {
      mockAuthForUser(mockSystemAdmin);
      mockNamespaceRepo.namespaceExists.mockResolvedValue(true);
      const updatedCapacity = { ...mockCapacityUsage, maxInstructors: 0, maxStudents: 0 };
      mockNamespaceRepo.getCapacityUsage.mockResolvedValue(updatedCapacity);

      const request = createMockRequest('PUT', { maxInstructors: 0, maxStudents: 0 });
      const response = await PUT(request, { params: Promise.resolve({ id: 'test-namespace' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.capacity.maxInstructors).toBe(0);
      expect(data.capacity.maxStudents).toBe(0);
    });
  });
});

/**
 * Tests for /api/problems/[id] endpoints
 *
 * Tests:
 * - GET /api/problems/[id] - Retrieve specific problem
 * - PATCH /api/problems/[id] - Update problem
 * - DELETE /api/problems/[id] - Delete problem
 *
 * Coverage:
 * - Authentication checks
 * - Authorization (author/admin only for updates/deletes)
 * - Not found scenarios
 * - Successful operations
 * - Error handling
 */

import { NextRequest, NextResponse } from 'next/server';
import { GET, PATCH, DELETE } from '../route';
import { createStorage } from '@/server/persistence';
import { requireAuth } from '@/server/auth/api-helpers';
import type { User } from '@/server/auth/types';
import { RBACService } from '@/server/auth/rbac';

// Mock dependencies
jest.mock('@/server/persistence');
jest.mock('@/server/auth/api-helpers', () => ({
  requireAuth: jest.fn(),
  getNamespaceContext: jest.fn((req: any, user: any) => user.namespaceId || 'default'),
}));

const mockCreateStorage = createStorage as jest.MockedFunction<typeof createStorage>;
const mockRequireAuth = requireAuth as jest.MockedFunction<typeof requireAuth>;

// Helper to create auth context
function createAuthContext(user: User) {
  return {
    user,
    accessToken: 'test-access-token',
    rbac: new RBACService(user),
  };
}

describe('/api/problems/[id]', () => {
  const mockProblem = {
    id: 'problem-123',
    title: 'Test Problem',
    description: 'Test description',
    starterCode: 'def solution():\n    pass',
    testCases: [],
    authorId: 'user-1',
    classId: 'class-1',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  const mockUser = {
    id: 'user-1',
    email: 'instructor1@test.com',
    role: 'instructor' as const,
    namespaceId: 'default',
    createdAt: new Date('2025-01-01'),
  };

  const mockSession = {
    id: 'session-123',
    user: mockUser,
    expiresAt: new Date('2025-12-31'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/problems/[id]', () => {
    it('should return 401 when not authenticated', async () => {
      mockRequireAuth.mockResolvedValue(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );

      const request = new NextRequest('http://localhost/api/problems/problem-123');
      const params = { params: Promise.resolve({ id: 'problem-123' }) };

      const response = await GET(request, params);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 401 when session is invalid', async () => {
      mockRequireAuth.mockResolvedValue(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );

      const request = new NextRequest('http://localhost/api/problems/problem-123', {
        headers: { Cookie: 'sessionId=invalid' },
      });
      const params = { params: Promise.resolve({ id: 'problem-123' }) };

      const response = await GET(request, params);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 404 when problem not found', async () => {
      mockRequireAuth.mockResolvedValue(createAuthContext(mockUser));

      mockCreateStorage.mockResolvedValue({
        problems: {
          getById: jest.fn().mockResolvedValue(null),
        },
      } as any);

      const request = new NextRequest('http://localhost/api/problems/problem-123', {
        headers: { Cookie: 'sessionId=valid' },
      });
      const params = { params: Promise.resolve({ id: 'problem-123' }) };

      const response = await GET(request, params);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Problem not found');
    });

    it('should return problem when found', async () => {
      mockRequireAuth.mockResolvedValue(createAuthContext(mockUser));

      mockCreateStorage.mockResolvedValue({
        problems: {
          getById: jest.fn().mockResolvedValue(mockProblem),
        },
      } as any);

      const request = new NextRequest('http://localhost/api/problems/problem-123', {
        headers: { Cookie: 'sessionId=valid' },
      });
      const params = { params: Promise.resolve({ id: 'problem-123' }) };

      const response = await GET(request, params);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.problem).toMatchObject({
        id: 'problem-123',
        title: 'Test Problem',
      });
    });
  });

  describe('PATCH /api/problems/[id]', () => {
    it('should return 401 when not authenticated', async () => {
      mockRequireAuth.mockResolvedValue(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );

      const request = new NextRequest('http://localhost/api/problems/problem-123', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Updated' }),
      });
      const params = { params: Promise.resolve({ id: 'problem-123' }) };

      const response = await PATCH(request, params);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 404 when problem not found', async () => {
      mockRequireAuth.mockResolvedValue(createAuthContext(mockUser));

      mockCreateStorage.mockResolvedValue({
        problems: {
          getById: jest.fn().mockResolvedValue(null),
        },
      } as any);

      const request = new NextRequest('http://localhost/api/problems/problem-123', {
        method: 'PATCH',
        headers: { Cookie: 'sessionId=valid' },
        body: JSON.stringify({ title: 'Updated' }),
      });
      const params = { params: Promise.resolve({ id: 'problem-123' }) };

      const response = await PATCH(request, params);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Problem not found');
    });

    it('should return 403 when user is not author or admin', async () => {
      const otherUser = { ...mockUser, id: 'user-2' };
      mockRequireAuth.mockResolvedValue(createAuthContext(otherUser));

      mockCreateStorage.mockResolvedValue({
        problems: {
          getById: jest.fn().mockResolvedValue(mockProblem),
        },
      } as any);

      const request = new NextRequest('http://localhost/api/problems/problem-123', {
        method: 'PATCH',
        headers: { Cookie: 'sessionId=valid' },
        body: JSON.stringify({ title: 'Updated' }),
      });
      const params = { params: Promise.resolve({ id: 'problem-123' }) };

      const response = await PATCH(request, params);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Forbidden');
    });

    it('should allow author to update their own problem', async () => {
      const updatedProblem = { ...mockProblem, title: 'Updated Problem' };

      mockRequireAuth.mockResolvedValue(createAuthContext(mockUser));

      mockCreateStorage.mockResolvedValue({
        problems: {
          getById: jest.fn().mockResolvedValue(mockProblem),
          update: jest.fn().mockResolvedValue(updatedProblem),
        },
      } as any);

      const request = new NextRequest('http://localhost/api/problems/problem-123', {
        method: 'PATCH',
        headers: { Cookie: 'sessionId=valid' },
        body: JSON.stringify({ title: 'Updated Problem' }),
      });
      const params = { params: Promise.resolve({ id: 'problem-123' }) };

      const response = await PATCH(request, params);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.problem.title).toBe('Updated Problem');
    });

    it('should allow namespace-admin to update any problem', async () => {
      const adminUser = { ...mockUser, id: 'admin-1', role: 'namespace-admin' as const, namespaceId: 'default' };
      const updatedProblem = { ...mockProblem, title: 'Updated by Admin' };

      mockRequireAuth.mockResolvedValue(createAuthContext(adminUser));

      mockCreateStorage.mockResolvedValue({
        problems: {
          getById: jest.fn().mockResolvedValue(mockProblem),
          update: jest.fn().mockResolvedValue(updatedProblem),
        },
      } as any);

      const request = new NextRequest('http://localhost/api/problems/problem-123', {
        method: 'PATCH',
        headers: { Cookie: 'sessionId=valid' },
        body: JSON.stringify({ title: 'Updated by Admin' }),
      });
      const params = { params: Promise.resolve({ id: 'problem-123' }) };

      const response = await PATCH(request, params);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.problem.title).toBe('Updated by Admin');
    });

    it('should handle validation errors from storage', async () => {
      mockRequireAuth.mockResolvedValue(createAuthContext(mockUser));

      const validationError = new Error('Invalid title');
      (validationError as any).code = 'INVALID_DATA';
      (validationError as any).details = { field: 'title' };

      mockCreateStorage.mockResolvedValue({
        problems: {
          getById: jest.fn().mockResolvedValue(mockProblem),
          update: jest.fn().mockRejectedValue(validationError),
        },
      } as any);

      const request = new NextRequest('http://localhost/api/problems/problem-123', {
        method: 'PATCH',
        headers: { Cookie: 'sessionId=valid' },
        body: JSON.stringify({ title: '' }),
      });
      const params = { params: Promise.resolve({ id: 'problem-123' }) };

      const response = await PATCH(request, params);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid title');
      expect(data.details).toEqual({ field: 'title' });
    });
  });

  describe('DELETE /api/problems/[id]', () => {
    it('should return 401 when not authenticated', async () => {
      mockRequireAuth.mockResolvedValue(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );

      const request = new NextRequest('http://localhost/api/problems/problem-123', {
        method: 'DELETE',
      });
      const params = { params: Promise.resolve({ id: 'problem-123' }) };

      const response = await DELETE(request, params);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 404 when problem not found', async () => {
      mockRequireAuth.mockResolvedValue(createAuthContext(mockUser));

      mockCreateStorage.mockResolvedValue({
        problems: {
          getById: jest.fn().mockResolvedValue(null),
        },
      } as any);

      const request = new NextRequest('http://localhost/api/problems/problem-123', {
        method: 'DELETE',
        headers: { Cookie: 'sessionId=valid' },
      });
      const params = { params: Promise.resolve({ id: 'problem-123' }) };

      const response = await DELETE(request, params);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Problem not found');
    });

    it('should return 403 when user is not author or admin', async () => {
      const otherUser = { ...mockUser, id: 'user-2', namespaceId: 'default' };
      mockRequireAuth.mockResolvedValue(createAuthContext(otherUser));

      mockCreateStorage.mockResolvedValue({
        problems: {
          getById: jest.fn().mockResolvedValue(mockProblem),
        },
      } as any);

      const request = new NextRequest('http://localhost/api/problems/problem-123', {
        method: 'DELETE',
        headers: { Cookie: 'sessionId=valid' },
      });
      const params = { params: Promise.resolve({ id: 'problem-123' }) };

      const response = await DELETE(request, params);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Forbidden');
    });

    it('should allow author to delete their own problem', async () => {
      mockRequireAuth.mockResolvedValue(createAuthContext(mockUser));

      mockCreateStorage.mockResolvedValue({
        problems: {
          getById: jest.fn().mockResolvedValue(mockProblem),
          delete: jest.fn().mockResolvedValue(undefined),
        },
      } as any);

      const request = new NextRequest('http://localhost/api/problems/problem-123', {
        method: 'DELETE',
        headers: { Cookie: 'sessionId=valid' },
      });
      const params = { params: Promise.resolve({ id: 'problem-123' }) };

      const response = await DELETE(request, params);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should allow namespace-admin to delete any problem', async () => {
      const adminUser = { ...mockUser, id: 'admin-1', role: 'namespace-admin' as const, namespaceId: 'default' };

      mockRequireAuth.mockResolvedValue(createAuthContext(adminUser));

      mockCreateStorage.mockResolvedValue({
        problems: {
          getById: jest.fn().mockResolvedValue(mockProblem),
          delete: jest.fn().mockResolvedValue(undefined),
        },
      } as any);

      const request = new NextRequest('http://localhost/api/problems/problem-123', {
        method: 'DELETE',
        headers: { Cookie: 'sessionId=valid' },
      });
      const params = { params: Promise.resolve({ id: 'problem-123' }) };

      const response = await DELETE(request, params);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });
});

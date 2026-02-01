/**
 * Unit tests for classes API routes
 * Tests GET /api/classes and POST /api/classes endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { GET, POST } from '../route';

// Mock dependencies
jest.mock('@/server/auth', () => ({
  getAuthProvider: jest.fn(),
}));

jest.mock('@/server/classes', () => ({
  getClassRepository: jest.fn(),
}));

jest.mock('@/server/auth/api-helpers', () => ({
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
  getNamespaceContext: jest.fn((req: any, user: any) => user.namespaceId || 'default'),
}));

import { getAuthProvider } from '@/server/auth';
import { getClassRepository } from '@/server/classes';
import { requireAuth, requirePermission } from '@/server/auth/api-helpers';
import type { User } from '@/server/auth/types';
import { RBACService } from '@/server/auth/rbac';

// Test helper to create mock auth context
function createAuthContext(user: User) {
  return {
    user,
    accessToken: 'test-access-token',
    rbac: new RBACService(user),
  };
}

describe('/api/classes', () => {
  const mockAuthProvider = {
    getSession: jest.fn(),
  };

  const mockClassRepo = {
    listClasses: jest.fn(),
    createClass: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthProvider as jest.Mock).mockResolvedValue(mockAuthProvider);
    (getClassRepository as jest.Mock).mockReturnValue(mockClassRepo);
  });

  describe('GET /api/classes', () => {
    it('should return 401 if not authenticated', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      );

      const request = new NextRequest('http://localhost/api/classes');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Not authenticated');
    });

    it('should return 401 if session expired', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'Session expired' }, { status: 401 })
      );

      const request = new NextRequest('http://localhost/api/classes', {
        headers: { Cookie: 'sessionId=test-session' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Session expired');
    });

    it('should return classes for authenticated instructor', async () => {
      const user: User = {
        id: 'instructor-1',
        email: "test@example.com",
        role: 'instructor',
        namespaceId: 'default',
        createdAt: new Date(),
      };
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));

      const mockClasses = [
        { id: 'class-1', name: 'CS 101', description: 'Intro', createdBy: 'instructor-1', createdAt: new Date(), updatedAt: new Date() },
        { id: 'class-2', name: 'CS 201', description: 'Advanced', createdBy: 'instructor-1', createdAt: new Date(), updatedAt: new Date() },
      ];
      mockClassRepo.listClasses.mockResolvedValue(mockClasses);

      const request = new NextRequest('http://localhost/api/classes', {
        headers: { Cookie: 'sessionId=test-session' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.classes).toHaveLength(2);
      expect(data.classes[0]).toMatchObject({ id: 'class-1', name: 'CS 101', description: 'Intro' });
      expect(mockClassRepo.listClasses).toHaveBeenCalledWith('instructor-1', 'default');
    });
  });

  describe('POST /api/classes', () => {
    it('should return 401 if not authenticated', async () => {
      (requirePermission as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      );

      const request = new NextRequest('http://localhost/api/classes', {
        method: 'POST',
        body: JSON.stringify({ name: 'CS 101' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Not authenticated');
      expect(requirePermission).toHaveBeenCalledWith(request, 'session.create');
    });

    it('should return 403 if user is not an instructor', async () => {
      (requirePermission as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      );

      const request = new NextRequest('http://localhost/api/classes', {
        method: 'POST',
        headers: { Cookie: 'sessionId=test-session' },
        body: JSON.stringify({ name: 'CS 101' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(requirePermission).toHaveBeenCalledWith(request, 'session.create');
    });

    it('should return 400 if name is missing', async () => {
      const user: User = {
        id: 'instructor-1',
        email: "test@example.com",
        role: 'instructor',
        namespaceId: 'default',
        createdAt: new Date(),
      };
      (requirePermission as jest.Mock).mockResolvedValue(createAuthContext(user));

      const request = new NextRequest('http://localhost/api/classes', {
        method: 'POST',
        headers: { Cookie: 'sessionId=test-session' },
        body: JSON.stringify({ description: 'No name' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Class name is required');
      expect(requirePermission).toHaveBeenCalledWith(request, 'session.create');
    });

    it('should create class with valid data', async () => {
      const user: User = {
        id: 'instructor-1',
        email: "test@example.com",
        role: 'instructor',
        namespaceId: 'default',
        createdAt: new Date(),
      };
      (requirePermission as jest.Mock).mockResolvedValue(createAuthContext(user));

      const newClass = {
        id: 'class-1',
        name: 'CS 101',
        description: 'Introduction to Programming',
        createdBy: 'instructor-1',
        namespaceId: 'default',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockClassRepo.createClass.mockResolvedValue(newClass);

      const request = new NextRequest('http://localhost/api/classes', {
        method: 'POST',
        headers: { Cookie: 'sessionId=test-session' },
        body: JSON.stringify({ name: 'CS 101', description: 'Introduction to Programming' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.class).toMatchObject({ id: 'class-1', name: 'CS 101', description: 'Introduction to Programming' });
      expect(mockClassRepo.createClass).toHaveBeenCalledWith({
        name: 'CS 101',
        description: 'Introduction to Programming',
        createdBy: 'instructor-1',
        namespaceId: 'default',
      });
    });

    it('should trim whitespace from inputs', async () => {
      const user: User = {
        id: 'instructor-1',
        email: "test@example.com",
        role: 'instructor',
        namespaceId: 'default',
        createdAt: new Date(),
      };
      (requirePermission as jest.Mock).mockResolvedValue(createAuthContext(user));

      mockClassRepo.createClass.mockResolvedValue({
        id: 'class-1',
        name: 'CS 101',
        description: 'Test',
        createdBy: 'instructor-1',
        namespaceId: 'default',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new NextRequest('http://localhost/api/classes', {
        method: 'POST',
        headers: { Cookie: 'sessionId=test-session' },
        body: JSON.stringify({ name: '  CS 101  ', description: '  Test  ' }),
      });

      await POST(request);

      expect(mockClassRepo.createClass).toHaveBeenCalledWith({
        name: 'CS 101',
        description: 'Test',
        createdBy: 'instructor-1',
        namespaceId: 'default',
      });
    });
  });
});

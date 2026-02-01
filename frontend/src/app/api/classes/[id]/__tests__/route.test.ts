/**
 * Unit tests for /api/classes/[id] routes
 * Tests GET, PUT, DELETE endpoints with focus on cross-instructor access control
 */

import { NextRequest, NextResponse } from 'next/server';
import { GET, PUT, DELETE } from '../route';

// Mock dependencies
jest.mock('@/server/auth', () => ({
  getAuthProvider: jest.fn(),
}));

jest.mock('@/server/classes', () => ({
  getClassRepository: jest.fn(),
  getMembershipRepository: jest.fn(),
}));

jest.mock('@/server/auth/api-helpers', () => ({
  requireAuth: jest.fn(),
  getNamespaceContext: jest.fn((req: any, user: any) => user.namespaceId || 'default'),
}));

import { getClassRepository, getMembershipRepository } from '@/server/classes';
import { requireAuth } from '@/server/auth/api-helpers';
import type { User } from '@/server/auth/types';
import { RBACService } from '@/server/auth/rbac';

// Test users
const instructorA: User = {
  id: 'instructor-a',
  email: 'alice@example.com',
  role: 'instructor',
  namespaceId: 'default',
  createdAt: new Date(),
};

const instructorB: User = {
  id: 'instructor-b',
  email: 'bob@example.com',
  role: 'instructor',
  namespaceId: 'default',
  createdAt: new Date(),
};

const studentUser: User = {
  id: 'student-1',
  email: 'student@example.com',
  role: 'student',
  namespaceId: 'default',
  createdAt: new Date(),
};

function createAuthContext(user: User) {
  return {
    user,
    sessionId: 'test-session',
    rbac: new RBACService(user),
  };
}

describe('/api/classes/[id]', () => {
  const mockClassRepo = {
    getClass: jest.fn(),
    getClassSections: jest.fn(),
    updateClass: jest.fn(),
    deleteClass: jest.fn(),
  };

  const mockMembershipRepo = {
    getSectionMembers: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getClassRepository as jest.Mock).mockReturnValue(mockClassRepo);
    (getMembershipRepository as jest.Mock).mockReturnValue(mockMembershipRepo);
    // Default: no sections means no membership queries needed
    mockClassRepo.getClassSections.mockResolvedValue([]);
    mockMembershipRepo.getSectionMembers.mockResolvedValue([]);
  });

  // Class owned by instructor A
  const instructorAClass = {
    id: 'class-a',
    name: 'CS 101',
    description: 'Intro to CS',
    createdBy: 'instructor-a',
    namespaceId: 'default',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('GET /api/classes/[id]', () => {
    it('should return class details for any authenticated user in namespace', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(instructorB));
      mockClassRepo.getClass.mockResolvedValue(instructorAClass);
      mockClassRepo.getClassSections.mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/classes/class-a');
      const response = await GET(request, { params: Promise.resolve({ id: 'class-a' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.class.id).toBe('class-a');
    });

    it('should return 404 if class not found', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(instructorA));
      mockClassRepo.getClass.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/classes/nonexistent');
      const response = await GET(request, { params: Promise.resolve({ id: 'nonexistent' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Class not found');
    });
  });

  describe('PUT /api/classes/[id] - Cross-instructor access control', () => {
    it('should allow class owner to update their class', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(instructorA));
      mockClassRepo.getClass.mockResolvedValue(instructorAClass);
      mockClassRepo.updateClass.mockResolvedValue({
        ...instructorAClass,
        name: 'CS 101 Updated',
      });

      const request = new NextRequest('http://localhost/api/classes/class-a', {
        method: 'PUT',
        body: JSON.stringify({ name: 'CS 101 Updated' }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: 'class-a' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.class.name).toBe('CS 101 Updated');
    });

    it('should return 403 when instructor B tries to update instructor A class', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(instructorB));
      mockClassRepo.getClass.mockResolvedValue(instructorAClass);

      const request = new NextRequest('http://localhost/api/classes/class-a', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Hijacked Class' }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: 'class-a' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Only the class creator can update it');
      expect(mockClassRepo.updateClass).not.toHaveBeenCalled();
    });

    it('should return 403 when student tries to update any class', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(studentUser));
      mockClassRepo.getClass.mockResolvedValue(instructorAClass);

      const request = new NextRequest('http://localhost/api/classes/class-a', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Student Hijack' }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: 'class-a' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Only the class creator can update it');
      expect(mockClassRepo.updateClass).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/classes/[id] - Cross-instructor access control', () => {
    it('should allow class owner to delete their class (no sections)', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(instructorA));
      mockClassRepo.getClass.mockResolvedValue(instructorAClass);
      mockClassRepo.getClassSections.mockResolvedValue([]);
      mockClassRepo.deleteClass.mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost/api/classes/class-a', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'class-a' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockClassRepo.deleteClass).toHaveBeenCalledWith('class-a');
    });

    it('should return 403 when instructor B tries to delete instructor A class', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(instructorB));
      mockClassRepo.getClass.mockResolvedValue(instructorAClass);

      const request = new NextRequest('http://localhost/api/classes/class-a', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'class-a' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Only the class creator can delete it');
      expect(mockClassRepo.deleteClass).not.toHaveBeenCalled();
    });

    it('should return 403 when student tries to delete any class', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(studentUser));
      mockClassRepo.getClass.mockResolvedValue(instructorAClass);

      const request = new NextRequest('http://localhost/api/classes/class-a', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'class-a' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Only the class creator can delete it');
      expect(mockClassRepo.deleteClass).not.toHaveBeenCalled();
    });

    it('should return 400 when trying to delete class with sections', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(instructorA));
      mockClassRepo.getClass.mockResolvedValue(instructorAClass);
      mockClassRepo.getClassSections.mockResolvedValue([{ id: 'section-1' }]);

      const request = new NextRequest('http://localhost/api/classes/class-a', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'class-a' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Cannot delete class with existing sections. Delete sections first.');
      expect(mockClassRepo.deleteClass).not.toHaveBeenCalled();
    });
  });
});

/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from 'next/server';
import { GET, POST } from '../route';
import { getAuthProvider } from '@/server/auth';
import { getClassRepository, getSectionRepository, getMembershipRepository } from '@/server/classes';
import type { User } from '@/server/auth/types';
import { RBACService } from '@/server/auth/rbac';

jest.mock('@/server/auth');
jest.mock('@/server/classes');
jest.mock('@/server/auth/api-helpers', () => ({
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
  getNamespaceContext: jest.fn((req: any, user: any) => user.namespaceId || 'default'),
}));

import { requireAuth, requirePermission } from '@/server/auth/api-helpers';

// Helper to create auth context
function createAuthContext(user: User) {
  return {
    user,
    sessionId: 'test-session',
    rbac: new RBACService(user),
  };
}

describe('/api/classes/[id]/sections', () => {
  const mockGetAuthProvider = getAuthProvider as jest.MockedFunction<typeof getAuthProvider>;
  const mockGetClassRepository = getClassRepository as jest.MockedFunction<typeof getClassRepository>;
  const mockGetSectionRepository = getSectionRepository as jest.MockedFunction<typeof getSectionRepository>;
  const mockGetMembershipRepository = getMembershipRepository as jest.MockedFunction<typeof getMembershipRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET', () => {
    const mockAuthProvider = {
      getSession: jest.fn(),
    };

    const mockClassRepo = {
      getClass: jest.fn(),
    };

    const mockSectionRepo = {
      listSections: jest.fn(),
    };

    const mockMembershipRepo = {
      getSectionMembers: jest.fn(),
    };

    beforeEach(() => {
      mockGetAuthProvider.mockResolvedValue(mockAuthProvider as any);
      mockGetClassRepository.mockReturnValue(mockClassRepo as any);
      mockGetSectionRepository.mockReturnValue(mockSectionRepo as any);
      mockGetMembershipRepository.mockReturnValue(mockMembershipRepo as any);
    });

    it('should return 401 if not authenticated', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      );

      const request = new NextRequest('http://localhost/api/classes/class-1/sections');
      const params = Promise.resolve({ id: 'class-1' });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Not authenticated');
    });

    it('should return 401 if session expired', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'Session expired' }, { status: 401 })
      );

      const request = new NextRequest('http://localhost/api/classes/class-1/sections', {
        headers: { Cookie: 'sessionId=invalid-session' },
      });
      const params = Promise.resolve({ id: 'class-1' });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Session expired');
    });

    it('should return 404 if class not found', async () => {
      const user: User = {
        id: 'user-1',
        email: "test@example.com",
        role: 'instructor',
        namespaceId: 'default',
        createdAt: new Date(),
      };
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));

      const request = new NextRequest('http://localhost/api/classes/class-1/sections', {
        headers: { Cookie: 'sessionId=valid-session' },
      });
      const params = Promise.resolve({ id: 'class-1' });

      mockClassRepo.getClass.mockResolvedValue(null);

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Class not found');
    });

    it('should return empty array for class with no sections', async () => {
      const user: User = {
        id: 'user-1',
        email: 'test@example.com',
        role: 'instructor',
        namespaceId: 'default',
        createdAt: new Date(),
      };
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));

      const request = new NextRequest('http://localhost/api/classes/class-1/sections', {
        headers: { Cookie: 'sessionId=valid-session' },
      });
      const params = Promise.resolve({ id: 'class-1' });

      mockClassRepo.getClass.mockResolvedValue({
        id: 'class-1',
        name: 'CS101',
      } as any);
      mockSectionRepo.listSections.mockResolvedValue([]);

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sections).toEqual([]);
    });

    it('should return sections with counts for instructors', async () => {
      const instructor: User = {
        id: 'user-1',
        email: 'test@example.com',
        role: 'instructor',
        namespaceId: 'default',
        createdAt: new Date(),
      };
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(instructor));

      const request = new NextRequest('http://localhost/api/classes/class-1/sections', {
        headers: { Cookie: 'sessionId=valid-session' },
      });
      const params = Promise.resolve({ id: 'class-1' });

      mockClassRepo.getClass.mockResolvedValue({
        id: 'class-1',
        name: 'CS101',
      } as any);
      mockSectionRepo.listSections.mockResolvedValue([
        {
          id: 'section-1',
          classId: 'class-1',
          name: 'Section A',
          semester: 'MWF 10-11am',
        },
        {
          id: 'section-2',
          classId: 'class-1',
          name: 'Section B',
          semester: 'TTh 2-3pm',
        },
      ] as any);
      mockMembershipRepo.getSectionMembers
        .mockResolvedValueOnce([
          { id: 'student-1', username: 'student1', role: 'student' },
          { id: 'student-2', username: 'student2', role: 'student' },
        ] as any)
        .mockResolvedValueOnce([
          { id: 'student-3', username: 'student3', role: 'student' },
        ] as any);

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sections).toHaveLength(2);
      expect(data.sections[0]).toMatchObject({
        id: 'section-1',
        name: 'Section A',
        schedule: 'MWF 10-11am',
        location: '',
        studentCount: 2,
        activeSessionCount: 0,
      });
      expect(data.sections[1]).toMatchObject({
        id: 'section-2',
        name: 'Section B',
        schedule: 'TTh 2-3pm',
        location: '',
        studentCount: 1,
        activeSessionCount: 0,
      });
    });

    it('should return basic section info for students', async () => {
      const student: User = {
        id: 'user-1',
        email: 'test@example.com',
        role: 'student',
        namespaceId: 'default',
        createdAt: new Date(),
      };
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(student));

      const request = new NextRequest('http://localhost/api/classes/class-1/sections', {
        headers: { Cookie: 'sessionId=valid-session' },
      });
      const params = Promise.resolve({ id: 'class-1' });

      mockClassRepo.getClass.mockResolvedValue({
        id: 'class-1',
        name: 'CS101',
      } as any);
      mockSectionRepo.listSections.mockResolvedValue([
        {
          id: 'section-1',
          classId: 'class-1',
          name: 'Section A',
          semester: 'MWF 10-11am',
        },
      ] as any);

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sections).toEqual([
        {
          id: 'section-1',
          name: 'Section A',
          schedule: 'MWF 10-11am',
        },
      ]);
    });
  });

  describe('POST', () => {
    // Existing POST tests can stay as they are
    it('should create a section successfully', async () => {
      const instructor: User = {
        id: 'user-1',
        email: 'test@example.com',
        role: 'instructor',
        namespaceId: 'default',
        createdAt: new Date(),
      };
      (requirePermission as jest.Mock).mockResolvedValue(createAuthContext(instructor));

      const mockAuthProvider = {
        getSession: jest.fn(),
      };
      const mockClassRepo = {
        getClass: jest.fn(),
      };
      const mockSectionRepo = {
        createSection: jest.fn(),
      };
      const mockMembershipRepo = {
        addMembership: jest.fn(),
      };

      mockGetAuthProvider.mockResolvedValue(mockAuthProvider as any);
      mockGetClassRepository.mockReturnValue(mockClassRepo as any);
      mockGetSectionRepository.mockReturnValue(mockSectionRepo as any);
      mockGetMembershipRepository.mockReturnValue(mockMembershipRepo as any);

      mockClassRepo.getClass.mockResolvedValue({ id: 'class-1', name: 'CS101' } as any);
      mockSectionRepo.createSection.mockResolvedValue({
        id: 'section-1',
        classId: 'class-1',
        name: 'Section A',
      } as any);
      mockMembershipRepo.addMembership.mockResolvedValue({
        id: 'membership-1',
        userId: 'user-1',
        sectionId: 'section-1',
        role: 'instructor',
      } as any);

      const request = new NextRequest('http://localhost/api/classes/class-1/sections', {
        method: 'POST',
        headers: {
          Cookie: 'sessionId=valid-session',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Section A', semester: 'Fall 2025' }),
      });
      const params = Promise.resolve({ id: 'class-1' });

      const response = await POST(request, { params });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.section).toBeDefined();
      expect(mockSectionRepo.createSection).toHaveBeenCalled();
    });
  });
});

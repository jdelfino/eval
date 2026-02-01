/**
 * Unit tests for GET /api/sections/my
 * Tests retrieving a user's enrolled sections
 */

import { NextRequest, NextResponse } from 'next/server';
import { GET } from '../route';
import type { User } from '@/server/auth/types';
import { RBACService } from '@/server/auth/rbac';

// Mock dependencies
jest.mock('@/server/auth/api-helpers', () => ({
  requireAuth: jest.fn(),
  getNamespaceContext: jest.fn(),
}));

jest.mock('@/server/classes', () => ({
  getMembershipRepository: jest.fn(),
}));

import { requireAuth, getNamespaceContext } from '@/server/auth/api-helpers';
import { getMembershipRepository } from '@/server/classes';

// Test helper to create mock auth context
function createAuthContext(user: User) {
  return {
    user,
    sessionId: 'test-session',
    rbac: new RBACService(user),
  };
}

// Test fixture factory
function createTestUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'student@example.com',
    role: 'student',
    namespaceId: 'default',
    createdAt: new Date(),
    ...overrides,
  };
}

function createSectionWithClass(overrides: any = {}) {
  return {
    id: 'section-1',
    classId: 'class-1',
    name: 'Test Section',
    joinCode: 'ABC123',
    namespaceId: 'default',
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    class: {
      id: 'class-1',
      name: 'Introduction to Programming',
      description: 'Learn to code',
      namespaceId: 'default',
    },
    ...overrides,
  };
}

describe('GET /api/sections/my', () => {
  const mockMembershipRepo = {
    getUserSections: jest.fn(),
    getMembership: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getMembershipRepository as jest.Mock).mockReturnValue(mockMembershipRepo);
    (getNamespaceContext as jest.Mock).mockReturnValue('default');
  });

  it('should return 401 if not authenticated', async () => {
    (requireAuth as jest.Mock).mockResolvedValue(
      NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    );

    const request = new NextRequest('http://localhost/api/sections/my', {
      method: 'GET',
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Not authenticated');
  });

  it('should return empty array when user has no sections', async () => {
    const user = createTestUser();
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));
    mockMembershipRepo.getUserSections.mockResolvedValue([]);

    const request = new NextRequest('http://localhost/api/sections/my', {
      method: 'GET',
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sections).toEqual([]);
    expect(mockMembershipRepo.getUserSections).toHaveBeenCalledWith('user-1', 'default');
  });

  it('should return sections with class info and role', async () => {
    const user = createTestUser();
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));

    const sectionWithClass = createSectionWithClass();
    mockMembershipRepo.getUserSections.mockResolvedValue([sectionWithClass]);
    mockMembershipRepo.getMembership.mockResolvedValue({
      id: 'membership-1',
      userId: 'user-1',
      sectionId: 'section-1',
      role: 'student',
      joinedAt: new Date(),
    });

    const request = new NextRequest('http://localhost/api/sections/my', {
      method: 'GET',
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sections).toHaveLength(1);
    expect(data.sections[0]).toMatchObject({
      id: 'section-1',
      name: 'Test Section',
      className: 'Introduction to Programming',
      classDescription: 'Learn to code',
      role: 'student',
    });
  });

  it('should return multiple sections for a user', async () => {
    const user = createTestUser();
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));

    const section1 = createSectionWithClass({ id: 'section-1' });
    const section2 = createSectionWithClass({
      id: 'section-2',
      name: 'Section 2',
      class: { id: 'class-2', name: 'Advanced Programming', description: null, namespaceId: 'default' },
    });

    mockMembershipRepo.getUserSections.mockResolvedValue([section1, section2]);
    mockMembershipRepo.getMembership
      .mockResolvedValueOnce({ id: 'm-1', userId: 'user-1', sectionId: 'section-1', role: 'student' })
      .mockResolvedValueOnce({ id: 'm-2', userId: 'user-1', sectionId: 'section-2', role: 'student' });

    const request = new NextRequest('http://localhost/api/sections/my', {
      method: 'GET',
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sections).toHaveLength(2);
    expect(data.sections[0].id).toBe('section-1');
    expect(data.sections[1].id).toBe('section-2');
    expect(data.sections[1].classDescription).toBe('');
  });

  it('should correctly return instructor role for instructors', async () => {
    const user = createTestUser({ id: 'instructor-1', role: 'instructor' });
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));

    const sectionWithClass = createSectionWithClass();
    mockMembershipRepo.getUserSections.mockResolvedValue([sectionWithClass]);
    mockMembershipRepo.getMembership.mockResolvedValue({
      id: 'membership-1',
      userId: 'instructor-1',
      sectionId: 'section-1',
      role: 'instructor',
      joinedAt: new Date(),
    });

    const request = new NextRequest('http://localhost/api/sections/my', {
      method: 'GET',
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sections[0].role).toBe('instructor');
  });

  it('should default to student role if membership not found', async () => {
    const user = createTestUser();
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));

    const sectionWithClass = createSectionWithClass();
    mockMembershipRepo.getUserSections.mockResolvedValue([sectionWithClass]);
    mockMembershipRepo.getMembership.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/sections/my', {
      method: 'GET',
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sections[0].role).toBe('student');
  });

  it('should use correct namespace context', async () => {
    const user = createTestUser({ namespaceId: 'custom-ns' });
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));
    (getNamespaceContext as jest.Mock).mockReturnValue('custom-ns');
    mockMembershipRepo.getUserSections.mockResolvedValue([]);

    const request = new NextRequest('http://localhost/api/sections/my', {
      method: 'GET',
      headers: { 'x-namespace': 'custom-ns' },
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockMembershipRepo.getUserSections).toHaveBeenCalledWith('user-1', 'custom-ns');
  });
});

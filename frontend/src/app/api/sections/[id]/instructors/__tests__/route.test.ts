/**
 * Unit tests for POST /api/sections/[id]/instructors
 * Tests adding co-instructors to a section
 */

import { NextRequest, NextResponse } from 'next/server';
import { POST } from '../route';
import type { User } from '@/server/auth/types';
import { RBACService } from '@/server/auth/rbac';

// Mock dependencies
jest.mock('@/server/auth/api-helpers', () => ({
  requireAuth: jest.fn(),
}));

jest.mock('@/server/classes', () => ({
  getSectionRepository: jest.fn(),
  getMembershipRepository: jest.fn(),
}));

jest.mock('@/server/auth', () => ({
  getAuthProvider: jest.fn(),
  getUserRepository: jest.fn(),
}));

import { requireAuth } from '@/server/auth/api-helpers';
import { getSectionRepository, getMembershipRepository } from '@/server/classes';
import { getUserRepository } from '@/server/auth';

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
    id: 'instructor-1',
    email: 'instructor@example.com',
    role: 'instructor',
    namespaceId: 'default',
    createdAt: new Date(),
    ...overrides,
  };
}

function createTestSection(overrides: any = {}) {
  return {
    id: 'section-1',
    classId: 'class-1',
    name: 'Test Section',
    joinCode: 'ABC123',
    namespaceId: 'default',
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('POST /api/sections/[id]/instructors', () => {
  const mockSectionRepo = {
    getSection: jest.fn(),
  };

  const mockMembershipRepo = {
    addMembership: jest.fn(),
    getMembership: jest.fn(),
  };

  const mockUserRepo = {
    getUserByEmail: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getSectionRepository as jest.Mock).mockReturnValue(mockSectionRepo);
    (getMembershipRepository as jest.Mock).mockReturnValue(mockMembershipRepo);
    (getUserRepository as jest.Mock).mockReturnValue(mockUserRepo);
  });

  it('should return 401 if not authenticated', async () => {
    (requireAuth as jest.Mock).mockResolvedValue(
      NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    );

    const request = new NextRequest('http://localhost/api/sections/section-1/instructors', {
      method: 'POST',
      body: JSON.stringify({ email: 'new@example.com' }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Not authenticated');
  });

  it('should return 404 if section not found', async () => {
    const user = createTestUser();
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));
    mockSectionRepo.getSection.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/sections/nonexistent/instructors', {
      method: 'POST',
      body: JSON.stringify({ email: 'new@example.com' }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'nonexistent' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Section not found');
  });

  it('should return 403 if user does not have user.manage permission', async () => {
    const user = createTestUser({ role: 'student' });
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));

    const mockSection = createTestSection();
    mockSectionRepo.getSection.mockResolvedValue(mockSection);

    const request = new NextRequest('http://localhost/api/sections/section-1/instructors', {
      method: 'POST',
      body: JSON.stringify({ email: 'new@example.com' }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Forbidden: Requires user management permission');
  });

  it('should return 403 if user is not an instructor of the section', async () => {
    const user = createTestUser({ id: 'other-instructor' });
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));

    const mockSection = createTestSection();
    mockSectionRepo.getSection.mockResolvedValue(mockSection);
    mockMembershipRepo.getMembership.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/sections/section-1/instructors', {
      method: 'POST',
      body: JSON.stringify({ email: 'new@example.com' }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Only section instructors can add co-instructors');
  });

  it('should return 400 if email is missing', async () => {
    const user = createTestUser();
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));

    const mockSection = createTestSection();
    mockSectionRepo.getSection.mockResolvedValue(mockSection);
    mockMembershipRepo.getMembership.mockResolvedValue({
      id: 'membership-1',
      userId: 'instructor-1',
      sectionId: 'section-1',
      role: 'instructor',
      joinedAt: new Date(),
    });

    const request = new NextRequest('http://localhost/api/sections/section-1/instructors', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Email is required');
  });

  it('should return 404 if user to add not found', async () => {
    const user = createTestUser();
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));

    const mockSection = createTestSection();
    mockSectionRepo.getSection.mockResolvedValue(mockSection);
    mockMembershipRepo.getMembership.mockResolvedValue({
      id: 'membership-1',
      userId: 'instructor-1',
      sectionId: 'section-1',
      role: 'instructor',
      joinedAt: new Date(),
    });
    mockUserRepo.getUserByEmail.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/sections/section-1/instructors', {
      method: 'POST',
      body: JSON.stringify({ email: 'nonexistent@example.com' }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('User not found');
  });

  it('should return 400 if user to add is not an instructor', async () => {
    const user = createTestUser();
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));

    const mockSection = createTestSection();
    mockSectionRepo.getSection.mockResolvedValue(mockSection);
    mockMembershipRepo.getMembership.mockResolvedValue({
      id: 'membership-1',
      userId: 'instructor-1',
      sectionId: 'section-1',
      role: 'instructor',
      joinedAt: new Date(),
    });

    const studentUser = createTestUser({
      id: 'student-1',
      email: 'student@example.com',
      role: 'student',
    });
    mockUserRepo.getUserByEmail.mockResolvedValue(studentUser);

    const request = new NextRequest('http://localhost/api/sections/section-1/instructors', {
      method: 'POST',
      body: JSON.stringify({ email: 'student@example.com' }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('User must be an instructor');
  });

  it('should successfully add co-instructor', async () => {
    const user = createTestUser();
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));

    const mockSection = createTestSection();
    mockSectionRepo.getSection.mockResolvedValue(mockSection);
    mockMembershipRepo.getMembership.mockResolvedValue({
      id: 'membership-1',
      userId: 'instructor-1',
      sectionId: 'section-1',
      role: 'instructor',
      joinedAt: new Date(),
    });

    const newInstructor = createTestUser({
      id: 'new-instructor',
      email: 'newinstructor@example.com',
    });
    mockUserRepo.getUserByEmail.mockResolvedValue(newInstructor);
    mockMembershipRepo.addMembership.mockResolvedValue({
      id: 'membership-2',
      userId: 'new-instructor',
      sectionId: 'section-1',
      role: 'instructor',
    });

    const request = new NextRequest('http://localhost/api/sections/section-1/instructors', {
      method: 'POST',
      body: JSON.stringify({ email: 'newinstructor@example.com' }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.instructor).toMatchObject({ id: 'new-instructor' });
    expect(mockMembershipRepo.addMembership).toHaveBeenCalledWith({
      userId: 'new-instructor',
      sectionId: 'section-1',
      role: 'instructor',
    });
  });

  it('should normalize email (lowercase and trim)', async () => {
    const user = createTestUser();
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));

    const mockSection = createTestSection();
    mockSectionRepo.getSection.mockResolvedValue(mockSection);
    mockMembershipRepo.getMembership.mockResolvedValue({
      id: 'membership-1',
      userId: 'instructor-1',
      sectionId: 'section-1',
      role: 'instructor',
      joinedAt: new Date(),
    });
    mockUserRepo.getUserByEmail.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/sections/section-1/instructors', {
      method: 'POST',
      body: JSON.stringify({ email: '  NewInstructor@Example.COM  ' }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'section-1' }) });

    expect(mockUserRepo.getUserByEmail).toHaveBeenCalledWith('newinstructor@example.com');
  });
});

/**
 * Unit tests for DELETE /api/sections/[id]/instructors/[userId]
 * Tests removing instructors from a section
 */

import { NextRequest, NextResponse } from 'next/server';
import { DELETE } from '../route';
import type { User } from '@/server/auth/types';

// Mock dependencies
jest.mock('@/server/auth', () => ({
  getAuthProvider: jest.fn(),
}));

jest.mock('@/server/classes', () => ({
  getSectionRepository: jest.fn(),
  getMembershipRepository: jest.fn(),
}));

import { getAuthProvider } from '@/server/auth';
import { getSectionRepository, getMembershipRepository } from '@/server/classes';

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

describe('DELETE /api/sections/[id]/instructors/[userId]', () => {
  const mockAuthProvider = {
    getSessionFromRequest: jest.fn(),
  };

  const mockSectionRepo = {
    getSection: jest.fn(),
  };

  const mockMembershipRepo = {
    getMembership: jest.fn(),
    getSectionMembers: jest.fn(),
    removeMembership: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthProvider as jest.Mock).mockResolvedValue(mockAuthProvider);
    (getSectionRepository as jest.Mock).mockReturnValue(mockSectionRepo);
    (getMembershipRepository as jest.Mock).mockReturnValue(mockMembershipRepo);
  });

  it('should return 401 if not authenticated', async () => {
    mockAuthProvider.getSessionFromRequest.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/sections/section-1/instructors/user-1', {
      method: 'DELETE',
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ id: 'section-1', userId: 'user-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Not authenticated');
  });

  it('should return 401 if session has no user', async () => {
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({ user: null });

    const request = new NextRequest('http://localhost/api/sections/section-1/instructors/user-1', {
      method: 'DELETE',
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ id: 'section-1', userId: 'user-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Not authenticated');
  });

  it('should return 404 if section not found', async () => {
    const user = createTestUser();
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({ user });
    mockSectionRepo.getSection.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/sections/nonexistent/instructors/user-1', {
      method: 'DELETE',
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ id: 'nonexistent', userId: 'user-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Section not found');
  });

  it('should return 403 if user is not an instructor of the section', async () => {
    const user = createTestUser({ id: 'other-user' });
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({ user });

    const mockSection = createTestSection();
    mockSectionRepo.getSection.mockResolvedValue(mockSection);
    mockMembershipRepo.getMembership.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/sections/section-1/instructors/instructor-2', {
      method: 'DELETE',
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ id: 'section-1', userId: 'instructor-2' }),
    });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Only section instructors can remove instructors');
  });

  it('should return 400 if trying to remove the last instructor', async () => {
    const user = createTestUser();
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({ user });

    const mockSection = createTestSection();
    mockSectionRepo.getSection.mockResolvedValue(mockSection);
    mockMembershipRepo.getMembership.mockResolvedValue({
      id: 'membership-1',
      userId: 'instructor-1',
      sectionId: 'section-1',
      role: 'instructor',
      joinedAt: new Date(),
    });
    mockMembershipRepo.getSectionMembers.mockResolvedValue([
      { id: 'instructor-1', email: 'instructor@example.com', role: 'instructor' },
    ]);

    const request = new NextRequest('http://localhost/api/sections/section-1/instructors/instructor-1', {
      method: 'DELETE',
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ id: 'section-1', userId: 'instructor-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Cannot remove the last instructor from a section');
  });

  it('should successfully remove an instructor', async () => {
    const user = createTestUser();
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({ user });

    const mockSection = createTestSection();
    mockSectionRepo.getSection.mockResolvedValue(mockSection);
    mockMembershipRepo.getMembership.mockResolvedValue({
      id: 'membership-1',
      userId: 'instructor-1',
      sectionId: 'section-1',
      role: 'instructor',
      joinedAt: new Date(),
    });
    mockMembershipRepo.getSectionMembers.mockResolvedValue([
      { id: 'instructor-1', email: 'instructor@example.com', role: 'instructor' },
      { id: 'instructor-2', email: 'instructor2@example.com', role: 'instructor' },
    ]);
    mockMembershipRepo.removeMembership.mockResolvedValue(undefined);

    const request = new NextRequest('http://localhost/api/sections/section-1/instructors/instructor-2', {
      method: 'DELETE',
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ id: 'section-1', userId: 'instructor-2' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockMembershipRepo.removeMembership).toHaveBeenCalledWith('instructor-2', 'section-1');
  });

  it('should allow instructor to remove themselves when not the last instructor', async () => {
    const user = createTestUser();
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({ user });

    const mockSection = createTestSection();
    mockSectionRepo.getSection.mockResolvedValue(mockSection);
    mockMembershipRepo.getMembership.mockResolvedValue({
      id: 'membership-1',
      userId: 'instructor-1',
      sectionId: 'section-1',
      role: 'instructor',
      joinedAt: new Date(),
    });
    mockMembershipRepo.getSectionMembers.mockResolvedValue([
      { id: 'instructor-1', email: 'instructor@example.com', role: 'instructor' },
      { id: 'instructor-2', email: 'instructor2@example.com', role: 'instructor' },
    ]);

    const request = new NextRequest('http://localhost/api/sections/section-1/instructors/instructor-1', {
      method: 'DELETE',
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ id: 'section-1', userId: 'instructor-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});

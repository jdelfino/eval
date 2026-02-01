/**
 * Unit tests for DELETE /api/sections/[id]/leave
 * Tests student leaving a section
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
    id: 'student-1',
    email: 'student@example.com',
    role: 'student',
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

describe('DELETE /api/sections/[id]/leave', () => {
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

    const request = new NextRequest('http://localhost/api/sections/section-1/leave', {
      method: 'DELETE',
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Not authenticated');
  });

  it('should return 401 if session has no user', async () => {
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({ user: null });

    const request = new NextRequest('http://localhost/api/sections/section-1/leave', {
      method: 'DELETE',
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Not authenticated');
  });

  it('should return 404 if section not found', async () => {
    const user = createTestUser();
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({ user });
    mockSectionRepo.getSection.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/sections/nonexistent/leave', {
      method: 'DELETE',
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: 'nonexistent' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Section not found');
  });

  it('should return 400 if user is not a member', async () => {
    const user = createTestUser();
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({ user });

    const mockSection = createTestSection();
    mockSectionRepo.getSection.mockResolvedValue(mockSection);
    mockMembershipRepo.getMembership.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/sections/section-1/leave', {
      method: 'DELETE',
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('You are not a member of this section');
  });

  it('should return 400 if instructor is the only instructor', async () => {
    const user = createTestUser({ id: 'instructor-1', role: 'instructor' });
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({ user });

    const mockSection = createTestSection();
    mockSectionRepo.getSection.mockResolvedValue(mockSection);
    mockMembershipRepo.getMembership.mockResolvedValue({
      id: 'membership-1',
      userId: 'instructor-1',
      sectionId: 'section-1',
      role: 'instructor',
    });
    mockMembershipRepo.getSectionMembers.mockResolvedValue([
      { id: 'instructor-1', email: 'instructor@example.com', role: 'instructor' },
    ]);

    const request = new NextRequest('http://localhost/api/sections/section-1/leave', {
      method: 'DELETE',
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Cannot leave - you are the only instructor for this section');
  });

  it('should allow student to leave successfully', async () => {
    const user = createTestUser();
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({ user });

    const mockSection = createTestSection();
    mockSectionRepo.getSection.mockResolvedValue(mockSection);
    mockMembershipRepo.getMembership.mockResolvedValue({
      id: 'membership-1',
      userId: 'student-1',
      sectionId: 'section-1',
      role: 'student',
    });

    const request = new NextRequest('http://localhost/api/sections/section-1/leave', {
      method: 'DELETE',
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockMembershipRepo.removeMembership).toHaveBeenCalledWith('student-1', 'section-1');
  });

  it('should allow instructor to leave when not the only instructor', async () => {
    const user = createTestUser({ id: 'instructor-1', role: 'instructor' });
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({ user });

    const mockSection = createTestSection();
    mockSectionRepo.getSection.mockResolvedValue(mockSection);
    mockMembershipRepo.getMembership.mockResolvedValue({
      id: 'membership-1',
      userId: 'instructor-1',
      sectionId: 'section-1',
      role: 'instructor',
    });
    mockMembershipRepo.getSectionMembers.mockResolvedValue([
      { id: 'instructor-1', email: 'instructor@example.com', role: 'instructor' },
      { id: 'instructor-2', email: 'instructor2@example.com', role: 'instructor' },
    ]);

    const request = new NextRequest('http://localhost/api/sections/section-1/leave', {
      method: 'DELETE',
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockMembershipRepo.removeMembership).toHaveBeenCalledWith('instructor-1', 'section-1');
  });
});

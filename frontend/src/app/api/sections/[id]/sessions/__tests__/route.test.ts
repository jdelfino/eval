/**
 * Unit tests for GET /api/sections/[id]/sessions
 * Tests getting sessions for a section with dual authorization paths
 */

import { NextRequest, NextResponse } from 'next/server';
import { GET } from '../route';
import type { User } from '@/server/auth/types';

// Mock dependencies
jest.mock('@/server/auth', () => ({
  getAuthProvider: jest.fn(),
}));

jest.mock('@/server/classes', () => ({
  getSectionRepository: jest.fn(),
  getMembershipRepository: jest.fn(),
}));

jest.mock('@/server/persistence');

import { getAuthProvider } from '@/server/auth';
import { getSectionRepository, getMembershipRepository } from '@/server/classes';
import { createStorage } from '@/server/persistence';

// Test fixture factory
function createTestUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'user@example.com',
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

function createTestSession(overrides: any = {}) {
  return {
    id: 'session-1',
    sectionId: 'section-1',
    namespaceId: 'default',
    joinCode: 'XYZ789',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('GET /api/sections/[id]/sessions', () => {
  const mockAuthProvider = {
    getSessionFromRequest: jest.fn(),
  };

  const mockSectionRepo = {
    getSection: jest.fn(),
  };

  const mockMembershipRepo = {
    getMembership: jest.fn(),
  };

  const mockStorage = {
    sessions: {
      listAllSessions: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthProvider as jest.Mock).mockResolvedValue(mockAuthProvider);
    (getSectionRepository as jest.Mock).mockReturnValue(mockSectionRepo);
    (getMembershipRepository as jest.Mock).mockReturnValue(mockMembershipRepo);
    (createStorage as jest.Mock).mockResolvedValue(mockStorage);
  });

  it('should return 401 if not authenticated', async () => {
    mockAuthProvider.getSessionFromRequest.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/sections/section-1/sessions', {
      method: 'GET',
    });

    const response = await GET(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Not authenticated');
  });

  it('should return 401 if session has no user', async () => {
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({ user: null });

    const request = new NextRequest('http://localhost/api/sections/section-1/sessions', {
      method: 'GET',
    });

    const response = await GET(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Not authenticated');
  });

  it('should return 404 if section not found', async () => {
    const user = createTestUser();
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({ user });
    mockSectionRepo.getSection.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/sections/nonexistent/sessions', {
      method: 'GET',
    });

    const response = await GET(request, { params: Promise.resolve({ id: 'nonexistent' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Section not found');
  });

  it('should return 403 if user is not instructor and not member', async () => {
    const user = createTestUser({ id: 'random-user' });
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({ user });

    const mockSection = createTestSection();
    mockSectionRepo.getSection.mockResolvedValue(mockSection);
    mockMembershipRepo.getMembership.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/sections/section-1/sessions', {
      method: 'GET',
    });

    const response = await GET(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('You do not have access to this section');
  });

  it('should return 200 with sessions if user is section instructor via membership', async () => {
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

    const mockSessions = [
      createTestSession({ id: 'session-1' }),
      createTestSession({ id: 'session-2' }),
    ];
    mockStorage.sessions.listAllSessions.mockResolvedValue(mockSessions);

    const request = new NextRequest('http://localhost/api/sections/section-1/sessions', {
      method: 'GET',
    });

    const response = await GET(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessions).toHaveLength(2);
    expect(mockMembershipRepo.getMembership).toHaveBeenCalledWith('instructor-1', 'section-1');
    expect(mockStorage.sessions.listAllSessions).toHaveBeenCalledWith({ sectionId: 'section-1' });
  });

  it('should return 200 with sessions if user is section member (student)', async () => {
    const user = createTestUser({ id: 'student-1', role: 'student' });
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({ user });

    const mockSection = createTestSection();
    mockSectionRepo.getSection.mockResolvedValue(mockSection);
    mockMembershipRepo.getMembership.mockResolvedValue({
      id: 'membership-1',
      userId: 'student-1',
      sectionId: 'section-1',
      role: 'student',
    });

    const mockSessions = [createTestSession()];
    mockStorage.sessions.listAllSessions.mockResolvedValue(mockSessions);

    const request = new NextRequest('http://localhost/api/sections/section-1/sessions', {
      method: 'GET',
    });

    const response = await GET(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessions).toHaveLength(1);
    expect(mockMembershipRepo.getMembership).toHaveBeenCalledWith('student-1', 'section-1');
  });

  it('should return 200 if user is co-instructor', async () => {
    const user = createTestUser({ id: 'instructor-2', role: 'instructor' });
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({ user });

    const mockSection = createTestSection();
    mockSectionRepo.getSection.mockResolvedValue(mockSection);
    mockMembershipRepo.getMembership.mockResolvedValue({
      id: 'membership-2',
      userId: 'instructor-2',
      sectionId: 'section-1',
      role: 'instructor',
    });

    const mockSessions = [createTestSession()];
    mockStorage.sessions.listAllSessions.mockResolvedValue(mockSessions);

    const request = new NextRequest('http://localhost/api/sections/section-1/sessions', {
      method: 'GET',
    });

    const response = await GET(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessions).toHaveLength(1);
  });

  it('should return empty array when no sessions exist', async () => {
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
    mockStorage.sessions.listAllSessions.mockResolvedValue([]);

    const request = new NextRequest('http://localhost/api/sections/section-1/sessions', {
      method: 'GET',
    });

    const response = await GET(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessions).toEqual([]);
  });

  it('should filter sessions by sectionId', async () => {
    const user = createTestUser({ id: 'instructor-1', role: 'instructor' });
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({ user });

    const mockSection = createTestSection({ id: 'specific-section' });
    mockSectionRepo.getSection.mockResolvedValue(mockSection);
    mockMembershipRepo.getMembership.mockResolvedValue({
      id: 'membership-1',
      userId: 'instructor-1',
      sectionId: 'specific-section',
      role: 'instructor',
    });
    mockStorage.sessions.listAllSessions.mockResolvedValue([]);

    const request = new NextRequest('http://localhost/api/sections/specific-section/sessions', {
      method: 'GET',
    });

    await GET(request, { params: Promise.resolve({ id: 'specific-section' }) });

    expect(mockStorage.sessions.listAllSessions).toHaveBeenCalledWith({ sectionId: 'specific-section' });
  });

  it('should allow member with instructor role in membership to access', async () => {
    const user = createTestUser({ id: 'user-1', role: 'instructor' });
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({ user });

    // User has membership with instructor role
    const mockSection = createTestSection();
    mockSectionRepo.getSection.mockResolvedValue(mockSection);
    mockMembershipRepo.getMembership.mockResolvedValue({
      id: 'membership-1',
      userId: 'user-1',
      sectionId: 'section-1',
      role: 'instructor',
    });

    mockStorage.sessions.listAllSessions.mockResolvedValue([]);

    const request = new NextRequest('http://localhost/api/sections/section-1/sessions', {
      method: 'GET',
    });

    const response = await GET(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
  });
});

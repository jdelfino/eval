/**
 * Unit tests for /api/sections/[id] - GET, PUT, DELETE
 * Tests section management endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { GET, PUT, DELETE } from '../route';
import type { User } from '@/server/auth/types';
import { RBACService } from '@/server/auth/rbac';

// Mock dependencies
jest.mock('@/server/auth/api-helpers', () => ({
  requireAuth: jest.fn(),
  getNamespaceContext: jest.fn(),
}));

jest.mock('@/server/classes', () => ({
  getSectionRepository: jest.fn(),
  getMembershipRepository: jest.fn(),
}));

import { requireAuth, getNamespaceContext } from '@/server/auth/api-helpers';
import { getSectionRepository, getMembershipRepository } from '@/server/classes';

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
    email: 'test@example.com',
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

describe('GET /api/sections/[id]', () => {
  const mockSectionRepo = {
    getSection: jest.fn(),
  };

  const mockMembershipRepo = {
    getSectionMembers: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getSectionRepository as jest.Mock).mockReturnValue(mockSectionRepo);
    (getMembershipRepository as jest.Mock).mockReturnValue(mockMembershipRepo);
    (getNamespaceContext as jest.Mock).mockReturnValue('default');
  });

  it('should return 401 if not authenticated', async () => {
    (requireAuth as jest.Mock).mockResolvedValue(
      NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    );

    const request = new NextRequest('http://localhost/api/sections/section-1', {
      method: 'GET',
    });

    const response = await GET(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Not authenticated');
  });

  it('should return 404 if section not found', async () => {
    const user = createTestUser();
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));
    mockSectionRepo.getSection.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/sections/nonexistent', {
      method: 'GET',
    });

    const response = await GET(request, { params: Promise.resolve({ id: 'nonexistent' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Section not found');
  });

  it('should return section with members on success', async () => {
    const user = createTestUser();
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));

    const mockSection = createTestSection();
    mockSectionRepo.getSection.mockResolvedValue(mockSection);

    const mockMembers = [
      { id: 'member-1', userId: 'user-1', sectionId: 'section-1', role: 'instructor' },
      { id: 'member-2', userId: 'user-2', sectionId: 'section-1', role: 'student' },
    ];
    mockMembershipRepo.getSectionMembers.mockResolvedValue(mockMembers);

    const request = new NextRequest('http://localhost/api/sections/section-1', {
      method: 'GET',
    });

    const response = await GET(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.section).toMatchObject({ id: 'section-1', name: 'Test Section' });
    expect(data.members).toHaveLength(2);
    expect(mockSectionRepo.getSection).toHaveBeenCalledWith('section-1', 'default');
  });
});

describe('PUT /api/sections/[id]', () => {
  const mockSectionRepo = {
    getSection: jest.fn(),
    updateSection: jest.fn(),
  };

  const mockMembershipRepo = {
    getMembership: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getSectionRepository as jest.Mock).mockReturnValue(mockSectionRepo);
    (getMembershipRepository as jest.Mock).mockReturnValue(mockMembershipRepo);
    (getNamespaceContext as jest.Mock).mockReturnValue('default');
  });

  it('should return 401 if not authenticated', async () => {
    (requireAuth as jest.Mock).mockResolvedValue(
      NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    );

    const request = new NextRequest('http://localhost/api/sections/section-1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated Section' }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Not authenticated');
  });

  it('should return 404 if section not found', async () => {
    const user = createTestUser();
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));
    mockSectionRepo.getSection.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/sections/nonexistent', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated Section' }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: 'nonexistent' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Section not found');
  });

  it('should return 403 if user is not an instructor of the section', async () => {
    const user = createTestUser({ id: 'other-user' });
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));

    const mockSection = createTestSection();
    mockSectionRepo.getSection.mockResolvedValue(mockSection);
    mockMembershipRepo.getMembership.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/sections/section-1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated Section' }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Only section instructors can update it');
  });

  it('should update section name successfully', async () => {
    const user = createTestUser();
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));

    const mockSection = createTestSection();
    mockSectionRepo.getSection.mockResolvedValue(mockSection);
    mockMembershipRepo.getMembership.mockResolvedValue({
      id: 'membership-1',
      userId: 'user-1',
      sectionId: 'section-1',
      role: 'instructor',
      joinedAt: new Date(),
    });

    const updatedSection = { ...mockSection, name: 'Updated Section' };
    mockSectionRepo.updateSection.mockResolvedValue(updatedSection);

    const request = new NextRequest('http://localhost/api/sections/section-1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated Section' }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.section.name).toBe('Updated Section');
    expect(mockSectionRepo.updateSection).toHaveBeenCalledWith('section-1', { name: 'Updated Section' });
  });

  it('should update section semester successfully', async () => {
    const user = createTestUser();
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));

    const mockSection = createTestSection();
    mockSectionRepo.getSection.mockResolvedValue(mockSection);
    mockMembershipRepo.getMembership.mockResolvedValue({
      id: 'membership-1',
      userId: 'user-1',
      sectionId: 'section-1',
      role: 'instructor',
      joinedAt: new Date(),
    });

    const updatedSection = { ...mockSection, semester: 'Fall 2025' };
    mockSectionRepo.updateSection.mockResolvedValue(updatedSection);

    const request = new NextRequest('http://localhost/api/sections/section-1', {
      method: 'PUT',
      body: JSON.stringify({ semester: 'Fall 2025' }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockSectionRepo.updateSection).toHaveBeenCalledWith('section-1', { semester: 'Fall 2025' });
  });

  it('should trim whitespace from name and semester', async () => {
    const user = createTestUser();
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));

    const mockSection = createTestSection();
    mockSectionRepo.getSection.mockResolvedValue(mockSection);
    mockMembershipRepo.getMembership.mockResolvedValue({
      id: 'membership-1',
      userId: 'user-1',
      sectionId: 'section-1',
      role: 'instructor',
      joinedAt: new Date(),
    });

    const updatedSection = { ...mockSection, name: 'Trimmed Name', semester: 'Trimmed Semester' };
    mockSectionRepo.updateSection.mockResolvedValue(updatedSection);

    const request = new NextRequest('http://localhost/api/sections/section-1', {
      method: 'PUT',
      body: JSON.stringify({ name: '  Trimmed Name  ', semester: '  Trimmed Semester  ' }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: 'section-1' }) });

    expect(response.status).toBe(200);
    expect(mockSectionRepo.updateSection).toHaveBeenCalledWith('section-1', {
      name: 'Trimmed Name',
      semester: 'Trimmed Semester',
    });
  });
});

describe('DELETE /api/sections/[id]', () => {
  const mockSectionRepo = {
    getSection: jest.fn(),
    deleteSection: jest.fn(),
  };

  const mockMembershipRepo = {
    getMembership: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getSectionRepository as jest.Mock).mockReturnValue(mockSectionRepo);
    (getMembershipRepository as jest.Mock).mockReturnValue(mockMembershipRepo);
    (getNamespaceContext as jest.Mock).mockReturnValue('default');
  });

  it('should return 401 if not authenticated', async () => {
    (requireAuth as jest.Mock).mockResolvedValue(
      NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    );

    const request = new NextRequest('http://localhost/api/sections/section-1', {
      method: 'DELETE',
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Not authenticated');
  });

  it('should return 404 if section not found', async () => {
    const user = createTestUser();
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));
    mockSectionRepo.getSection.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/sections/nonexistent', {
      method: 'DELETE',
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: 'nonexistent' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Section not found');
  });

  it('should return 403 if user is not an instructor of the section', async () => {
    const user = createTestUser({ id: 'other-user' });
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));

    const mockSection = createTestSection();
    mockSectionRepo.getSection.mockResolvedValue(mockSection);
    mockMembershipRepo.getMembership.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/sections/section-1', {
      method: 'DELETE',
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Only section instructors can delete it');
  });

  it('should delete section successfully', async () => {
    const user = createTestUser();
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));

    const mockSection = createTestSection();
    mockSectionRepo.getSection.mockResolvedValue(mockSection);
    mockMembershipRepo.getMembership.mockResolvedValue({
      id: 'membership-1',
      userId: 'user-1',
      sectionId: 'section-1',
      role: 'instructor',
      joinedAt: new Date(),
    });
    mockSectionRepo.deleteSection.mockResolvedValue(undefined);

    const request = new NextRequest('http://localhost/api/sections/section-1', {
      method: 'DELETE',
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockSectionRepo.deleteSection).toHaveBeenCalledWith('section-1');
  });

  it('should allow deletion when user is one of multiple instructors', async () => {
    const user = createTestUser({ id: 'instructor-2' });
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));

    const mockSection = createTestSection();
    mockSectionRepo.getSection.mockResolvedValue(mockSection);
    mockMembershipRepo.getMembership.mockResolvedValue({
      id: 'membership-2',
      userId: 'instructor-2',
      sectionId: 'section-1',
      role: 'instructor',
      joinedAt: new Date(),
    });
    mockSectionRepo.deleteSection.mockResolvedValue(undefined);

    const request = new NextRequest('http://localhost/api/sections/section-1', {
      method: 'DELETE',
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: 'section-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});

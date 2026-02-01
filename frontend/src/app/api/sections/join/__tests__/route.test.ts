/**
 * Unit tests for POST /api/sections/join
 * Tests student joining sections via join code
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

import { requireAuth } from '@/server/auth/api-helpers';
import { getSectionRepository, getMembershipRepository } from '@/server/classes';

// Test helper to create mock auth context
function createAuthContext(user: User) {
  return {
    user,
    sessionId: 'test-session',
    rbac: new RBACService(user),
  };
}

describe('POST /api/sections/join', () => {
  const mockSectionRepo = {
    getSectionByJoinCode: jest.fn(),
  };

  const mockMembershipRepo = {
    addMembership: jest.fn(),
    getMembership: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getSectionRepository as jest.Mock).mockReturnValue(mockSectionRepo);
    (getMembershipRepository as jest.Mock).mockReturnValue(mockMembershipRepo);
  });

  it('should return 401 if not authenticated', async () => {
    (requireAuth as jest.Mock).mockResolvedValue(
      NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    );

    const request = new NextRequest('http://localhost/api/sections/join', {
      method: 'POST',
      body: JSON.stringify({ joinCode: 'TEST123' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Not authenticated');
  });

  it('should return 400 if join code is missing', async () => {
    const user: User = {
      id: 'student-1',
        email: "test@example.com",
      role: 'student',
      namespaceId: 'default',
      createdAt: new Date(),
    };
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));

    const request = new NextRequest('http://localhost/api/sections/join', {
      method: 'POST',
      headers: { Cookie: 'sessionId=test-session' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Join code is required');
  });

  it('should return 404 if join code is invalid', async () => {
    const user: User = {
      id: 'student-1',
      email: 'test@example.com',
      role: 'student',
      namespaceId: 'default',
      createdAt: new Date(),
    };
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));
    mockSectionRepo.getSectionByJoinCode.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/sections/join', {
      method: 'POST',
      headers: { Cookie: 'sessionId=test-session' },
      body: JSON.stringify({ joinCode: 'INVALID' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Invalid join code');
  });

  it('should return 400 if already enrolled', async () => {
    const user: User = {
      id: 'student-1',
      email: 'test@example.com',
      role: 'student',
      namespaceId: 'default',
      createdAt: new Date(),
    };
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));

    const mockSection = {
      id: 'section-1',
      classId: 'class-1',
      name: 'Section A',
      joinCode: 'TEST123',
      namespaceId: 'default',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockSectionRepo.getSectionByJoinCode.mockResolvedValue(mockSection);

    const existingMembership = {
      id: 'membership-1',
      sectionId: 'section-1',
      userId: 'student-1',
      joinedAt: new Date(),
    };
    mockMembershipRepo.getMembership.mockResolvedValue(existingMembership);

    const request = new NextRequest('http://localhost/api/sections/join', {
      method: 'POST',
      headers: { Cookie: 'sessionId=test-session' },
      body: JSON.stringify({ joinCode: 'TEST123' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.error).toBe('You are already a member of this section');
  });

  it('should successfully join section with valid code', async () => {
    const user: User = {
      id: 'student-1',
      email: 'test@example.com',
      role: 'student',
      namespaceId: 'default',
      createdAt: new Date(),
    };
    (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(user));

    const mockSection = {
      id: 'section-1',
      classId: 'class-1',
      name: 'Section A',
      joinCode: 'TEST123',
      namespaceId: 'default',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockSectionRepo.getSectionByJoinCode.mockResolvedValue(mockSection);
    mockMembershipRepo.getMembership.mockResolvedValue(null);
    const newMembership = {
      id: 'membership-1',
      sectionId: 'section-1',
      userId: 'student-1',
      joinedAt: new Date(),
    };
    mockMembershipRepo.addMembership.mockResolvedValue(newMembership);

    const request = new NextRequest('http://localhost/api/sections/join', {
      method: 'POST',
      headers: { Cookie: 'sessionId=test-session' },
      body: JSON.stringify({ joinCode: 'TEST123' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.section).toMatchObject({ id: 'section-1', name: 'Section A' });
    expect(mockMembershipRepo.addMembership).toHaveBeenCalledWith({
      sectionId: 'section-1',
      userId: 'student-1',
      role: 'student',
    });
  });

  // Note: Join code normalization (uppercase, trim) is tested in
  // src/server/classes/__tests__/join-code-service.test.ts
});

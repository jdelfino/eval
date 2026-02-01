/**
 * Tests for /api/admin/stats endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { GET } from '../route';

jest.mock('@/server/auth/api-helpers', () => ({
  requirePermission: jest.fn(),
  getNamespaceContext: jest.fn(),
}));

jest.mock('@/server/auth/instance', () => ({
  getAuthProvider: jest.fn(),
}));

jest.mock('@/server/classes', () => ({
  getSectionRepository: jest.fn(),
  getMembershipRepository: jest.fn(),
}));

jest.mock('@/server/persistence', () => ({
  createStorage: jest.fn(),
}));

import { requirePermission, getNamespaceContext } from '@/server/auth/api-helpers';
import { getAuthProvider } from '@/server/auth/instance';
import { getSectionRepository } from '@/server/classes';
import { createStorage } from '@/server/persistence';

describe('GET /api/admin/stats', () => {
  const mockSystemAdmin = {
    id: 'admin-1',
    email: 'admin@example.com',
    role: 'system-admin' as const,
    createdAt: new Date('2024-01-01'),
  };

  const mockUsers = [
    { id: 'u1', role: 'instructor' },
    { id: 'u2', role: 'student' },
    { id: 'u3', role: 'student' },
  ];

  let mockUserRepo: { listUsers: jest.Mock };
  let mockAuthProvider: { userRepository: typeof mockUserRepo; getAllUsers: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    (requirePermission as jest.Mock).mockResolvedValue({
      user: mockSystemAdmin,
      rbac: { hasPermission: () => true },
      accessToken: 'test-token',
    });

    mockUserRepo = { listUsers: jest.fn().mockResolvedValue(mockUsers) };
    mockAuthProvider = {
      userRepository: mockUserRepo,
      getAllUsers: jest.fn().mockResolvedValue(mockUsers),
    };
    (getAuthProvider as jest.Mock).mockResolvedValue(mockAuthProvider);

    (getSectionRepository as jest.Mock).mockReturnValue({
      listSections: jest.fn().mockResolvedValue([
        { id: 's1', classId: 'c1' },
        { id: 's2', classId: 'c1' },
      ]),
    });

    (createStorage as jest.Mock).mockResolvedValue({
      sessions: { countSessions: jest.fn().mockResolvedValue(5) },
    });
  });

  it('returns 401 when not authenticated', async () => {
    (requirePermission as jest.Mock).mockResolvedValue(
      NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    );

    const request = new NextRequest('http://localhost/api/admin/stats');
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('filters users, sections, and sessions by namespace when namespaceId is provided', async () => {
    const mockListSections = jest.fn().mockResolvedValue([
      { id: 's1', classId: 'c1' },
    ]);
    (getSectionRepository as jest.Mock).mockReturnValue({
      listSections: mockListSections,
    });

    const mockListActiveSessions = jest.fn().mockResolvedValue([
      { id: 'sess1' }, { id: 'sess2' },
    ]);
    (createStorage as jest.Mock).mockResolvedValue({
      sessions: {
        countSessions: jest.fn().mockResolvedValue(5),
        listActiveSessions: mockListActiveSessions,
      },
    });

    (getNamespaceContext as jest.Mock).mockReturnValue('ns-1');

    const request = new NextRequest('http://localhost/api/admin/stats?namespace=ns-1');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    // Should call listUsers with namespace filter, NOT getAllUsers
    expect(mockUserRepo.listUsers).toHaveBeenCalledWith(undefined, 'ns-1');
    expect(mockAuthProvider.getAllUsers).not.toHaveBeenCalled();
    // Sections should be filtered by namespace
    expect(mockListSections).toHaveBeenCalledWith(undefined, 'ns-1');
    // Sessions should use listActiveSessions with namespace, not countSessions
    expect(mockListActiveSessions).toHaveBeenCalledWith('ns-1');
    expect(data.sections.total).toBe(1);
    expect(data.sessions.active).toBe(2);
  });

  it('returns all users when namespaceId is undefined (all namespaces)', async () => {
    (getNamespaceContext as jest.Mock).mockReturnValue(undefined);

    const request = new NextRequest('http://localhost/api/admin/stats');
    const response = await GET(request);

    expect(response.status).toBe(200);
    // Should call getAllUsers, NOT listUsers
    expect(mockAuthProvider.getAllUsers).toHaveBeenCalled();
    expect(mockUserRepo.listUsers).not.toHaveBeenCalled();
  });

  it('returns stats with correct structure', async () => {
    (getNamespaceContext as jest.Mock).mockReturnValue(undefined);

    const request = new NextRequest('http://localhost/api/admin/stats');
    const response = await GET(request);
    const data = await response.json();

    expect(data.users.total).toBe(3);
    expect(data.users.byRole.instructor).toBe(1);
    expect(data.users.byRole.student).toBe(2);
    expect(data.classes.total).toBe(1); // 2 sections, 1 unique classId
    expect(data.sections.total).toBe(2);
    expect(data.sessions.active).toBe(5);
  });
});

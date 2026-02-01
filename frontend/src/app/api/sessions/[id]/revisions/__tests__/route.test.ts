import { NextRequest, NextResponse } from 'next/server';
import { GET } from '../route';
import { getAuthProvider } from '@/server/auth';
import { createStorage } from '@/server/persistence';
import type { User } from '@/server/auth/types';

// Mock dependencies
jest.mock('@/server/auth');
jest.mock('@/server/persistence');

describe('GET /api/sessions/[sessionId]/revisions', () => {
  const mockUser: User = {
    id: 'instructor-1',
    email: 'instructor@example.com',
    role: 'instructor' as const,
    namespaceId: 'default',
    createdAt: new Date('2024-01-01'),
  };

  const mockRevisions = [
    {
      id: 'rev-1',
      sessionId: 'session-1',
      studentId: 'student-1',
      timestamp: new Date('2024-01-01T10:00:00Z'),
      fullCode: 'print("Hello")',
      isDiff: false,
    },
    {
      id: 'rev-2',
      sessionId: 'session-1',
      studentId: 'student-1',
      timestamp: new Date('2024-01-01T10:01:00Z'),
      diff: '@@ -1 +1 @@\n-print("Hello")\n+print("Hello, World!")\n',
      isDiff: true,
    },
  ];

  let mockAuthProvider: any;
  let mockStorage: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAuthProvider = {
      getSessionFromRequest: jest.fn(),
    };

    mockStorage = {
      revisions: {
        getRevisions: jest.fn(),
      },
    };

    (getAuthProvider as jest.Mock).mockResolvedValue(mockAuthProvider);
    (createStorage as jest.Mock).mockResolvedValue(mockStorage);
  });

  it('returns revisions for a student', async () => {
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({
      user: mockUser,
    });
    mockStorage.revisions.getRevisions.mockResolvedValue(mockRevisions);

    const request = new NextRequest(
      'http://localhost/api/sessions/session-1/revisions?studentId=student-1',
      {
        method: 'GET',
        headers: {
          Cookie: 'sessionId=test-session-id',
        },
      }
    );

    const response = await GET(request, {
      params: Promise.resolve({ id: 'session-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.revisions).toHaveLength(2);
    expect(data.revisions[0].code).toBe('print("Hello")');
    // Second revision should have reconstructed code
    expect(data.revisions[1].code).toBe('print("Hello, World!")');
    expect(mockStorage.revisions.getRevisions).toHaveBeenCalledWith('session-1', 'student-1');
  });

  it('returns empty array when no revisions exist', async () => {
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({
      user: mockUser,
    });
    mockStorage.revisions.getRevisions.mockResolvedValue([]);

    const request = new NextRequest(
      'http://localhost/api/sessions/session-1/revisions?studentId=student-1',
      {
        method: 'GET',
        headers: {
          Cookie: 'sessionId=test-session-id',
        },
      }
    );

    const response = await GET(request, {
      params: Promise.resolve({ id: 'session-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.revisions).toHaveLength(0);
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthProvider.getSessionFromRequest.mockResolvedValue(null);

    const request = new NextRequest(
      'http://localhost/api/sessions/session-1/revisions?studentId=student-1',
      {
        method: 'GET',
      }
    );

    const response = await GET(request, {
      params: Promise.resolve({ id: 'session-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 403 when user is a student', async () => {
    const studentUser: User = { ...mockUser, role: 'student' };
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({
      user: studentUser,
    });

    const request = new NextRequest(
      'http://localhost/api/sessions/session-1/revisions?studentId=student-1',
      {
        method: 'GET',
        headers: {
          Cookie: 'sessionId=test-session-id',
        },
      }
    );

    const response = await GET(request, {
      params: Promise.resolve({ id: 'session-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain('Only instructors');
  });

  it('returns 400 when studentId is missing', async () => {
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({
      user: mockUser,
    });

    const request = new NextRequest(
      'http://localhost/api/sessions/session-1/revisions',
      {
        method: 'GET',
        headers: {
          Cookie: 'sessionId=test-session-id',
        },
      }
    );

    const response = await GET(request, {
      params: Promise.resolve({ id: 'session-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('studentId query parameter is required');
  });

  it('handles errors when fetching revisions', async () => {
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({
      user: mockUser,
    });
    mockStorage.revisions.getRevisions.mockRejectedValue(new Error('Database error'));

    const request = new NextRequest(
      'http://localhost/api/sessions/session-1/revisions?studentId=student-1',
      {
        method: 'GET',
        headers: {
          Cookie: 'sessionId=test-session-id',
        },
      }
    );

    const response = await GET(request, {
      params: Promise.resolve({ id: 'session-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch revisions');
  });

  it('allows namespace-admin to fetch revisions', async () => {
    const adminUser: User = { ...mockUser, role: 'namespace-admin' };
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({
      user: adminUser,
    });
    mockStorage.revisions.getRevisions.mockResolvedValue([]);

    const request = new NextRequest(
      'http://localhost/api/sessions/session-1/revisions?studentId=student-1',
      {
        method: 'GET',
        headers: {
          Cookie: 'sessionId=test-session-id',
        },
      }
    );

    const response = await GET(request, {
      params: Promise.resolve({ id: 'session-1' }),
    });

    expect(response.status).toBe(200);
  });
});

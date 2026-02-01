/**
 * Tests for POST /api/sessions/[id]/reopen route
 */

import { NextRequest } from 'next/server';
import { POST } from '../route';
import { getAuthenticatedUserWithToken } from '@/server/auth/api-auth';
import * as SessionService from '@/server/services/session-service';
import { getExecutorService } from '@/server/code-execution';
import { Session } from '@/server/types';
import { Problem } from '@/server/types/problem';

// Mock dependencies
jest.mock('@/server/auth/api-auth');
jest.mock('@/server/persistence', () => ({
  createStorage: jest.fn(),
}));
jest.mock('@/server/services/session-service');
jest.mock('@/server/code-execution');

import { createStorage } from '@/server/persistence';

const mockGetAuthenticatedUserWithToken = getAuthenticatedUserWithToken as jest.MockedFunction<typeof getAuthenticatedUserWithToken>;
const mockCreateStorage = createStorage as jest.MockedFunction<typeof createStorage>;
const mockReopenSession = SessionService.reopenSession as jest.MockedFunction<typeof SessionService.reopenSession>;
const mockPrepareForSession = jest.fn();
const mockGetExecutorService = getExecutorService as jest.MockedFunction<typeof getExecutorService>;

describe('POST /api/sessions/[id]/reopen', () => {
  const mockUser = {
    id: 'instructor-1',
    email: 'instructor@example.com',
    role: 'instructor' as const,
    namespaceId: 'default',
    createdAt: new Date(),
    lastLoginAt: new Date(),
  };

  const mockProblem: Problem = {
    id: 'prob-1',
    namespaceId: 'default',
    title: 'Test Problem',
    description: 'Test description',
    starterCode: 'print("Hello")',
    testCases: [],
    authorId: 'instructor-1',
    classId: 'test-class-id',
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCompletedSession: Session = {
    id: 'session-1',
    namespaceId: 'default',
    problem: mockProblem,
    students: new Map(),
    createdAt: new Date(),
    lastActivity: new Date(),
    creatorId: 'instructor-1',
    participants: ['student-1'],
    status: 'completed',
    endedAt: new Date(),
    sectionId: 'section-1',
    sectionName: 'Test Section',
  };

  let mockStorage: {
    sessions: {
      getSession: jest.Mock;
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetExecutorService.mockReturnValue({ prepareForSession: mockPrepareForSession } as any);
    mockPrepareForSession.mockResolvedValue(undefined);
    mockStorage = {
      sessions: {
        getSession: jest.fn(),
      },
    };
    mockCreateStorage.mockResolvedValue(mockStorage as any);
  });

  function makeRequest() {
    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/reopen', {
      method: 'POST',
    });
    const params = Promise.resolve({ id: 'session-1' });
    return { request, params };
  }

  it('should successfully reopen a completed session', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });
    mockStorage.sessions.getSession.mockResolvedValue(mockCompletedSession);
    mockReopenSession.mockResolvedValue(undefined);

    const { request, params } = makeRequest();
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessionId).toBe('session-1');
    expect(mockReopenSession).toHaveBeenCalledWith(mockStorage, 'session-1');
    expect(mockPrepareForSession).toHaveBeenCalledWith('session-1');
  });

  it('should return 401 when not authenticated', async () => {
    mockGetAuthenticatedUserWithToken.mockRejectedValue(new Error('Not authenticated'));

    const { request, params } = makeRequest();
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('should return 404 when session not found', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });
    mockStorage.sessions.getSession.mockResolvedValue(null);

    const { request, params } = makeRequest();
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Session not found');
  });

  it('should return 403 when user is not creator or admin', async () => {
    const otherUser = { ...mockUser, id: 'other-user' };
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: otherUser, accessToken: 'test-token' });
    mockStorage.sessions.getSession.mockResolvedValue(mockCompletedSession);

    const { request, params } = makeRequest();
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain('Forbidden');
  });

  it('should return 400 when session is not completed', async () => {
    const activeSession = { ...mockCompletedSession, status: 'active' as const, endedAt: undefined };
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });
    mockStorage.sessions.getSession.mockResolvedValue(activeSession);

    const { request, params } = makeRequest();
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('completed');
  });

  it('should return 400 when active session already exists for section', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });
    mockStorage.sessions.getSession.mockResolvedValue(mockCompletedSession);
    mockReopenSession.mockRejectedValue(
      new Error('Cannot reopen session: An active session already exists for this section.')
    );

    const { request, params } = makeRequest();
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Cannot reopen session');
  });

  it('should allow namespace-admin to reopen any session', async () => {
    const adminUser = { ...mockUser, id: 'admin-1', role: 'namespace-admin' as const };
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: adminUser, accessToken: 'test-token' });
    mockStorage.sessions.getSession.mockResolvedValue(mockCompletedSession);
    mockReopenSession.mockResolvedValue(undefined);

    const { request, params } = makeRequest();
    const response = await POST(request, { params });

    expect(response.status).toBe(200);
    expect(mockReopenSession).toHaveBeenCalled();
  });

  it('should allow system-admin to reopen any session', async () => {
    const adminUser = { ...mockUser, id: 'admin-1', role: 'system-admin' as const };
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: adminUser, accessToken: 'test-token' });
    mockStorage.sessions.getSession.mockResolvedValue(mockCompletedSession);
    mockReopenSession.mockResolvedValue(undefined);

    const { request, params } = makeRequest();
    const response = await POST(request, { params });

    expect(response.status).toBe(200);
    expect(mockReopenSession).toHaveBeenCalled();
  });

  it('should fire-and-forget prepareForSession (not block response)', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });
    mockStorage.sessions.getSession.mockResolvedValue(mockCompletedSession);
    mockReopenSession.mockResolvedValue(undefined);
    // prepareForSession rejects, but response should still succeed
    mockPrepareForSession.mockRejectedValue(new Error('sandbox error'));

    const { request, params } = makeRequest();
    const response = await POST(request, { params });

    expect(response.status).toBe(200);
  });
});

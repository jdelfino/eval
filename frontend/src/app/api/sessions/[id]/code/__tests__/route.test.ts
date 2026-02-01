/**
 * Tests for POST /api/sessions/[id]/code route
 *
 * These are unit tests for the HTTP layer - they mock session-service
 * to test route behavior (auth, validation, error handling).
 */

import { NextRequest } from 'next/server';
import { POST } from '../route';
import { getAuthenticatedUserWithToken } from '@/server/auth/api-auth';
import { createStorage } from '@/server/persistence';
import { revisionBufferHolder } from '@/server/revision-buffer';
import * as SessionService from '@/server/services/session-service';
import { Session } from '@/server/types';
import { Problem } from '@/server/types/problem';

jest.mock('@/server/auth/api-auth');
jest.mock('@/server/persistence');
jest.mock('@/server/services/session-service');

// Mock Supabase client for broadcast functionality
const mockSend = jest.fn().mockResolvedValue({});
const mockSubscribe = jest.fn((callback) => {
  // Immediately call callback with SUBSCRIBED status
  callback('SUBSCRIBED');
  return { send: mockSend };
});
const mockChannel = jest.fn(() => ({
  subscribe: mockSubscribe,
  send: mockSend,
}));
const mockRemoveChannel = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  })),
}));

const mockGetAuthenticatedUserWithToken = getAuthenticatedUserWithToken as jest.MockedFunction<typeof getAuthenticatedUserWithToken>;
const mockCreateStorage = createStorage as jest.MockedFunction<typeof createStorage>;

describe('POST /api/sessions/[id]/code', () => {
  const mockUser = {
    id: 'user-1',
    email: 'student@example.com',
    role: 'student' as const,
    namespaceId: 'default',
    createdAt: new Date(),
  };

  const mockProblem: Problem = {
    id: 'prob-1',
    namespaceId: 'default',
    title: 'Test Problem',
    description: 'Test description',
    starterCode: 'print("Hello")',
    testCases: [],
    executionSettings: {
      stdin: 'default stdin',
      randomSeed: 42,
    },
    authorId: 'user-1',
    classId: 'test-class-id',
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createMockSession = (): Session => ({
    id: 'session-1',
    namespaceId: 'default',
    problem: mockProblem,
    students: new Map([
      ['user-1', {
        id: 'user-1',
        userId: 'user-1',
        name: 'Test Student',
        code: 'old code',
        lastUpdate: new Date(),
      }],
    ]),
    createdAt: new Date(),
    lastActivity: new Date(),
    creatorId: 'instructor-1',
    participants: ['user-1'],
    status: 'active',
    sectionId: 'section-1',
    sectionName: 'Test Section',
  });

  let mockStorage: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Set required env vars for broadcast
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SECRET_KEY = 'test-secret-key';

    mockStorage = {
      sessions: {
        getSession: jest.fn().mockResolvedValue(createMockSession()),
      },
    };

    mockCreateStorage.mockResolvedValue(mockStorage);

    // Default service mock
    (SessionService.updateStudentCode as jest.Mock).mockResolvedValue(undefined);

    // Setup revision buffer mock
    revisionBufferHolder.instance = {
      addRevision: jest.fn().mockResolvedValue(undefined),
    } as any;
  });

  afterEach(() => {
    revisionBufferHolder.instance = null;
  });

  it('saves code successfully', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });
    const code = 'print("Updated code")';

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/code', {
      method: 'POST',
      body: JSON.stringify({ studentId: 'user-1', code }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(SessionService.updateStudentCode).toHaveBeenCalledWith(
      mockStorage,
      expect.objectContaining({ id: 'session-1' }),
      'user-1',
      code,
      undefined
    );
    expect(revisionBufferHolder.instance!.addRevision).toHaveBeenCalledWith(
      'session-1', 'user-1', code, 'default'
    );
  });

  it('passes execution settings to service', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/code', {
      method: 'POST',
      body: JSON.stringify({
        studentId: 'user-1',
        code: 'print("code")',
        executionSettings: { stdin: 'custom stdin', randomSeed: 123 },
      }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });

    expect(response.status).toBe(200);
    expect(SessionService.updateStudentCode).toHaveBeenCalledWith(
      mockStorage,
      expect.any(Object),
      'user-1',
      'print("code")',
      { stdin: 'custom stdin', randomSeed: 123 }
    );
  });

  it('returns 401 when not authenticated', async () => {
    mockGetAuthenticatedUserWithToken.mockRejectedValue(new Error('Not authenticated'));

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/code', {
      method: 'POST',
      body: JSON.stringify({ studentId: 'user-1', code: 'print("code")' }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });

    expect(response.status).toBe(401);
  });

  it('returns 400 when code is missing', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/code', {
      method: 'POST',
      body: JSON.stringify({ studentId: 'user-1' }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Code is required');
  });

  it('returns 400 when studentId is missing', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/code', {
      method: 'POST',
      body: JSON.stringify({ code: 'print("code")' }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Student ID is required');
  });

  it('returns 404 when session not found', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });
    mockStorage.sessions.getSession.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/code', {
      method: 'POST',
      body: JSON.stringify({ studentId: 'user-1', code: 'print("code")' }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Session not found');
  });

  it('returns 400 when session is closed', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });
    mockStorage.sessions.getSession.mockResolvedValue({
      ...createMockSession(),
      status: 'completed',
    });

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/code', {
      method: 'POST',
      body: JSON.stringify({ studentId: 'user-1', code: 'print("code")' }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Session is closed. Code execution is no longer available.');
    expect(SessionService.updateStudentCode).not.toHaveBeenCalled();
  });

  it('returns 404 when student not found in session', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });
    mockStorage.sessions.getSession.mockResolvedValue({
      ...createMockSession(),
      students: new Map(),
    });

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/code', {
      method: 'POST',
      body: JSON.stringify({ studentId: 'user-1', code: 'print("code")' }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Student not found in session');
  });

  it('works without revision buffer', async () => {
    revisionBufferHolder.instance = null;
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/code', {
      method: 'POST',
      body: JSON.stringify({ studentId: 'user-1', code: 'print("code")' }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });

    expect(response.status).toBe(200);
  });

  it('returns 500 when service fails', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });
    (SessionService.updateStudentCode as jest.Mock).mockRejectedValue(new Error('Database error'));

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/code', {
      method: 'POST',
      body: JSON.stringify({ studentId: 'user-1', code: 'print("code")' }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to save code');
  });

  describe('Security: student ownership validation', () => {
    it('returns 403 when student tries to save code for another student', async () => {
      const studentUser = {
        ...mockUser,
        id: 'student-1',
        role: 'student' as const,
      };
      mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: studentUser, accessToken: 'test-token' });

      const request = new NextRequest('http://localhost:3000/api/sessions/session-1/code', {
        method: 'POST',
        body: JSON.stringify({ studentId: 'other-student', code: 'print("code")' }),
      });
      const params = Promise.resolve({ id: 'session-1' });

      const response = await POST(request, { params });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden: You can only save your own code');
      expect(SessionService.updateStudentCode).not.toHaveBeenCalled();
    });

    it('allows student to save their own code', async () => {
      const studentUser = {
        ...mockUser,
        id: 'student-1',
        role: 'student' as const,
      };
      mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: studentUser, accessToken: 'test-token' });
      mockStorage.sessions.getSession.mockResolvedValue({
        ...createMockSession(),
        students: new Map([['student-1', { id: 'student-1', name: 'Student', code: '', lastUpdate: new Date() }]]),
      });

      const request = new NextRequest('http://localhost:3000/api/sessions/session-1/code', {
        method: 'POST',
        body: JSON.stringify({ studentId: 'student-1', code: 'print("code")' }),
      });
      const params = Promise.resolve({ id: 'session-1' });

      const response = await POST(request, { params });

      expect(response.status).toBe(200);
      expect(SessionService.updateStudentCode).toHaveBeenCalled();
    });

    it('allows instructor to save code for any student', async () => {
      const instructorUser = {
        ...mockUser,
        id: 'instructor-1',
        role: 'instructor' as const,
      };
      mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: instructorUser, accessToken: 'test-token' });

      const request = new NextRequest('http://localhost:3000/api/sessions/session-1/code', {
        method: 'POST',
        body: JSON.stringify({ studentId: 'user-1', code: 'print("code")' }),
      });
      const params = Promise.resolve({ id: 'session-1' });

      const response = await POST(request, { params });

      expect(response.status).toBe(200);
      expect(SessionService.updateStudentCode).toHaveBeenCalled();
    });

    it('allows namespace-admin to save code for any student', async () => {
      const namespaceAdminUser = {
        ...mockUser,
        id: 'ns-admin-1',
        role: 'namespace-admin' as const,
      };
      mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: namespaceAdminUser, accessToken: 'test-token' });

      const request = new NextRequest('http://localhost:3000/api/sessions/session-1/code', {
        method: 'POST',
        body: JSON.stringify({ studentId: 'user-1', code: 'print("code")' }),
      });
      const params = Promise.resolve({ id: 'session-1' });

      const response = await POST(request, { params });

      expect(response.status).toBe(200);
      expect(SessionService.updateStudentCode).toHaveBeenCalled();
    });

    it('allows system-admin to save code for any student', async () => {
      const sysAdminUser = {
        ...mockUser,
        id: 'sys-admin-1',
        role: 'system-admin' as const,
      };
      mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: sysAdminUser, accessToken: 'test-token' });

      const request = new NextRequest('http://localhost:3000/api/sessions/session-1/code', {
        method: 'POST',
        body: JSON.stringify({ studentId: 'user-1', code: 'print("code")' }),
      });
      const params = Promise.resolve({ id: 'session-1' });

      const response = await POST(request, { params });

      expect(response.status).toBe(200);
      expect(SessionService.updateStudentCode).toHaveBeenCalled();
    });
  });

  describe('Broadcast notification', () => {
    it('broadcasts student_code_updated event after successful code update', async () => {
      mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });
      const code = 'print("Updated code")';
      const executionSettings = { stdin: 'test input', randomSeed: 42 };

      const request = new NextRequest('http://localhost:3000/api/sessions/session-1/code', {
        method: 'POST',
        body: JSON.stringify({ studentId: 'user-1', code, executionSettings }),
      });
      const params = Promise.resolve({ id: 'session-1' });

      const response = await POST(request, { params });

      expect(response.status).toBe(200);

      // Verify broadcast was called with correct channel
      expect(mockChannel).toHaveBeenCalledWith('session:session-1');

      // Verify broadcast message was sent with correct event and payload
      expect(mockSend).toHaveBeenCalledWith({
        type: 'broadcast',
        event: 'student_code_updated',
        payload: expect.objectContaining({
          sessionId: 'session-1',
          studentId: 'user-1',
          code,
          executionSettings,
          timestamp: expect.any(Number),
        }),
      });
    });

    it('includes lastUpdate in broadcast payload', async () => {
      const lastUpdate = new Date('2024-01-01T12:00:00Z');
      mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });
      mockStorage.sessions.getSession.mockResolvedValue({
        ...createMockSession(),
        students: new Map([['user-1', { id: 'user-1', name: 'Test Student', code: 'old code', lastUpdate }]]),
      });

      const request = new NextRequest('http://localhost:3000/api/sessions/session-1/code', {
        method: 'POST',
        body: JSON.stringify({ studentId: 'user-1', code: 'new code' }),
      });
      const params = Promise.resolve({ id: 'session-1' });

      await POST(request, { params });

      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
        payload: expect.objectContaining({
          lastUpdate: expect.any(Date),
        }),
      }));
    });
  });
});

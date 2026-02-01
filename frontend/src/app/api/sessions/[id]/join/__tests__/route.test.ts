/**
 * Tests for POST /api/sessions/[id]/join route
 *
 * These are unit tests for the HTTP layer - they mock session-service
 * to test route behavior (auth, validation, error handling).
 */

import { NextRequest } from 'next/server';
import { POST } from '../route';
import { getAuthenticatedUserWithToken } from '@/server/auth/api-auth';
import { createStorage } from '@/server/persistence';
import * as SessionService from '@/server/services/session-service';
import { Session } from '@/server/types';
import { Problem } from '@/server/types/problem';

jest.mock('@/server/auth/api-auth');
jest.mock('@/server/persistence');
jest.mock('@/server/services/session-service');

// Mock Supabase client for broadcast functionality
const mockSend = jest.fn().mockResolvedValue({});
const mockRemoveChannel = jest.fn();
// Mock subscribe to immediately call callback with 'SUBSCRIBED'
const mockSubscribe = jest.fn((callback) => {
  setImmediate(() => callback('SUBSCRIBED'));
});
const mockChannelObj = {
  subscribe: mockSubscribe,
  send: mockSend,
};
const mockChannel = jest.fn(() => mockChannelObj);

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  })),
}));

const mockGetAuthenticatedUserWithToken = getAuthenticatedUserWithToken as jest.MockedFunction<typeof getAuthenticatedUserWithToken>;
const mockCreateStorage = createStorage as jest.MockedFunction<typeof createStorage>;

describe('POST /api/sessions/[id]/join', () => {
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
    authorId: 'user-1',
    classId: 'test-class-id',
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSession: Session = {
    id: 'session-1',
    namespaceId: 'default',
    problem: mockProblem,
    students: new Map(),
    createdAt: new Date(),
    lastActivity: new Date(),
    creatorId: 'instructor-1',
    participants: [],
    status: 'active',
    sectionId: 'section-1',
    sectionName: 'Test Section',
  };

  const mockStudent = {
    userId: 'user-1',
    name: 'Alice',
    code: 'print("Hello")',
    lastUpdate: new Date(),
  };

  let mockStorage: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Set required env vars for broadcast
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SECRET_KEY = 'test-secret-key';

    mockStorage = {
      sessions: {
        getSession: jest.fn().mockResolvedValue(mockSession),
      },
    };

    mockCreateStorage.mockResolvedValue(mockStorage);

    // Default service mocks
    (SessionService.addStudent as jest.Mock).mockResolvedValue(mockStudent);
    (SessionService.getStudentData as jest.Mock).mockReturnValue({
      code: mockStudent.code,
      executionSettings: undefined,
    });
  });

  it('joins session successfully', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/join', {
      method: 'POST',
      body: JSON.stringify({ studentId: 'user-1', name: 'Alice' }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.student.id).toBe('user-1');
    expect(data.student.name).toBe('Alice');
    expect(SessionService.addStudent).toHaveBeenCalledWith(
      mockStorage, mockSession, 'user-1', 'Alice'
    );
  });

  it('uses authenticated user ID when studentId not provided', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/join', {
      method: 'POST',
      body: JSON.stringify({ name: 'Alice' }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });

    expect(response.status).toBe(200);
    expect(SessionService.addStudent).toHaveBeenCalledWith(
      mockStorage, mockSession, 'user-1', 'Alice'
    );
  });

  it('returns 401 when not authenticated', async () => {
    mockGetAuthenticatedUserWithToken.mockRejectedValue(new Error('Not authenticated'));

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/join', {
      method: 'POST',
      body: JSON.stringify({ name: 'Alice' }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });

    expect(response.status).toBe(401);
  });

  it('returns 400 when name is missing', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/join', {
      method: 'POST',
      body: JSON.stringify({ studentId: 'user-1' }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Student name is required');
  });

  it('returns 400 when name is too long', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/join', {
      method: 'POST',
      body: JSON.stringify({ name: 'A'.repeat(51) }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Student name is too long (max 50 characters)');
  });

  it('returns 404 when session not found', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });
    mockStorage.sessions.getSession.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/join', {
      method: 'POST',
      body: JSON.stringify({ name: 'Alice' }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Session not found');
  });

  it('returns 400 when session is completed', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });
    mockStorage.sessions.getSession.mockResolvedValue({
      ...mockSession,
      status: 'completed',
    });

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/join', {
      method: 'POST',
      body: JSON.stringify({ name: 'Alice' }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('This session has ended and cannot be joined');
  });

  it('returns 500 when service fails', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });
    (SessionService.addStudent as jest.Mock).mockRejectedValue(new Error('Database error'));

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/join', {
      method: 'POST',
      body: JSON.stringify({ name: 'Alice' }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to join session');
  });

  it('broadcasts student_joined event after successful join', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/join', {
      method: 'POST',
      body: JSON.stringify({ studentId: 'user-1', name: 'Alice' }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });

    expect(response.status).toBe(200);

    // Verify channel was created for the session
    expect(mockChannel).toHaveBeenCalledWith('session:session-1');

    // Verify subscribe was called
    expect(mockSubscribe).toHaveBeenCalled();

    // Simulate the subscribe callback being invoked with 'SUBSCRIBED'
    const subscribeCallback = mockSubscribe.mock.calls[0][0];
    await subscribeCallback('SUBSCRIBED');

    // Verify the broadcast was sent with correct payload
    expect(mockSend).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'student_joined',
      payload: expect.objectContaining({
        sessionId: 'session-1',
        student: expect.objectContaining({
          userId: 'user-1',
          name: 'Alice',
          code: 'print("Hello")',
        }),
        timestamp: expect.any(Number),
      }),
    });

    // Verify channel cleanup
    expect(mockRemoveChannel).toHaveBeenCalled();
  });
});

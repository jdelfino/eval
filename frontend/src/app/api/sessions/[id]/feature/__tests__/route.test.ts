/**
 * Tests for POST /api/sessions/[id]/feature route
 *
 * These are unit tests for the HTTP layer - they mock session-service
 * to test route behavior (auth, validation, error handling).
 */

import { NextRequest } from 'next/server';
import { POST } from '../route';
import { getAuthenticatedUserWithToken, checkPermission } from '@/server/auth/api-auth';
import { createStorage } from '@/server/persistence';
import * as SessionService from '@/server/services/session-service';
import { Session, Student } from '@/server/types';
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

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    channel: jest.fn(() => mockChannelObj),
    removeChannel: mockRemoveChannel,
  })),
}));

const mockGetAuthenticatedUserWithToken = getAuthenticatedUserWithToken as jest.MockedFunction<typeof getAuthenticatedUserWithToken>;
const mockCheckPermission = checkPermission as jest.MockedFunction<typeof checkPermission>;
const mockCreateStorage = createStorage as jest.MockedFunction<typeof createStorage>;

describe('POST /api/sessions/[id]/feature', () => {
  const mockInstructor = {
    id: 'instructor-1',
    email: 'instructor@example.com',
    role: 'instructor' as const,
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
    authorId: 'instructor-1',
    classId: 'test-class-id',
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockStudentObj: Student = {
    userId: 'user-1',
    name: 'Alice',
    code: 'print("Alice code")',
    lastUpdate: new Date(),
  };

  const mockSession: Session = {
    id: 'session-1',
    namespaceId: 'default',
    problem: mockProblem,
    students: new Map([['user-1', mockStudentObj]]),
    createdAt: new Date(),
    lastActivity: new Date(),
    creatorId: 'instructor-1',
    participants: ['user-1'],
    status: 'active',
    sectionId: 'section-1',
    sectionName: 'Test Section',
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
    (SessionService.setFeaturedSubmission as jest.Mock).mockResolvedValue(undefined);
    (SessionService.clearFeaturedSubmission as jest.Mock).mockResolvedValue(undefined);
  });

  it('features a student successfully', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockInstructor, accessToken: 'test-token' });
    mockCheckPermission.mockReturnValue(true);

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/feature', {
      method: 'POST',
      body: JSON.stringify({ studentId: 'user-1' }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.featuredStudentId).toBe('user-1');
    expect(data.featuredCode).toBe('print("Alice code")');
    expect(SessionService.setFeaturedSubmission).toHaveBeenCalledWith(
      mockStorage, mockSession, 'user-1'
    );
  });

  it('clears featured student when studentId not provided', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockInstructor, accessToken: 'test-token' });
    mockCheckPermission.mockReturnValue(true);

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/feature', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(SessionService.clearFeaturedSubmission).toHaveBeenCalledWith(
      mockStorage, 'session-1'
    );
  });

  it('returns 401 when not authenticated', async () => {
    mockGetAuthenticatedUserWithToken.mockRejectedValue(new Error('Not authenticated'));

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/feature', {
      method: 'POST',
      body: JSON.stringify({ studentId: 'user-1' }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });

    expect(response.status).toBe(401);
  });

  it('returns 403 when user lacks permission', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockInstructor, accessToken: 'test-token' });
    mockCheckPermission.mockReturnValue(false);

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/feature', {
      method: 'POST',
      body: JSON.stringify({ studentId: 'user-1' }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('You do not have permission to feature students');
  });

  it('returns 404 when session not found', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockInstructor, accessToken: 'test-token' });
    mockCheckPermission.mockReturnValue(true);
    mockStorage.sessions.getSession.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/feature', {
      method: 'POST',
      body: JSON.stringify({ studentId: 'user-1' }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Session not found');
  });

  it('returns 404 when student not found in session', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockInstructor, accessToken: 'test-token' });
    mockCheckPermission.mockReturnValue(true);

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/feature', {
      method: 'POST',
      body: JSON.stringify({ studentId: 'nonexistent-student' }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Student not found in session');
  });

  it('returns 500 when service fails', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockInstructor, accessToken: 'test-token' });
    mockCheckPermission.mockReturnValue(true);
    (SessionService.setFeaturedSubmission as jest.Mock).mockRejectedValue(new Error('Database error'));

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/feature', {
      method: 'POST',
      body: JSON.stringify({ studentId: 'user-1' }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to feature student');
  });
});

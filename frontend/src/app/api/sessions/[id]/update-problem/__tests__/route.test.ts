import { NextRequest, NextResponse } from 'next/server';
import { POST, broadcastProblemUpdated } from '../route';
import { getAuthProvider } from '@/server/auth';
import type { User } from '@/server/auth/types';

// Mock dependencies
jest.mock('@/server/auth');
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

import { createStorage } from '@/server/persistence';
import * as SessionService from '@/server/services/session-service';

describe('POST /api/sessions/[sessionId]/update-problem', () => {
  const mockUser: User = {
    id: 'instructor-1',
    email: 'instructor@example.com',
    role: 'instructor' as const,
    namespaceId: 'default',
    createdAt: new Date('2024-01-01'),
  };

  const mockProblem = {
    title: 'Updated Problem',
    description: 'Updated description',
    starterCode: 'print("Updated")',
  };

  const mockExecutionSettings = {
    stdin: 'test input\n',
    randomSeed: 42,
  };

  const mockSession = {
    id: 'session-1',
    joinCode: 'ABC123',
    sectionId: 'section-1',
    sectionName: 'Section A',
    creatorId: 'instructor-1',
    participants: ['instructor-1'],
    status: 'active' as const,
    problem: mockProblem,
  };

  let mockAuthProvider: any;
  let mockStorage: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Set required env vars for broadcast
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SECRET_KEY = 'test-secret-key';

    mockAuthProvider = {
      getSessionFromRequest: jest.fn(),
    };

    mockStorage = {
      sessions: {
        getSession: jest.fn(),
      },
    };

    (getAuthProvider as jest.Mock).mockResolvedValue(mockAuthProvider);
    (createStorage as jest.Mock).mockResolvedValue(mockStorage);
  });

  it('updates problem with execution settings', async () => {
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({
      user: mockUser,
    });
    mockStorage.sessions.getSession.mockResolvedValue(mockSession);

    const request = new NextRequest('http://localhost/api/sessions/session-1/update-problem', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'sessionId=test-session-id',
      },
      body: JSON.stringify({
        problem: mockProblem,
        executionSettings: mockExecutionSettings,
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ id: 'session-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toContain('Updated Problem');
    expect(SessionService.updateSessionProblem).toHaveBeenCalledWith(
      mockStorage,
      'session-1',
      mockProblem,
      mockExecutionSettings
    );
  });

  it('updates problem without execution settings', async () => {
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({
      user: mockUser,
    });
    mockStorage.sessions.getSession.mockResolvedValue(mockSession);

    const request = new NextRequest('http://localhost/api/sessions/session-1/update-problem', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'sessionId=test-session-id',
      },
      body: JSON.stringify({
        problem: mockProblem,
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ id: 'session-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(SessionService.updateSessionProblem).toHaveBeenCalledWith(
      mockStorage,
      'session-1',
      mockProblem,
      undefined
    );
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthProvider.getSessionFromRequest.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/sessions/session-1/update-problem', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        problem: mockProblem,
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ id: 'session-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 403 when user is not an instructor', async () => {
    const studentUser: User = { ...mockUser, role: 'student' };
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({
      user: studentUser,
    });
    mockStorage.sessions.getSession.mockResolvedValue(mockSession);

    const request = new NextRequest('http://localhost/api/sessions/session-1/update-problem', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'sessionId=test-session-id',
      },
      body: JSON.stringify({
        problem: mockProblem,
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ id: 'session-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain('Only instructors');
  });

  it('returns 400 when problem is missing', async () => {
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({
      user: mockUser,
    });
    mockStorage.sessions.getSession.mockResolvedValue(mockSession);

    const request = new NextRequest('http://localhost/api/sessions/session-1/update-problem', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'sessionId=test-session-id',
      },
      body: JSON.stringify({}),
    });

    const response = await POST(request, {
      params: Promise.resolve({ id: 'session-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid problem object');
  });

  it('returns 404 when session not found', async () => {
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({
      user: mockUser,
    });
    mockStorage.sessions.getSession.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/sessions/session-1/update-problem', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'sessionId=test-session-id',
      },
      body: JSON.stringify({
        problem: mockProblem,
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ id: 'session-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Session not found');
  });

  it('returns 500 when update throws error', async () => {
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({
      user: mockUser,
    });
    mockStorage.sessions.getSession.mockResolvedValue(mockSession);
    (SessionService.updateSessionProblem as jest.Mock).mockRejectedValue(new Error('Update failed'));

    const request = new NextRequest('http://localhost/api/sessions/session-1/update-problem', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'sessionId=test-session-id',
      },
      body: JSON.stringify({
        problem: mockProblem,
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ id: 'session-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Internal server error');
  });

  it('allows namespace-admin to update problem', async () => {
    const adminUser: User = { ...mockUser, role: 'namespace-admin' };
    mockAuthProvider.getSessionFromRequest.mockResolvedValue({
      user: adminUser,
    });
    mockStorage.sessions.getSession.mockResolvedValue(mockSession);
    // Reset the mock to resolve successfully
    (SessionService.updateSessionProblem as jest.Mock).mockResolvedValue(undefined);

    const request = new NextRequest('http://localhost/api/sessions/session-1/update-problem', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'sessionId=test-session-id',
      },
      body: JSON.stringify({
        problem: mockProblem,
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ id: 'session-1' }),
    });

    expect(response.status).toBe(200);
  });
});

describe('broadcastProblemUpdated', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SECRET_KEY = 'test-secret-key';
  });

  it('throws error when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    await expect(broadcastProblemUpdated('session-1', {
      id: 'prob-1',
      namespaceId: 'default',
      title: 'Test',
      description: 'Test',
      starterCode: '',
      testCases: [],
      authorId: 'user-1',
      classId: 'test-class-id',
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })).rejects.toThrow('NEXT_PUBLIC_SUPABASE_URL is required for broadcast');
  });

  it('throws error when SUPABASE_SECRET_KEY is missing', async () => {
    delete process.env.SUPABASE_SECRET_KEY;

    await expect(broadcastProblemUpdated('session-1', {
      id: 'prob-1',
      namespaceId: 'default',
      title: 'Test',
      description: 'Test',
      starterCode: '',
      testCases: [],
      authorId: 'user-1',
      classId: 'test-class-id',
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })).rejects.toThrow('SUPABASE_SECRET_KEY is required for broadcast');
  });

  it('broadcasts problem update on subscribe', async () => {
    const problem = {
      id: 'prob-1',
      namespaceId: 'default',
      title: 'Test Problem',
      description: 'Test description',
      starterCode: 'print("test")',
      testCases: [],
      authorId: 'user-1',
      classId: 'test-class-id',
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const executionSettings = { stdin: 'test input' };

    // Await the broadcast - mock will call callback with SUBSCRIBED via setImmediate
    await broadcastProblemUpdated('session-1', problem, executionSettings);

    expect(mockSend).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'problem_updated',
      payload: expect.objectContaining({
        sessionId: 'session-1',
        problem,
        executionSettings,
        timestamp: expect.any(Number),
      }),
    });
  });
});

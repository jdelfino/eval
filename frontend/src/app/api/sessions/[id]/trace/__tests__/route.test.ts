/**
 * Tests for POST /api/sessions/[id]/trace route
 */

import { NextRequest } from 'next/server';
import { POST } from '../route';
import { getAuthenticatedUserWithToken } from '@/server/auth/api-auth';
import { getExecutorService } from '@/server/code-execution';
import { TRACE_MAX_STEPS } from '@/server/code-execution/utils';
import { Session, ExecutionTrace } from '@/server/types';
import { Problem } from '@/server/types/problem';

// Mock dependencies
jest.mock('@/server/auth/api-auth');
jest.mock('@/server/persistence');
jest.mock('@/server/code-execution');

import { createStorage } from '@/server/persistence';

const mockGetAuthenticatedUserWithToken = getAuthenticatedUserWithToken as jest.MockedFunction<typeof getAuthenticatedUserWithToken>;
const mockCreateStorage = createStorage as jest.MockedFunction<typeof createStorage>;
const mockTraceExecution = jest.fn();
const mockGetExecutorService = getExecutorService as jest.MockedFunction<typeof getExecutorService>;
mockGetExecutorService.mockReturnValue({ traceExecution: mockTraceExecution } as any);

describe('POST /api/sessions/[id]/trace', () => {
  const mockUser = {
    id: 'user-1',
    email: 'student@example.com',
    role: 'student' as const,
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
    participants: ['user-1'], // Include mockUser as participant
    status: 'active',
    sectionId: 'section-1',
    sectionName: 'Test Section',
  };

  const mockTrace: ExecutionTrace = {
    steps: [
      {
        line: 1,
        event: 'line',
        locals: {},
        globals: {},
        callStack: [{ functionName: '<module>', filename: '<string>', line: 1 }],
        stdout: '',
      },
      {
        line: 1,
        event: 'return',
        locals: {},
        globals: {},
        callStack: [],
        stdout: 'Hello\n',
      },
    ],
    totalSteps: 2,
    exitCode: 0,
    truncated: false,
  };

  let mockStorage: any;

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-setup mocks after clear
    mockGetExecutorService.mockReturnValue({ traceExecution: mockTraceExecution } as any);
    mockStorage = {
      sessions: {
        getSession: jest.fn(),
      },
    };
    mockCreateStorage.mockResolvedValue(mockStorage);
  });

  it('should successfully trace code execution', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });
    mockStorage.sessions.getSession.mockResolvedValue(mockSession);
    mockTraceExecution.mockResolvedValue(mockTrace);

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/trace', {
      method: 'POST',
      body: JSON.stringify({
        code: 'print("Hello")',
      }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(mockTrace);
    expect(mockTraceExecution).toHaveBeenCalledWith(
      'print("Hello")',
      {
        executionSettings: { stdin: '' },
        maxSteps: TRACE_MAX_STEPS,
        sessionId: 'session-1',
      }
    );
  });

  it('should pass stdin and maxSteps to trace execution', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });
    mockStorage.sessions.getSession.mockResolvedValue(mockSession);
    mockTraceExecution.mockResolvedValue(mockTrace);

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/trace', {
      method: 'POST',
      body: JSON.stringify({
        code: 'print(input())',
        stdin: 'test input',
        maxSteps: 100,
      }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });

    expect(response.status).toBe(200);
    expect(mockTraceExecution).toHaveBeenCalledWith(
      'print(input())',
      {
        executionSettings: { stdin: 'test input' },
        maxSteps: 100,
        sessionId: 'session-1',
      }
    );
  });

  it('should return 401 when not authenticated', async () => {
    mockGetAuthenticatedUserWithToken.mockRejectedValue(new Error('Not authenticated'));

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/trace', {
      method: 'POST',
      body: JSON.stringify({
        code: 'print("Hello")',
      }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Not authenticated');
  });

  it('should return 400 when code is missing', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/trace', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Code is required');
  });

  it('should return 400 when code is not a string', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/trace', {
      method: 'POST',
      body: JSON.stringify({
        code: 123,
      }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Code is required');
  });

  it('should return 404 when session not found', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });
    mockStorage.sessions.getSession.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/trace', {
      method: 'POST',
      body: JSON.stringify({
        code: 'print("Hello")',
      }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Session not found');
  });

  it('should return 400 when session is closed', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });
    mockStorage.sessions.getSession.mockResolvedValue({
      ...mockSession,
      status: 'completed',
    });

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/trace', {
      method: 'POST',
      body: JSON.stringify({
        code: 'print("Hello")',
      }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Session is closed. Code execution is no longer available.');
    expect(mockTraceExecution).not.toHaveBeenCalled();
  });

  it('should return 500 on trace execution error', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });
    mockStorage.sessions.getSession.mockResolvedValue(mockSession);
    mockTraceExecution.mockRejectedValue(new Error('Trace execution failed'));

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/trace', {
      method: 'POST',
      body: JSON.stringify({
        code: 'print("Hello")',
      }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to trace code execution');
  });

  it('should return trace with error when code has syntax error', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });
    mockStorage.sessions.getSession.mockResolvedValue(mockSession);

    const errorTrace: ExecutionTrace = {
      steps: [],
      totalSteps: 0,
      exitCode: 1,
      error: 'SyntaxError: invalid syntax',
      truncated: false,
    };
    mockTraceExecution.mockResolvedValue(errorTrace);

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/trace', {
      method: 'POST',
      body: JSON.stringify({
        code: 'print("Hello"',
      }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.error).toBe('SyntaxError: invalid syntax');
    expect(data.steps).toEqual([]);
  });

  it('should return truncated trace when maxSteps is exceeded', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });
    mockStorage.sessions.getSession.mockResolvedValue(mockSession);

    const truncatedTrace: ExecutionTrace = {
      steps: [{ line: 1, event: 'line', locals: {}, globals: {}, callStack: [], stdout: '' }],
      totalSteps: 1,
      exitCode: 0,
      truncated: true,
    };
    mockTraceExecution.mockResolvedValue(truncatedTrace);

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/trace', {
      method: 'POST',
      body: JSON.stringify({
        code: 'while True: pass',
        maxSteps: 1,
      }),
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.truncated).toBe(true);
  });

  describe('Security: participant authorization', () => {
    it('should return 403 when user is not a participant or creator', async () => {
      const nonParticipantUser = {
        ...mockUser,
        id: 'other-user-id',
      };
      mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: nonParticipantUser, accessToken: 'test-token' });

      // Session where user is neither creator nor participant
      const restrictedSession = {
        ...mockSession,
        creatorId: 'instructor-1',
        participants: ['student-1', 'student-2'],
      };
      mockStorage.sessions.getSession.mockResolvedValue(restrictedSession);

      const request = new NextRequest('http://localhost:3000/api/sessions/session-1/trace', {
        method: 'POST',
        body: JSON.stringify({
          code: 'print("Hello")',
        }),
      });
      const params = Promise.resolve({ id: 'session-1' });

      const response = await POST(request, { params });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Access denied. You are not a participant in this session.');
      expect(mockTraceExecution).not.toHaveBeenCalled();
    });

    it('should allow tracing when user is the session creator', async () => {
      const creatorUser = {
        ...mockUser,
        id: 'instructor-1',
      };
      mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: creatorUser, accessToken: 'test-token' });

      // Session where user is the creator but not in participants list
      const creatorSession = {
        ...mockSession,
        creatorId: 'instructor-1',
        participants: ['student-1'],
      };
      mockStorage.sessions.getSession.mockResolvedValue(creatorSession);
      mockTraceExecution.mockResolvedValue(mockTrace);

      const request = new NextRequest('http://localhost:3000/api/sessions/session-1/trace', {
        method: 'POST',
        body: JSON.stringify({
          code: 'print("Hello")',
        }),
      });
      const params = Promise.resolve({ id: 'session-1' });

      const response = await POST(request, { params });

      expect(response.status).toBe(200);
      expect(mockTraceExecution).toHaveBeenCalled();
    });

    it('should allow tracing when user is a participant', async () => {
      const participantUser = {
        ...mockUser,
        id: 'student-2',
      };
      mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: participantUser, accessToken: 'test-token' });

      // Session where user is a participant but not creator
      const participantSession = {
        ...mockSession,
        creatorId: 'instructor-1',
        participants: ['student-1', 'student-2'],
      };
      mockStorage.sessions.getSession.mockResolvedValue(participantSession);
      mockTraceExecution.mockResolvedValue(mockTrace);

      const request = new NextRequest('http://localhost:3000/api/sessions/session-1/trace', {
        method: 'POST',
        body: JSON.stringify({
          code: 'print("Hello")',
        }),
      });
      const params = Promise.resolve({ id: 'session-1' });

      const response = await POST(request, { params });

      expect(response.status).toBe(200);
      expect(mockTraceExecution).toHaveBeenCalled();
    });
  });
});

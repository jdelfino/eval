/**
 * Tests for POST /api/sessions/[id]/analyze route
 *
 * These are unit tests for the HTTP layer - they mock the Gemini service
 * to test route behavior (auth, validation, error handling).
 */

import { NextRequest } from 'next/server';
import { POST } from '../route';
import { getAuthenticatedUserWithToken, checkPermission } from '@/server/auth/api-auth';
import { createStorage } from '@/server/persistence';
import { getGeminiService, GeminiAnalysisService } from '@/server/services/gemini-analysis-service';
import { rateLimit, checkAnalyzeDailyLimits } from '@/server/rate-limit';
import { Session, Student } from '@/server/types';
import { Problem } from '@/server/types/problem';
import { WalkthroughScript } from '@/server/types/analysis';

jest.mock('@/server/auth/api-auth');
jest.mock('@/server/persistence');
jest.mock('@/server/services/gemini-analysis-service');
jest.mock('@/server/rate-limit', () => ({
  rateLimit: jest.fn().mockResolvedValue(null),
  checkAnalyzeDailyLimits: jest.fn().mockResolvedValue(null),
}));

const mockGetAuthenticatedUserWithToken = getAuthenticatedUserWithToken as jest.MockedFunction<typeof getAuthenticatedUserWithToken>;
const mockCheckPermission = checkPermission as jest.MockedFunction<typeof checkPermission>;
const mockCreateStorage = createStorage as jest.MockedFunction<typeof createStorage>;
const mockGetGeminiService = getGeminiService as jest.MockedFunction<typeof getGeminiService>;
const mockRateLimit = rateLimit as jest.MockedFunction<typeof rateLimit>;
const mockCheckAnalyzeDailyLimits = checkAnalyzeDailyLimits as jest.MockedFunction<typeof checkAnalyzeDailyLimits>;

describe('POST /api/sessions/[id]/analyze', () => {
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

  const mockStudent1: Student = {
    userId: 'user-1',
    name: 'Alice',
    code: 'print("Alice solution here")',
    lastUpdate: new Date(),
  };

  const mockStudent2: Student = {
    userId: 'user-2',
    name: 'Bob',
    code: 'print("Bob solution here")',
    lastUpdate: new Date(),
  };

  const mockSession: Session = {
    id: 'session-1',
    namespaceId: 'default',
    problem: mockProblem,
    students: new Map([
      ['user-1', mockStudent1],
      ['user-2', mockStudent2],
    ]),
    createdAt: new Date(),
    lastActivity: new Date(),
    creatorId: 'instructor-1',
    participants: ['user-1', 'user-2'],
    status: 'active',
    sectionId: 'section-1',
    sectionName: 'Test Section',
  };

  const mockScript: WalkthroughScript = {
    sessionId: 'session-1',
    issues: [
      {
        title: 'Missing edge case handling',
        explanation: 'Common beginner mistake',
        count: 1,
        studentIds: ['user-1'],
        representativeStudentLabel: 'Student A',
        representativeStudentId: 'user-1',
        severity: 'error',
      },
    ],
    finishedStudentIds: ['user-1'],
    summary: {
      totalSubmissions: 2,
      filteredOut: 0,
      analyzedSubmissions: 2,
      completionEstimate: { finished: 1, inProgress: 1, notStarted: 0 },
    },
    generatedAt: new Date(),
  };

  let mockStorage: any;
  let mockGeminiService: Partial<GeminiAnalysisService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockStorage = {
      sessions: {
        getSession: jest.fn().mockResolvedValue(mockSession),
      },
    };
    mockCreateStorage.mockResolvedValue(mockStorage);

    mockGeminiService = {
      isConfigured: jest.fn().mockReturnValue(true),
      analyzeSubmissions: jest.fn().mockResolvedValue(mockScript),
    };
    mockGetGeminiService.mockReturnValue(mockGeminiService as GeminiAnalysisService);
  });

  it('analyzes student code successfully', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockInstructor, accessToken: 'test-token' });
    mockCheckPermission.mockReturnValue(true);

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/analyze', {
      method: 'POST',
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.script).toBeDefined();
    expect(data.script.issues).toHaveLength(1);
    expect(data.script.summary.totalSubmissions).toBe(2);
  });

  it('passes correct input to Gemini service', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockInstructor, accessToken: 'test-token' });
    mockCheckPermission.mockReturnValue(true);

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/analyze', {
      method: 'POST',
    });
    const params = Promise.resolve({ id: 'session-1' });

    await POST(request, { params });

    expect(mockGeminiService.analyzeSubmissions).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        problemTitle: 'Test Problem',
        problemDescription: 'Test description',
        starterCode: 'print("Hello")',
        submissions: expect.arrayContaining([
          expect.objectContaining({ studentId: 'user-1' }),
          expect.objectContaining({ studentId: 'user-2' }),
        ]),
      })
    );
  });

  it('returns 401 when not authenticated', async () => {
    mockGetAuthenticatedUserWithToken.mockRejectedValue(new Error('Not authenticated'));

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/analyze', {
      method: 'POST',
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });

    expect(response.status).toBe(401);
  });

  it('returns 403 when user lacks data.viewAll permission', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockInstructor, accessToken: 'test-token' });
    mockCheckPermission.mockReturnValue(false);

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/analyze', {
      method: 'POST',
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain('permission');
  });

  it('returns 503 when Gemini not configured', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockInstructor, accessToken: 'test-token' });
    mockCheckPermission.mockReturnValue(true);
    (mockGeminiService.isConfigured as jest.Mock).mockReturnValue(false);

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/analyze', {
      method: 'POST',
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toContain('not configured');
  });

  it('returns 404 when session not found', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockInstructor, accessToken: 'test-token' });
    mockCheckPermission.mockReturnValue(true);
    mockStorage.sessions.getSession.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/analyze', {
      method: 'POST',
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Session not found');
  });

  it('returns 429 on rate limit error', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockInstructor, accessToken: 'test-token' });
    mockCheckPermission.mockReturnValue(true);
    (mockGeminiService.analyzeSubmissions as jest.Mock).mockRejectedValue(
      new Error('Rate limit exceeded')
    );

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/analyze', {
      method: 'POST',
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });

    expect(response.status).toBe(429);
  });

  it('returns 429 when per-minute rate limit is exceeded', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockInstructor, accessToken: 'test-token' });
    const rateLimitResponse = new Response(
      JSON.stringify({ error: 'Too many requests. Please try again later.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
    mockRateLimit.mockResolvedValue(rateLimitResponse);

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/analyze', {
      method: 'POST',
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });

    expect(response.status).toBe(429);
    // Restore default mock
    mockRateLimit.mockResolvedValue(null);
  });

  it('returns 429 when daily user limit is exceeded', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockInstructor, accessToken: 'test-token' });
    const dailyLimitResponse = new Response(
      JSON.stringify({ error: 'Daily analysis limit reached (100 per day). Please try again tomorrow.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
    mockCheckAnalyzeDailyLimits.mockResolvedValue(dailyLimitResponse);

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/analyze', {
      method: 'POST',
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toContain('Daily analysis limit reached');
    // Restore default mock
    mockCheckAnalyzeDailyLimits.mockResolvedValue(null);
  });

  it('returns 429 when global daily limit is exceeded', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockInstructor, accessToken: 'test-token' });
    const globalLimitResponse = new Response(
      JSON.stringify({ error: 'Global daily analysis limit reached. Please try again tomorrow.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
    mockCheckAnalyzeDailyLimits.mockResolvedValue(globalLimitResponse);

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/analyze', {
      method: 'POST',
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toContain('Global daily analysis limit');
    // Restore default mock
    mockCheckAnalyzeDailyLimits.mockResolvedValue(null);
  });

  it('calls checkAnalyzeDailyLimits with request and user ID', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockInstructor, accessToken: 'test-token' });
    mockCheckPermission.mockReturnValue(true);

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/analyze', {
      method: 'POST',
    });
    const params = Promise.resolve({ id: 'session-1' });

    await POST(request, { params });

    expect(mockCheckAnalyzeDailyLimits).toHaveBeenCalledWith(request, 'instructor-1');
  });

  it('returns 503 on model overloaded error', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockInstructor, accessToken: 'test-token' });
    mockCheckPermission.mockReturnValue(true);
    (mockGeminiService.analyzeSubmissions as jest.Mock).mockRejectedValue(
      new Error('AI model is temporarily overloaded. Please try again in a few moments.')
    );

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/analyze', {
      method: 'POST',
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toContain('overloaded');
  });

  it('returns 504 on timeout error', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockInstructor, accessToken: 'test-token' });
    mockCheckPermission.mockReturnValue(true);
    (mockGeminiService.analyzeSubmissions as jest.Mock).mockRejectedValue(
      new Error('Analysis timed out')
    );

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/analyze', {
      method: 'POST',
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });

    expect(response.status).toBe(504);
  });

  it('returns 503 on API key error', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockInstructor, accessToken: 'test-token' });
    mockCheckPermission.mockReturnValue(true);
    (mockGeminiService.analyzeSubmissions as jest.Mock).mockRejectedValue(
      new Error('Invalid Gemini API key')
    );

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/analyze', {
      method: 'POST',
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });

    expect(response.status).toBe(503);
  });

  it('returns 500 on unknown error', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockInstructor, accessToken: 'test-token' });
    mockCheckPermission.mockReturnValue(true);
    (mockGeminiService.analyzeSubmissions as jest.Mock).mockRejectedValue(
      new Error('Something went wrong')
    );

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/analyze', {
      method: 'POST',
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to analyze code');
  });

  it('handles session with no students', async () => {
    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockInstructor, accessToken: 'test-token' });
    mockCheckPermission.mockReturnValue(true);

    const emptySession = { ...mockSession, students: new Map() };
    mockStorage.sessions.getSession.mockResolvedValue(emptySession);

    const emptyScript: WalkthroughScript = {
      sessionId: 'session-1',
      issues: [],
      finishedStudentIds: [],
      summary: {
        totalSubmissions: 0,
        filteredOut: 0,
        analyzedSubmissions: 0,
        completionEstimate: { finished: 0, inProgress: 0, notStarted: 0 },
        warning: 'No submissions to analyze',
      },
      generatedAt: new Date(),
    };
    (mockGeminiService.analyzeSubmissions as jest.Mock).mockResolvedValue(emptyScript);

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/analyze', {
      method: 'POST',
    });
    const params = Promise.resolve({ id: 'session-1' });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.script.summary.totalSubmissions).toBe(0);
  });
});

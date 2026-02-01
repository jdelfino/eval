/**
 * Tests for GET /api/sessions/[id]/public-state route
 *
 * This endpoint returns session state for the public display view.
 * Requires instructor authentication as it's shown on the instructor's projector.
 */

import { NextRequest } from 'next/server';
import { GET } from '../route';
import { getAuthenticatedUserWithToken, checkPermission } from '@/server/auth/api-auth';
import { createStorage } from '@/server/persistence';
import { Session } from '@/server/types';
import { Problem } from '@/server/types/problem';

jest.mock('@/server/auth/api-auth');
jest.mock('@/server/persistence');

const mockGetAuthenticatedUserWithToken = getAuthenticatedUserWithToken as jest.MockedFunction<typeof getAuthenticatedUserWithToken>;
const mockCheckPermission = checkPermission as jest.MockedFunction<typeof checkPermission>;

const mockCreateStorage = createStorage as jest.MockedFunction<typeof createStorage>;

describe('GET /api/sessions/[id]/public-state', () => {
  const mockUser = {
    id: 'user-1',
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
    creatorId: 'user-1',
    participants: [],
    status: 'active',
    sectionId: 'section-1',
    sectionName: 'Test Section',
    featuredStudentId: 'student-1',
    featuredCode: 'print("Featured Code")',
  };

  const mockSection = {
    id: 'section-1',
    namespaceId: 'default',
    name: 'Test Section',
    classId: 'class-1',
    joinCode: 'ABC-123',
    createdAt: new Date(),
    updatedAt: new Date(),
    instructorId: 'user-1',
    activeSessionId: 'session-1',
  };

  let mockStorage: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetAuthenticatedUserWithToken.mockResolvedValue({ user: mockUser, accessToken: 'test-token' });
    mockCheckPermission.mockReturnValue(true);

    mockStorage = {
      sessions: {
        getSession: jest.fn().mockResolvedValue(mockSession),
      },
      sections: {
        getSection: jest.fn().mockResolvedValue(mockSection),
      },
    };

    mockCreateStorage.mockResolvedValue(mockStorage);
  });

  it('returns session state for authenticated instructor', async () => {
    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/public-state');
    const params = Promise.resolve({ id: 'session-1' });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessionId).toBe('session-1');
    expect(data.joinCode).toBe('ABC-123');
    expect(data.featuredStudentId).toBe('student-1');
    expect(data.featuredCode).toBe('print("Featured Code")');
    expect(data.hasFeaturedSubmission).toBe(true);
    // Verify problem fields (dates are serialized to ISO strings in JSON)
    expect(data.problem.id).toBe('prob-1');
    expect(data.problem.title).toBe('Test Problem');
    expect(data.problem.description).toBe('Test description');
  });

  it('returns hasFeaturedSubmission false when no featured student', async () => {
    mockStorage.sessions.getSession.mockResolvedValue({
      ...mockSession,
      featuredStudentId: null,
      featuredCode: null,
    });

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/public-state');
    const params = Promise.resolve({ id: 'session-1' });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasFeaturedSubmission).toBe(false);
    expect(data.featuredStudentId).toBeNull();
    expect(data.featuredCode).toBeNull();
  });

  it('returns hasFeaturedSubmission false when only studentId but no code', async () => {
    mockStorage.sessions.getSession.mockResolvedValue({
      ...mockSession,
      featuredStudentId: 'student-1',
      featuredCode: null,
    });

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/public-state');
    const params = Promise.resolve({ id: 'session-1' });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasFeaturedSubmission).toBe(false);
  });

  it('returns 404 when session not found', async () => {
    mockStorage.sessions.getSession.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/public-state');
    const params = Promise.resolve({ id: 'session-1' });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Session not found');
  });

  it('returns empty joinCode when section not found', async () => {
    mockStorage.sections.getSection.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/public-state');
    const params = Promise.resolve({ id: 'session-1' });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.joinCode).toBe('');
  });

  it('handles session with no problem set', async () => {
    mockStorage.sessions.getSession.mockResolvedValue({
      ...mockSession,
      problem: null,
    });

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/public-state');
    const params = Promise.resolve({ id: 'session-1' });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.problem).toBeNull();
  });

  it('returns 500 on server error', async () => {
    mockStorage.sessions.getSession.mockRejectedValue(new Error('Database error'));

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/public-state');
    const params = Promise.resolve({ id: 'session-1' });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to load session state');
  });

  it('returns 401 when not authenticated', async () => {
    mockGetAuthenticatedUserWithToken.mockRejectedValue(new Error('Not authenticated'));

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/public-state');
    const params = Promise.resolve({ id: 'session-1' });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Not authenticated');
  });

  it('returns 403 when user lacks permission', async () => {
    mockCheckPermission.mockReturnValue(false);

    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/public-state');
    const params = Promise.resolve({ id: 'session-1' });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Permission denied');
  });

  it('does not expose sensitive session data', async () => {
    const request = new NextRequest('http://localhost:3000/api/sessions/session-1/public-state');
    const params = Promise.resolve({ id: 'session-1' });

    const response = await GET(request, { params });
    const data = await response.json();

    // Should not expose students map, creatorId, or other internal data
    expect(data).not.toHaveProperty('students');
    expect(data).not.toHaveProperty('creatorId');
    expect(data).not.toHaveProperty('participants');
    expect(data).not.toHaveProperty('namespaceId');
    expect(data).not.toHaveProperty('status');
  });
});

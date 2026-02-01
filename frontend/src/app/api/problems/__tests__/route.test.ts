/**
 * Tests for /api/problems endpoints
 *
 * Tests:
 * - GET /api/problems - List problems with filters
 * - POST /api/problems - Create new problem
 *
 * Coverage:
 * - Authentication checks
 * - Authorization (instructors/admins only for POST)
 * - Query parameter filtering (authorId, classId, includePublic, sortBy, sortOrder)
 * - Validation and error handling
 * - Edge cases (empty lists, invalid inputs)
 */

import { NextRequest, NextResponse } from 'next/server';
import { GET, POST } from '../route';
import { createStorage } from '@/server/persistence';

// Mock dependencies
jest.mock('@/server/persistence');

jest.mock('@/server/auth/api-helpers', () => ({
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
  getNamespaceContext: jest.fn((req: any, user: any) => user.namespaceId || 'default'),
}));

import { requireAuth, getNamespaceContext } from '@/server/auth/api-helpers';
import type { User } from '@/server/auth/types';
import { RBACService } from '@/server/auth/rbac';

const mockCreateStorage = createStorage as jest.MockedFunction<typeof createStorage>;

// Test helper to create mock auth context
function createAuthContext(user: User) {
  return {
    user,
    accessToken: 'test-access-token',
    rbac: new RBACService(user),
  };
}

describe('/api/problems', () => {
  const mockProblems = [
    {
      id: 'problem-1',
      title: 'Problem 1',
      description: 'Description 1',
      starterCode: 'def solution():\n    pass',
      testCases: [],
      authorId: 'user-1',
      classId: 'class-1',
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
    },
    {
      id: 'problem-2',
      title: 'Problem 2',
      description: 'Description 2',
      starterCode: '',
      testCases: [],
      authorId: 'user-2',
      classId: 'class-2',
      createdAt: new Date('2025-01-02'),
      updatedAt: new Date('2025-01-02'),
    },
  ];

  const mockInstructorUser: User = {
    id: 'user-1',
    email: "test@example.com",
    role: 'instructor' as const,
    namespaceId: 'default',
    createdAt: new Date('2025-01-01'),
  };

  const mockStudentUser: User = {
    id: 'user-3',
    email: "test@example.com",
    role: 'student' as const,
    namespaceId: 'default',
    createdAt: new Date('2025-01-01'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/problems', () => {
    it('should return 401 when not authenticated', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      );

      const request = new NextRequest('http://localhost/api/problems');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Not authenticated');
    });

    it('should return 401 when session is invalid', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'Session expired' }, { status: 401 })
      );

      const request = new NextRequest('http://localhost/api/problems', {
        headers: { Cookie: 'sessionId=invalid' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Session expired');
    });

    it('should return all problems when authenticated', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(mockInstructorUser));

      const getAllMock = jest.fn().mockResolvedValue(mockProblems);
      mockCreateStorage.mockResolvedValue({
        problems: {
          getAll: getAllMock,
        },
      } as any);

      const request = new NextRequest('http://localhost/api/problems', {
        headers: { Cookie: 'sessionId=valid' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.problems).toHaveLength(2);
      expect(data.problems[0].title).toBe('Problem 1');
      expect(getAllMock).toHaveBeenCalledWith(expect.objectContaining({
        namespaceId: 'default',
      }));
    });

    it('should filter by authorId', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(mockInstructorUser));

      const filteredProblems = mockProblems.filter(p => p.authorId === 'user-1');
      const getAllMock = jest.fn().mockResolvedValue(filteredProblems);
      mockCreateStorage.mockResolvedValue({
        problems: {
          getAll: getAllMock,
        },
      } as any);

      const request = new NextRequest('http://localhost/api/problems?authorId=user-1', {
        headers: { Cookie: 'sessionId=valid' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.problems).toHaveLength(1);
      expect(data.problems[0].authorId).toBe('user-1');
      expect(getAllMock).toHaveBeenCalledWith(expect.objectContaining({
        authorId: 'user-1',
        namespaceId: 'default',
      }));
    });

    it('should filter by classId', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(mockInstructorUser));

      const filteredProblems = mockProblems.filter(p => p.classId === 'class-1');
      const getAllMock = jest.fn().mockResolvedValue(filteredProblems);
      mockCreateStorage.mockResolvedValue({
        problems: {
          getAll: getAllMock,
        },
      } as any);

      const request = new NextRequest('http://localhost/api/problems?classId=class-1', {
        headers: { Cookie: 'sessionId=valid' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.problems).toHaveLength(1);
      expect(data.problems[0].classId).toBe('class-1');
      expect(getAllMock).toHaveBeenCalledWith(expect.objectContaining({
        classId: 'class-1',
        namespaceId: 'default',
      }));
    });

    it('should handle includePublic parameter', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(mockInstructorUser));

      const getAllMock = jest.fn().mockResolvedValue(mockProblems);
      mockCreateStorage.mockResolvedValue({
        problems: {
          getAll: getAllMock,
        },
      } as any);

      const request = new NextRequest('http://localhost/api/problems?includePublic=false', {
        headers: { Cookie: 'sessionId=valid' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(getAllMock).toHaveBeenCalledWith(
        expect.objectContaining({ includePublic: false, namespaceId: 'default' })
      );
    });

    it('should handle sortBy and sortOrder parameters', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(mockInstructorUser));

      const getAllMock = jest.fn().mockResolvedValue(mockProblems);
      mockCreateStorage.mockResolvedValue({
        problems: {
          getAll: getAllMock,
        },
      } as any);

      const request = new NextRequest('http://localhost/api/problems?sortBy=title&sortOrder=asc', {
        headers: { Cookie: 'sessionId=valid' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(getAllMock).toHaveBeenCalledWith(
        expect.objectContaining({ sortBy: 'title', sortOrder: 'asc', namespaceId: 'default' })
      );
    });

    it('should filter by tags query parameter', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(mockInstructorUser));

      const getAllMock = jest.fn().mockResolvedValue([mockProblems[0]]);
      mockCreateStorage.mockResolvedValue({
        problems: {
          getAll: getAllMock,
        },
      } as any);

      const request = new NextRequest('http://localhost/api/problems?tags=loops,basics', {
        headers: { Cookie: 'sessionId=valid' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(getAllMock).toHaveBeenCalledWith(expect.objectContaining({
        tags: ['loops', 'basics'],
        namespaceId: 'default',
      }));
    });

    it('should return empty array when no problems exist', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(mockInstructorUser));

      mockCreateStorage.mockResolvedValue({
        problems: {
          getAll: jest.fn().mockResolvedValue([]),
        },
      } as any);

      const request = new NextRequest('http://localhost/api/problems', {
        headers: { Cookie: 'sessionId=valid' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.problems).toEqual([]);
    });

    it('should handle server errors gracefully', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(mockInstructorUser));

      mockCreateStorage.mockResolvedValue({
        problems: {
          getAll: jest.fn().mockRejectedValue(new Error('Database error')),
        },
      } as any);

      const request = new NextRequest('http://localhost/api/problems', {
        headers: { Cookie: 'sessionId=valid' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Database error');
    });
  });

  describe('POST /api/problems', () => {
    const validProblemInput = {
      title: 'New Problem',
      description: 'New problem description',
      starterCode: 'def solution():\n    pass',
      testCases: [],
      classId: 'class-1',
    };

    it('should return 401 when not authenticated', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      );

      const request = new NextRequest('http://localhost/api/problems', {
        method: 'POST',
        body: JSON.stringify(validProblemInput),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Not authenticated');
    });

    it('should return 401 when session is invalid', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'Session expired' }, { status: 401 })
      );

      const request = new NextRequest('http://localhost/api/problems', {
        method: 'POST',
        headers: { Cookie: 'sessionId=invalid' },
        body: JSON.stringify(validProblemInput),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Session expired');
    });

    it('should return 403 when user is not an instructor', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(mockStudentUser));

      const request = new NextRequest('http://localhost/api/problems', {
        method: 'POST',
        headers: { Cookie: 'sessionId=valid' },
        body: JSON.stringify(validProblemInput),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden: Only instructors can create problems');
    });

    it('should create problem successfully for instructor', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(mockInstructorUser));

      const createdProblem = {
        ...validProblemInput,
        id: 'problem-new',
        authorId: 'user-1',
        namespaceId: 'default',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const createMock = jest.fn().mockResolvedValue(createdProblem);
      mockCreateStorage.mockResolvedValue({
        problems: {
          create: createMock,
        },
      } as any);

      const request = new NextRequest('http://localhost/api/problems', {
        method: 'POST',
        headers: { Cookie: 'sessionId=valid' },
        body: JSON.stringify(validProblemInput),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.problem).toMatchObject({
        title: 'New Problem',
        authorId: 'user-1',
      });
      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
        namespaceId: 'default',
        authorId: 'user-1',
      }));
    });

    it('should return 400 when classId is missing', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(mockInstructorUser));

      const request = new NextRequest('http://localhost/api/problems', {
        method: 'POST',
        headers: { Cookie: 'sessionId=valid' },
        body: JSON.stringify({ title: 'No Class' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('classId is required');
    });

    it('should create problem with minimal fields', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(mockInstructorUser));

      const minimalInput = {
        title: 'Minimal Problem',
        classId: 'class-1',
      };

      const createdProblem = {
        id: 'problem-minimal',
        title: 'Minimal Problem',
        description: '',
        starterCode: '',
        testCases: [],
        authorId: 'user-1',
        namespaceId: 'default',
        classId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCreateStorage.mockResolvedValue({
        problems: {
          create: jest.fn().mockResolvedValue(createdProblem),
        },
      } as any);

      const request = new NextRequest('http://localhost/api/problems', {
        method: 'POST',
        headers: { Cookie: 'sessionId=valid' },
        body: JSON.stringify(minimalInput),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.problem.title).toBe('Minimal Problem');
      expect(data.problem.authorId).toBe('user-1');
    });

    it('should handle validation errors', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(mockInstructorUser));

      const validationError = {
        code: 'INVALID_DATA',
        message: 'Title is required',
        details: { field: 'title' },
      };

      mockCreateStorage.mockResolvedValue({
        problems: {
          create: jest.fn().mockRejectedValue(validationError),
        },
      } as any);

      const request = new NextRequest('http://localhost/api/problems', {
        method: 'POST',
        headers: { Cookie: 'sessionId=valid' },
        body: JSON.stringify({ title: '', classId: 'class-1' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Title is required');
      expect(data.details).toEqual({ field: 'title' });
    });

    it('should handle server errors', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(mockInstructorUser));

      mockCreateStorage.mockResolvedValue({
        problems: {
          create: jest.fn().mockRejectedValue(new Error('Database error')),
        },
      } as any);

      const request = new NextRequest('http://localhost/api/problems', {
        method: 'POST',
        headers: { Cookie: 'sessionId=valid' },
        body: JSON.stringify(validProblemInput),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Database error');
    });

    it('should handle malformed JSON', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(mockInstructorUser));

      const request = new NextRequest('http://localhost/api/problems', {
        method: 'POST',
        headers: { Cookie: 'sessionId=valid' },
        body: 'invalid json',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBeTruthy();
    });

    it('should set authorId to current user', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(mockInstructorUser));

      let capturedInput: any;
      mockCreateStorage.mockResolvedValue({
        problems: {
          create: jest.fn().mockImplementation((input) => {
            capturedInput = input;
            return Promise.resolve({ ...input, id: 'problem-new', createdAt: new Date(), updatedAt: new Date() });
          }),
        },
      } as any);

      const request = new NextRequest('http://localhost/api/problems', {
        method: 'POST',
        headers: { Cookie: 'sessionId=valid' },
        body: JSON.stringify(validProblemInput),
      });

      await POST(request);

      expect(capturedInput.authorId).toBe('user-1');
      expect(capturedInput.namespaceId).toBe('default');
    });

    it('should handle problems with test cases', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(mockInstructorUser));

      const inputWithTests = {
        ...validProblemInput,
        testCases: [
          {
            id: 'test-1',
            name: 'Test 1',
            input: 'test input',
            expectedOutput: 'test output',
          },
        ],
      };

      const createdProblem = {
        ...inputWithTests,
        id: 'problem-with-tests',
        authorId: 'user-1',
        namespaceId: 'default',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCreateStorage.mockResolvedValue({
        problems: {
          create: jest.fn().mockResolvedValue(createdProblem),
        },
      } as any);

      const request = new NextRequest('http://localhost/api/problems', {
        method: 'POST',
        headers: { Cookie: 'sessionId=valid' },
        body: JSON.stringify(inputWithTests),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.problem.testCases).toHaveLength(1);
      expect(data.problem.testCases[0].name).toBe('Test 1');
    });

    it('should include executionSettings when provided', async () => {
      (requireAuth as jest.Mock).mockResolvedValue(createAuthContext(mockInstructorUser));

      const inputWithExecSettings = {
        ...validProblemInput,
        executionSettings: {
          stdin: 'test input\n',
          randomSeed: 42,
          attachedFiles: [
            { name: 'input.txt', content: 'file content' },
          ],
        },
      };

      let capturedInput: any;
      mockCreateStorage.mockResolvedValue({
        problems: {
          create: jest.fn().mockImplementation((input) => {
            capturedInput = input;
            return Promise.resolve({
              ...input,
              id: 'problem-exec',
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }),
        },
      } as any);

      const request = new NextRequest('http://localhost/api/problems', {
        method: 'POST',
        headers: { Cookie: 'sessionId=valid' },
        body: JSON.stringify(inputWithExecSettings),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(capturedInput.executionSettings).toBeDefined();
      expect(capturedInput.executionSettings.stdin).toBe('test input\n');
      expect(capturedInput.executionSettings.randomSeed).toBe(42);
      expect(capturedInput.executionSettings.attachedFiles).toHaveLength(1);
      expect(capturedInput.executionSettings.attachedFiles[0].name).toBe('input.txt');
      expect(data.problem.executionSettings).toBeDefined();
    });
  });
});

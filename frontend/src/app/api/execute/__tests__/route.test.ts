/**
 * Tests for /api/execute route (instructor preview execution)
 *
 * @jest-environment node
 */

import { POST } from '../route';
import { NextRequest } from 'next/server';

// Mock auth
const mockGetAuthenticatedUserWithToken = jest.fn();
jest.mock('@/server/auth/api-auth', () => ({
  getAuthenticatedUserWithToken: (...args: unknown[]) => mockGetAuthenticatedUserWithToken(...args),
}));

// Mock executor service for local dev
const mockExecuteCode = jest.fn();
jest.mock('@/server/code-execution', () => ({
  getExecutorService: jest.fn(() => ({
    executeCode: mockExecuteCode,
  })),
}));

// Mock rate limiter
jest.mock('@/server/rate-limit', () => ({
  rateLimit: jest.fn(() => null),
}));

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/execute', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/execute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: not on Vercel (local dev)
    delete process.env.VERCEL;
    delete process.env.VERCEL_SANDBOX_ENABLED;
  });

  describe('Authentication', () => {
    it('should return 401 when not authenticated', async () => {
      mockGetAuthenticatedUserWithToken.mockRejectedValue(new Error('Not authenticated'));

      const request = createRequest({ code: 'print("hello")' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('Authorization', () => {
    it('should return 403 when user is a student', async () => {
      mockGetAuthenticatedUserWithToken.mockResolvedValue({
        user: { id: 'student-1', role: 'student' },
        accessToken: 'token',
      });

      const request = createRequest({ code: 'print("hello")' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Only instructors');
    });

    it('should allow instructors', async () => {
      mockGetAuthenticatedUserWithToken.mockResolvedValue({
        user: { id: 'instructor-1', role: 'instructor' },
        accessToken: 'token',
      });
      mockExecuteCode.mockResolvedValue({
        success: true,
        output: 'hello\n',
        error: '',
        executionTime: 100,
      });

      const request = createRequest({ code: 'print("hello")' });
      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it('should allow namespace-admin', async () => {
      mockGetAuthenticatedUserWithToken.mockResolvedValue({
        user: { id: 'admin-1', role: 'namespace-admin' },
        accessToken: 'token',
      });
      mockExecuteCode.mockResolvedValue({
        success: true,
        output: 'hello\n',
        error: '',
        executionTime: 100,
      });

      const request = createRequest({ code: 'print("hello")' });
      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it('should allow system-admin', async () => {
      mockGetAuthenticatedUserWithToken.mockResolvedValue({
        user: { id: 'sysadmin-1', role: 'system-admin' },
        accessToken: 'token',
      });
      mockExecuteCode.mockResolvedValue({
        success: true,
        output: 'hello\n',
        error: '',
        executionTime: 100,
      });

      const request = createRequest({ code: 'print("hello")' });
      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Validation', () => {
    beforeEach(() => {
      mockGetAuthenticatedUserWithToken.mockResolvedValue({
        user: { id: 'instructor-1', role: 'instructor' },
        accessToken: 'token',
      });
    });

    it('should return 400 when code is missing', async () => {
      const request = createRequest({});
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Code is required');
    });

    it('should return 400 when code is not a string', async () => {
      const request = createRequest({ code: 123 });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Code is required');
    });
  });

  describe('Local development execution', () => {
    beforeEach(() => {
      mockGetAuthenticatedUserWithToken.mockResolvedValue({
        user: { id: 'instructor-1', role: 'instructor' },
        accessToken: 'token',
      });
    });

    it('should execute code via executor service', async () => {
      mockExecuteCode.mockResolvedValue({
        success: true,
        output: 'Hello, World!\n',
        error: '',
        executionTime: 150,
      });

      const request = createRequest({
        code: 'print("Hello, World!")',
        stdin: 'test input',
        randomSeed: 42,
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.output).toBe('Hello, World!\n');

      expect(mockExecuteCode).toHaveBeenCalledWith(
        {
          code: 'print("Hello, World!")',
          executionSettings: {
            stdin: 'test input',
            randomSeed: 42,
            attachedFiles: undefined,
          },
        },
        undefined
      );
    });

    it('should pass timeout to executor service', async () => {
      mockExecuteCode.mockResolvedValue({
        success: true,
        output: '',
        error: '',
        executionTime: 100,
      });

      const request = createRequest({
        code: 'print("test")',
        timeout: 5000,
      });
      await POST(request);

      expect(mockExecuteCode).toHaveBeenCalledWith(
        expect.any(Object),
        5000
      );
    });

    it('should execute code with attached files', async () => {
      mockExecuteCode.mockResolvedValue({
        success: true,
        output: 'file content\n',
        error: '',
        executionTime: 175,
      });

      const attachedFiles = [{ name: 'data.txt', content: 'file content' }];

      const request = createRequest({
        code: 'with open("data.txt") as f:\n    print(f.read())',
        attachedFiles,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockExecuteCode).toHaveBeenCalledWith(
        {
          code: 'with open("data.txt") as f:\n    print(f.read())',
          executionSettings: {
            stdin: undefined,
            randomSeed: undefined,
            attachedFiles,
          },
        },
        undefined
      );
    });

    it('should handle execution errors', async () => {
      mockExecuteCode.mockResolvedValue({
        success: false,
        output: '',
        error: 'NameError: name "x" is not defined',
        executionTime: 100,
      });

      const request = createRequest({ code: 'print(x)' });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(false);
      expect(data.error).toContain('NameError');
    });

    it('should handle unexpected errors', async () => {
      mockExecuteCode.mockRejectedValue(new Error('Unexpected error'));

      const request = createRequest({ code: 'print("test")' });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Unexpected error');
    });
  });
});

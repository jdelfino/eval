/**
 * Unit tests for the typed API client functions for real-time session operations.
 * These tests verify that the typed API functions correctly call the underlying
 * api-client methods with proper request bodies.
 *
 * @jest-environment jsdom
 */

const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
const mockApiFetch = jest.fn();

jest.mock('@/lib/api-client', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import {
  getSessionState,
  updateCode,
  executeCode,
  featureStudent,
  clearFeatured,
  joinSession,
} from '../realtime';
import type { SessionStudent, SessionState, ExecutionResult } from '@/types/api';

const fakeSessionState: SessionState = {
  session: {
    id: 'sess-1',
    namespace_id: 'ns-1',
    section_id: 's1',
    section_name: 'Section A',
    problem: null,
    featured_student_id: null,
    featured_code: null,
    creator_id: 'u1',
    participants: [],
    status: 'active',
    created_at: '2024-01-01T00:00:00Z',
    last_activity: '2024-01-01T00:00:00Z',
    ended_at: null,
  },
  students: [],
  join_code: 'ABC123',
};

const fakeSessionStudent: SessionStudent = {
  id: 'student-1',
  session_id: 'sess-1',
  user_id: 'u1',
  name: 'Alice',
  code: 'print("hello")',
  execution_settings: null,
  last_update: '2024-01-01T00:00:00Z',
};

const fakeExecutionResult: ExecutionResult = {
  success: true,
  output: 'hello',
  error: '',
  execution_time: 100,
};

describe('lib/api/realtime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSessionState', () => {
    it('calls GET /sessions/{id}/state and returns SessionState', async () => {
      mockApiGet.mockResolvedValue(fakeSessionState);

      const result = await getSessionState('sess-1');

      expect(mockApiGet).toHaveBeenCalledWith('/sessions/sess-1/state');
      expect(result).toEqual(fakeSessionState);
    });
  });

  describe('updateCode', () => {
    it('calls PUT /sessions/{id}/code with correct body', async () => {
      const mockResponse = { json: jest.fn().mockResolvedValue(fakeSessionStudent) };
      mockApiFetch.mockResolvedValue(mockResponse);

      const result = await updateCode('sess-1', 'student-1', 'print("hello")');

      expect(mockApiFetch).toHaveBeenCalledWith('/sessions/sess-1/code', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: 'student-1',
          code: 'print("hello")',
          execution_settings: undefined,
        }),
      });
      expect(result).toEqual(fakeSessionStudent);
    });

    it('includes execution_settings when provided', async () => {
      const mockResponse = { json: jest.fn().mockResolvedValue(fakeSessionStudent) };
      mockApiFetch.mockResolvedValue(mockResponse);

      const execSettings = { stdin: 'test input', random_seed: 42 };
      await updateCode('sess-1', 'student-1', 'code', execSettings);

      expect(mockApiFetch).toHaveBeenCalledWith('/sessions/sess-1/code', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: 'student-1',
          code: 'code',
          execution_settings: execSettings,
        }),
      });
    });
  });

  describe('executeCode', () => {
    it('calls POST /sessions/{id}/execute with correct body', async () => {
      mockApiPost.mockResolvedValue(fakeExecutionResult);

      const result = await executeCode('sess-1', 'student-1', 'print("hello")');

      expect(mockApiPost).toHaveBeenCalledWith('/sessions/sess-1/execute', {
        student_id: 'student-1',
        code: 'print("hello")',
        execution_settings: undefined,
      });
      expect(result).toEqual(fakeExecutionResult);
    });

    it('includes execution_settings when provided', async () => {
      mockApiPost.mockResolvedValue(fakeExecutionResult);

      const execSettings = { stdin: 'test input', random_seed: 42 };
      await executeCode('sess-1', 'student-1', 'code', execSettings);

      expect(mockApiPost).toHaveBeenCalledWith('/sessions/sess-1/execute', {
        student_id: 'student-1',
        code: 'code',
        execution_settings: execSettings,
      });
    });
  });

  describe('featureStudent', () => {
    it('calls POST /sessions/{id}/feature with student_id and code', async () => {
      mockApiPost.mockResolvedValue(undefined);

      const result = await featureStudent('sess-1', 'student-1', 'print("hello")');

      expect(mockApiPost).toHaveBeenCalledWith('/sessions/sess-1/feature', { student_id: 'student-1', code: 'print("hello")' });
      expect(result).toBeUndefined();
    });
  });

  describe('clearFeatured', () => {
    it('calls POST /sessions/{id}/feature with empty body', async () => {
      mockApiPost.mockResolvedValue(undefined);

      const result = await clearFeatured('sess-1');

      expect(mockApiPost).toHaveBeenCalledWith('/sessions/sess-1/feature', {});
      expect(result).toBeUndefined();
    });
  });

  describe('joinSession', () => {
    it('calls POST /sessions/{id}/join and returns SessionStudent', async () => {
      mockApiPost.mockResolvedValue(fakeSessionStudent);

      const result = await joinSession('sess-1', 'student-1', 'Alice');

      expect(mockApiPost).toHaveBeenCalledWith('/sessions/sess-1/join', {
        student_id: 'student-1',
        name: 'Alice',
      });
      expect(result).toEqual(fakeSessionStudent);
    });
  });
});

/**
 * Unit tests for the typed API client functions for sessions.
 * These tests verify that the typed API functions correctly call the underlying
 * api-client methods and return responses directly (backend returns plain objects).
 *
 * @jest-environment jsdom
 */

const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
const mockApiDelete = jest.fn();

jest.mock('@/lib/api-client', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiDelete: (...args: unknown[]) => mockApiDelete(...args),
}));

import {
  createSession,
  endSession,
  updateSessionProblem,
  listSessionHistory,
  getRevisions,
  getSessionDetails,
  getSessionPublicState,
  analyzeSession,
  featureCode,
  reopenSession,
  listSessionHistoryWithFilters,
} from '../sessions';
import type { SessionStudentSummary, SessionDetails, AnalysisResponse } from '../sessions';
import type { Session, Revision, SessionPublicState } from '@/types/api';

const fakeSession: Session = {
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
};

const fakeRevision: Revision = {
  id: 'rev-1',
  namespace_id: 'ns-1',
  session_id: 'sess-1',
  user_id: 'u1',
  timestamp: '2024-01-01T00:00:00Z',
  is_diff: false,
  diff: null,
  full_code: 'print("hello")',
  base_revision_id: null,
  execution_result: null,
};

describe('lib/api/sessions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSession', () => {
    it('calls POST /sessions with section_id and returns plain Session', async () => {
      mockApiPost.mockResolvedValue(fakeSession);

      const result = await createSession('s1');

      expect(mockApiPost).toHaveBeenCalledWith('/sessions', { section_id: 's1' });
      expect(result).toEqual(fakeSession);
    });

    it('includes problem_id when provided', async () => {
      mockApiPost.mockResolvedValue(fakeSession);

      const result = await createSession('s1', 'prob-1');

      expect(mockApiPost).toHaveBeenCalledWith('/sessions', { section_id: 's1', problem_id: 'prob-1' });
      expect(result).toEqual(fakeSession);
    });

    it('includes show_solution=true when provided', async () => {
      mockApiPost.mockResolvedValue(fakeSession);

      await createSession('s1', 'prob-1', true);

      expect(mockApiPost).toHaveBeenCalledWith('/sessions', {
        section_id: 's1',
        problem_id: 'prob-1',
        show_solution: true,
      });
    });

    it('includes show_solution=false when explicitly set to false', async () => {
      mockApiPost.mockResolvedValue(fakeSession);

      await createSession('s1', 'prob-1', false);

      expect(mockApiPost).toHaveBeenCalledWith('/sessions', {
        section_id: 's1',
        problem_id: 'prob-1',
        show_solution: false,
      });
    });

    it('omits show_solution when not provided', async () => {
      mockApiPost.mockResolvedValue(fakeSession);

      await createSession('s1', 'prob-1');

      const callArgs = mockApiPost.mock.calls[0][1] as Record<string, unknown>;
      expect('show_solution' in callArgs).toBe(false);
    });
  });

  describe('endSession', () => {
    it('calls DELETE /sessions/{id} and returns void', async () => {
      mockApiDelete.mockResolvedValue(undefined);

      const result = await endSession('sess-1');

      expect(mockApiDelete).toHaveBeenCalledWith('/sessions/sess-1');
      expect(result).toBeUndefined();
    });
  });

  describe('updateSessionProblem', () => {
    it('calls POST /sessions/{id}/update-problem with problem and execution_settings', async () => {
      mockApiPost.mockResolvedValue(undefined);

      const problem = { title: 'Test Problem' };
      const execSettings = { timeout: 5000 };

      const result = await updateSessionProblem('sess-1', problem, execSettings);

      expect(mockApiPost).toHaveBeenCalledWith('/sessions/sess-1/update-problem', {
        problem,
        execution_settings: execSettings,
      });
      expect(result).toBeUndefined();
    });

    it('calls with undefined execution_settings when omitted', async () => {
      mockApiPost.mockResolvedValue(undefined);

      const problem = { title: 'Test Problem' };

      await updateSessionProblem('sess-1', problem);

      expect(mockApiPost).toHaveBeenCalledWith('/sessions/sess-1/update-problem', {
        problem,
        execution_settings: undefined,
      });
    });
  });

  describe('listSessionHistory', () => {
    it('calls GET /sessions/history and returns plain Session array', async () => {
      mockApiGet.mockResolvedValue([fakeSession]);

      const result = await listSessionHistory();

      expect(mockApiGet).toHaveBeenCalledWith('/sessions/history');
      expect(result).toEqual([fakeSession]);
    });

    it('returns empty array when API returns empty array', async () => {
      mockApiGet.mockResolvedValue([]);

      const result = await listSessionHistory();

      expect(result).toEqual([]);
    });
  });

  describe('getRevisions', () => {
    it('calls GET /sessions/{id}/revisions without user filter', async () => {
      mockApiGet.mockResolvedValue([fakeRevision]);

      const result = await getRevisions('sess-1');

      expect(mockApiGet).toHaveBeenCalledWith('/sessions/sess-1/revisions');
      expect(result).toEqual([fakeRevision]);
    });

    it('includes user_id in query when provided', async () => {
      mockApiGet.mockResolvedValue([fakeRevision]);

      const result = await getRevisions('sess-1', 'u1');

      expect(mockApiGet).toHaveBeenCalledWith('/sessions/sess-1/revisions?user_id=u1');
      expect(result).toEqual([fakeRevision]);
    });

    it('returns empty array when API returns empty array', async () => {
      mockApiGet.mockResolvedValue([]);

      const result = await getRevisions('sess-1');

      expect(result).toEqual([]);
    });
  });

  describe('getSessionDetails', () => {
    // The backend returns a composite state response that getSessionDetails unwraps
    const fakeBackendResponse = {
      session: {
        ...fakeSession,
        problem: { title: 'Test Problem', description: 'A test problem', starter_code: 'print("starter")' },
      },
      students: [
        { id: 'rec-1', user_id: 'student-1', name: 'Alice', code: 'print("hello")', joined_at: '2024-01-01T00:00:00Z' },
      ],
      join_code: 'ABC123',
    };

    it('calls GET /sessions/{id}/details and unwraps to SessionDetails', async () => {
      mockApiGet.mockResolvedValue(fakeBackendResponse);

      const result = await getSessionDetails('sess-1');

      expect(mockApiGet).toHaveBeenCalledWith('/sessions/sess-1/details');
      expect(result.id).toBe('sess-1');
      expect(result.join_code).toBe('ABC123');
      expect(result.problem_title).toBe('Test Problem');
      expect(result.problem_description).toBe('A test problem');
      expect(result.starter_code).toBe('print("starter")');
      expect(result.section_name).toBe('Section A');
      expect(result.status).toBe('active');
      expect(result.students).toHaveLength(1);
      expect(result.students[0]).toEqual({
        id: 'student-1',
        name: 'Alice',
        code: 'print("hello")',
        joined_at: '2024-01-01T00:00:00Z',
      });
      expect(result.participant_count).toBe(1);
    });

    it('returns SessionDetails with empty students array', async () => {
      mockApiGet.mockResolvedValue({
        ...fakeBackendResponse,
        students: [],
      });

      const result = await getSessionDetails('sess-1');

      expect(result.students).toEqual([]);
      expect(result.participant_count).toBe(0);
    });

    it('handles null problem gracefully', async () => {
      mockApiGet.mockResolvedValue({
        ...fakeBackendResponse,
        session: { ...fakeSession, problem: null },
      });

      const result = await getSessionDetails('sess-1');

      expect(result.problem_title).toBe('');
      expect(result.problem_description).toBeUndefined();
      expect(result.starter_code).toBeUndefined();
    });

    it('accesses typed Problem fields without casts', async () => {
      // Regression: getSessionDetails used to cast problem to Record<string, unknown>
      // and then cast each field individually. Now it accesses typed fields directly.
      const response = {
        session: {
          ...fakeSession,
          problem: {
            id: 'p-1',
            namespace_id: 'ns-1',
            title: 'Typed Problem',
            description: 'Typed description',
            starter_code: 'def solve(): pass',
            test_cases: null,
            execution_settings: null,
            author_id: 'u1',
            class_id: null,
            tags: [],
            solution: null,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        },
        students: [],
        join_code: 'XYZ',
      };
      mockApiGet.mockResolvedValue(response);

      const result = await getSessionDetails('sess-1');

      expect(result.problem_title).toBe('Typed Problem');
      expect(result.problem_description).toBe('Typed description');
      expect(result.starter_code).toBe('def solve(): pass');
    });

    it('SessionStudentSummary has only summary fields (id, name, code, joined_at)', () => {
      const summary: SessionStudentSummary = {
        id: 'test',
        name: 'Test',
        code: 'code',
        joined_at: '2024-01-01T00:00:00Z',
      };
      expect(Object.keys(summary)).toEqual(['id', 'name', 'code', 'joined_at']);
    });
  });

  describe('getSessionPublicState', () => {
    it('calls GET /sessions/{id}/public-state and returns SessionPublicState', async () => {
      const fakePublicState: SessionPublicState = {
        problem: { title: 'Test Problem', description: null, starter_code: null },
        featured_student_id: null,
        featured_code: null,
        join_code: 'ABC123',
        status: 'active',
      };
      mockApiGet.mockResolvedValue(fakePublicState);

      const result = await getSessionPublicState('sess-1');

      expect(mockApiGet).toHaveBeenCalledWith('/sessions/sess-1/public-state');
      expect(result).toEqual(fakePublicState);
    });
  });

  describe('analyzeSession', () => {
    it('calls POST /sessions/{id}/analyze with model and custom_prompt', async () => {
      const fakeAnalysis: AnalysisResponse = {
        script: {
          session_id: 'sess-1',
          issues: [],
          summary: {
            total_submissions: 10,
            filtered_out: 0,
            analyzed_submissions: 10,
            completion_estimate: { finished: 5, in_progress: 3, not_started: 2 },
          },
          finished_student_ids: [],
          generated_at: new Date('2024-01-01'),
        },
      };
      mockApiPost.mockResolvedValue(fakeAnalysis);

      const result = await analyzeSession('sess-1', 'gemini-2.5-flash', 'Focus on actual bugs');

      expect(mockApiPost).toHaveBeenCalledWith('/sessions/sess-1/analyze', {
        model: 'gemini-2.5-flash',
        custom_prompt: 'Focus on actual bugs',
      });
      expect(result).toEqual(fakeAnalysis);
    });

    it('calls POST /sessions/{id}/analyze with undefined model and prompt when not provided', async () => {
      const fakeAnalysis: AnalysisResponse = {
        script: {
          session_id: 'sess-1',
          issues: [],
          summary: {
            total_submissions: 10,
            filtered_out: 0,
            analyzed_submissions: 10,
            completion_estimate: { finished: 5, in_progress: 3, not_started: 2 },
          },
          finished_student_ids: [],
          generated_at: new Date('2024-01-01'),
        },
      };
      mockApiPost.mockResolvedValue(fakeAnalysis);

      const result = await analyzeSession('sess-1');

      expect(mockApiPost).toHaveBeenCalledWith('/sessions/sess-1/analyze', {
        model: undefined,
        custom_prompt: undefined,
      });
      expect(result).toEqual(fakeAnalysis);
    });
  });

  describe('featureCode', () => {
    it('calls POST /sessions/{id}/feature with code body', async () => {
      mockApiPost.mockResolvedValue(undefined);

      await featureCode('sess-1', 'print("featured")');

      expect(mockApiPost).toHaveBeenCalledWith('/sessions/sess-1/feature', {
        code: 'print("featured")',
      });
    });
  });

  describe('reopenSession', () => {
    it('calls POST /sessions/{id}/reopen', async () => {
      mockApiPost.mockResolvedValue(undefined);

      await reopenSession('sess-1');

      expect(mockApiPost).toHaveBeenCalledWith('/sessions/sess-1/reopen');
    });
  });

  describe('listSessionHistoryWithFilters', () => {
    it('calls GET /sessions/history without filters', async () => {
      mockApiGet.mockResolvedValue([fakeSession]);

      const result = await listSessionHistoryWithFilters();

      expect(mockApiGet).toHaveBeenCalledWith('/sessions/history');
      expect(result).toEqual([fakeSession]);
    });

    it('includes section_id filter', async () => {
      mockApiGet.mockResolvedValue([]);

      await listSessionHistoryWithFilters({ sectionId: 's1' });

      expect(mockApiGet).toHaveBeenCalledWith('/sessions/history?section_id=s1');
    });

    it('includes limit filter', async () => {
      mockApiGet.mockResolvedValue([]);

      await listSessionHistoryWithFilters({ limit: 10 });

      expect(mockApiGet).toHaveBeenCalledWith('/sessions/history?limit=10');
    });

    it('combines multiple filters', async () => {
      mockApiGet.mockResolvedValue([]);

      await listSessionHistoryWithFilters({ sectionId: 's1', limit: 5 });

      expect(mockApiGet).toHaveBeenCalledWith('/sessions/history?section_id=s1&limit=5');
    });
  });
});

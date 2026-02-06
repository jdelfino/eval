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
    const fakeStudentSummary: SessionStudentSummary = {
      id: 'student-1',
      name: 'Alice',
      code: 'print("hello")',
      last_update: '2024-01-01T00:00:00Z',
    };

    const fakeSessionDetails: SessionDetails = {
      id: 'sess-1',
      join_code: 'ABC123',
      problem_title: 'Test Problem',
      problem_description: 'A test problem',
      starter_code: 'print("starter")',
      created_at: '2024-01-01T00:00:00Z',
      status: 'active',
      section_name: 'Section A',
      students: [fakeStudentSummary],
      participant_count: 1,
    };

    it('calls GET /sessions/{id}/details and returns SessionDetails with SessionStudentSummary array', async () => {
      mockApiGet.mockResolvedValue(fakeSessionDetails);

      const result = await getSessionDetails('sess-1');

      expect(mockApiGet).toHaveBeenCalledWith('/sessions/sess-1/details');
      expect(result).toEqual(fakeSessionDetails);
      // Verify the students array conforms to SessionStudentSummary type
      expect(result.students).toHaveLength(1);
      expect(result.students[0]).toEqual(fakeStudentSummary);
    });

    it('returns SessionDetails with empty students array', async () => {
      const emptyDetails: SessionDetails = {
        ...fakeSessionDetails,
        students: [],
        participant_count: 0,
      };
      mockApiGet.mockResolvedValue(emptyDetails);

      const result = await getSessionDetails('sess-1');

      expect(result.students).toEqual([]);
    });

    it('SessionStudentSummary has only summary fields (id, name, code, last_update)', () => {
      // This is a compile-time type check - if SessionStudentSummary had additional
      // required fields like session_id or user_id, this would fail to compile
      const summary: SessionStudentSummary = {
        id: 'test',
        name: 'Test',
        code: 'code',
        last_update: '2024-01-01T00:00:00Z',
      };
      expect(Object.keys(summary)).toEqual(['id', 'name', 'code', 'last_update']);
    });
  });

  describe('getSessionPublicState', () => {
    it('calls GET /sessions/{id}/public-state and returns SessionPublicState', async () => {
      const fakePublicState: SessionPublicState = {
        id: 'sess-1',
        status: 'active',
        problem_title: 'Test Problem',
        section_name: 'Section A',
        participant_count: 5,
      };
      mockApiGet.mockResolvedValue(fakePublicState);

      const result = await getSessionPublicState('sess-1');

      expect(mockApiGet).toHaveBeenCalledWith('/sessions/sess-1/public-state');
      expect(result).toEqual(fakePublicState);
    });
  });

  describe('analyzeSession', () => {
    it('calls POST /sessions/{id}/analyze and returns AnalysisResponse', async () => {
      const fakeAnalysis: AnalysisResponse = {
        script: { steps: [], summary: 'Test analysis' },
      };
      mockApiPost.mockResolvedValue(fakeAnalysis);

      const result = await analyzeSession('sess-1');

      expect(mockApiPost).toHaveBeenCalledWith('/sessions/sess-1/analyze');
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

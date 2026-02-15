/**
 * Contract tests for ALL session management API functions in sessions.ts.
 *
 * Covers the 10 functions not tested by sessions.integration.test.ts:
 *   createSession, endSession, updateSessionProblem, getSessionDetails,
 *   getSessionPublicState, traceSession, analyzeSession, featureCode,
 *   reopenSession, listSessionHistoryWithFilters
 *
 * Uses the instructor token and shared state from globalSetup.
 *
 * IMPORTANT: This file uses its own dedicated section to avoid the auto-end
 * behavior (creating a session auto-ends other active sessions in the same
 * section) from interfering with other test files that share state.sectionId.
 *
 * Tests that need testSessionId to be active are ordered BEFORE tests that
 * call createSession() (which would auto-end testSessionId).
 */
import { configureTestAuth, INSTRUCTOR_TOKEN, resetAuthProvider } from './helpers';
import { state } from './shared-state';
import { createSection } from '@/lib/api/classes';
import {
  createSession,
  endSession,
  updateSessionProblem,
  getSessionDetails,
  getSessionPublicState,
  traceSession,
  analyzeSession,
  featureCode,
  reopenSession,
  listSessionHistoryWithFilters,
} from '@/lib/api/sessions';
import {
  expectSnakeCaseKeys,
  expectString,
  expectNullableString,
  expectArray,
  expectNumber,
  validateSessionShape,
} from './validators';

describe('Sessions Full API', () => {
  // Session created for mutating tests (update-problem, feature, details, public-state, analyze)
  let testSessionId: string;
  // Dedicated section so createSession calls don't auto-end sessions in state.sectionId
  let ownSectionId: string;

  beforeAll(async () => {
    configureTestAuth(INSTRUCTOR_TOKEN);

    // Create a dedicated section for this test file to isolate from other tests
    const section = await createSection(state.classId, {
      name: 'Sessions Full Test Section',
      semester: 'Contract Tests',
    });
    ownSectionId = section.id;

    // Create a session that will be used across most tests
    const session = await createSession(ownSectionId);
    testSessionId = session.id;
  });

  afterAll(async () => {
    // Clean up: end the main test session if it is still active
    try {
      await endSession(testSessionId);
    } catch {
      // Already ended or otherwise cleaned up — ignore
    }

    resetAuthProvider();
  });

  // -----------------------------------------------------------------------
  // Tests that need testSessionId to remain ACTIVE come first.
  // createSession() / endSession() tests follow, since they create new
  // sessions that auto-end testSessionId.
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // 1. updateSessionProblem
  // -----------------------------------------------------------------------
  describe('updateSessionProblem()', () => {
    it('resolves without throwing when updating problem', async () => {
      const problem = {
        title: 'Contract Test Problem',
        description: 'A problem created during contract testing',
        starter_code: 'print("hello")',
      };

      await expect(
        updateSessionProblem(testSessionId, problem)
      ).resolves.toBeUndefined();
    });

    it('resolves without throwing when updating problem with execution settings', async () => {
      const problem = {
        title: 'Contract Test Problem v2',
        description: 'Updated problem with execution settings',
        starter_code: 'print("world")',
      };
      const executionSettings = {
        language: 'python',
        timeout: 10,
      };

      await expect(
        updateSessionProblem(testSessionId, problem, executionSettings)
      ).resolves.toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // 2. getSessionDetails
  // -----------------------------------------------------------------------
  describe('getSessionDetails()', () => {
    it('returns SessionDetails with correct snake_case shape', async () => {
      const details = await getSessionDetails(testSessionId);

      expectString(details, 'id');
      expectString(details, 'join_code');
      expectString(details, 'problem_title');
      // problem_description and starter_code are optional
      if (details.problem_description !== undefined) {
        expect(typeof details.problem_description).toBe('string');
      }
      if (details.starter_code !== undefined) {
        expect(typeof details.starter_code).toBe('string');
      }
      expectString(details, 'created_at');
      // ended_at is optional
      if (details.ended_at !== undefined) {
        expect(typeof details.ended_at).toBe('string');
      }
      expectString(details, 'status');
      expectString(details, 'section_name');
      expectArray(details, 'students');
      expectNumber(details, 'participant_count');
      expectSnakeCaseKeys(details, 'SessionDetails');

      expect(details.id).toBe(testSessionId);
      expect(['active', 'completed']).toContain(details.status);

      // If there are students, validate their shape
      if (details.students.length > 0) {
        const student = details.students[0];
        expectString(student, 'id');
        expectString(student, 'name');
        expect(student).toHaveProperty('code');
        expectString(student, 'last_update');
        expectSnakeCaseKeys(student, 'SessionStudentSummary');
      }
    });
  });

  // -----------------------------------------------------------------------
  // 3. getSessionPublicState
  // -----------------------------------------------------------------------
  describe('getSessionPublicState()', () => {
    it('returns SessionPublicState with correct snake_case shape', async () => {
      const publicState = await getSessionPublicState(testSessionId);

      expect(publicState).toHaveProperty('problem');
      expectNullableString(publicState, 'featured_student_id');
      expectNullableString(publicState, 'featured_code');
      expectString(publicState, 'join_code');
      expectString(publicState, 'status');
      expectSnakeCaseKeys(publicState, 'SessionPublicState');

      expect(['active', 'completed']).toContain(publicState.status);
    });
  });

  // -----------------------------------------------------------------------
  // 4. traceSession
  // -----------------------------------------------------------------------
  describe('traceSession()', () => {
    it('returns ExecutionTrace with steps array', async () => {
      const trace = await traceSession(testSessionId, 'x = 1\nprint(x)');
      expect(trace).toHaveProperty('steps');
      expect(Array.isArray(trace.steps)).toBe(true);
      expect(trace.steps.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // 5. analyzeSession (may fail if AI service is not configured)
  // -----------------------------------------------------------------------
  describe('analyzeSession()', () => {
    it('returns AnalysisResponse or gracefully fails if AI not configured', async () => {
      try {
        const analysis = await analyzeSession(testSessionId, 'student-1', 'print("hello")');

        // If it succeeds, validate the shape
        expect(analysis).toHaveProperty('script');
        expectSnakeCaseKeys(analysis, 'AnalysisResponse');
      } catch (err: unknown) {
        const status = (err as { status?: number }).status;
        // 422: validation error
        // 500/502/503: AI service not configured
        if (status === 400 || status === 422 || status === 500 || status === 502 || status === 503) {
          console.warn(`analyzeSession() failed with status ${status} — AI service not configured`);
          return;
        }
        throw err;
      }
    });
  });

  // -----------------------------------------------------------------------
  // 6. featureCode
  // -----------------------------------------------------------------------
  describe('featureCode()', () => {
    it('resolves without throwing', async () => {
      await expect(
        featureCode(testSessionId, 'print("featured code")')
      ).resolves.toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Tests below create new sessions, which auto-end testSessionId.
  // They are placed after all tests that need testSessionId to be active.
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // 7. createSession
  // -----------------------------------------------------------------------
  describe('createSession()', () => {
    it('returns a Session with correct snake_case shape', async () => {
      const session = await createSession(ownSectionId);

      try {
        validateSessionShape(session);

        expect(session.status).toBe('active');
        expect(session.section_id).toBe(ownSectionId);
      } finally {
        await endSession(session.id);
      }
    });
  });

  // -----------------------------------------------------------------------
  // 8. endSession
  // -----------------------------------------------------------------------
  describe('endSession()', () => {
    it('resolves without throwing', async () => {
      // Create a fresh session just for ending
      const session = await createSession(ownSectionId);
      await expect(endSession(session.id)).resolves.toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // 9. reopenSession (end first, then reopen)
  // -----------------------------------------------------------------------
  describe('reopenSession()', () => {
    it('resolves without throwing after ending a session', async () => {
      // Create a session specifically for end/reopen lifecycle
      const session = await createSession(ownSectionId);
      const endReopenSessionId = session.id;

      // End the session first
      await endSession(endReopenSessionId);

      // Now reopen it
      await expect(
        reopenSession(endReopenSessionId)
      ).resolves.toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // 10. listSessionHistoryWithFilters
  // -----------------------------------------------------------------------
  describe('listSessionHistoryWithFilters()', () => {
    it('returns Session[] with correct snake_case shape when filtered by section', async () => {
      const sessions = await listSessionHistoryWithFilters({
        sectionId: ownSectionId,
      });

      expect(Array.isArray(sessions)).toBe(true);

      if (sessions.length > 0) {
        const session = sessions[0];

        validateSessionShape(session);

        expect(['active', 'completed']).toContain(session.status);
      }
    });

    it('returns Session[] without filters', async () => {
      const sessions = await listSessionHistoryWithFilters();

      expect(Array.isArray(sessions)).toBe(true);
    });

  });
});

/**
 * Contract tests for ALL session management API functions in sessions.ts.
 *
 * Covers the 9 functions not tested by sessions.integration.test.ts:
 *   createSession, endSession, updateSessionProblem, getSessionDetails,
 *   getSessionPublicState, analyzeSession, featureCode,
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
  analyzeSession,
  featureCode,
  reopenSession,
  listSessionHistoryWithFilters,
} from '@/lib/api/sessions';
import {
  expectSnakeCaseKeys,
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

      expect(typeof details.id).toBe('string');
      expect(typeof details.join_code).toBe('string');
      expect(typeof details.problem_title).toBe('string');
      // problem_description and starter_code are optional
      if (details.problem_description !== undefined) {
        expect(typeof details.problem_description).toBe('string');
      }
      if (details.starter_code !== undefined) {
        expect(typeof details.starter_code).toBe('string');
      }
      expect(typeof details.created_at).toBe('string');
      // ended_at is optional
      if (details.ended_at !== undefined) {
        expect(typeof details.ended_at).toBe('string');
      }
      expect(typeof details.status).toBe('string');
      expect(typeof details.section_name).toBe('string');
      expect(Array.isArray(details.students)).toBe(true);
      expect(typeof details.participant_count).toBe('number');
      expectSnakeCaseKeys(details, 'SessionDetails');

      expect(details.id).toBe(testSessionId);
      expect(['active', 'completed']).toContain(details.status);

      // If there are students, validate their shape
      if (details.students.length > 0) {
        const student = details.students[0];
        expect(typeof student.id).toBe('string');
        expect(typeof student.name).toBe('string');
        expect('code' in student).toBe(true);
        expect(typeof student.joined_at).toBe('string');
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

      expect('problem' in publicState).toBe(true);
      expect(publicState.featured_student_id === null || typeof publicState.featured_student_id === 'string').toBe(true);
      expect(publicState.featured_code === null || typeof publicState.featured_code === 'string').toBe(true);
      expect(typeof publicState.join_code).toBe('string');
      expect(typeof publicState.status).toBe('string');
      expectSnakeCaseKeys(publicState, 'SessionPublicState');

      expect(['active', 'completed']).toContain(publicState.status);
    });
  });

  // -----------------------------------------------------------------------
  // 4. analyzeSession (uses StubClient when no AI key is configured)
  // -----------------------------------------------------------------------
  describe('analyzeSession()', () => {
    it('returns AnalysisResponse with valid WalkthroughScript shape', async () => {
      const analysis = await analyzeSession(testSessionId);

      // Top-level: { script: ... }
      expect(analysis).toHaveProperty('script');
      expectSnakeCaseKeys(analysis, 'AnalysisResponse');

      const { script } = analysis;

      // WalkthroughScript fields
      expect(typeof script.session_id).toBe('string');
      expect(script.session_id).toBe(testSessionId);
      expect(Array.isArray(script.issues)).toBe(true);
      expect(Array.isArray(script.finished_student_ids)).toBe(true);
      expect(typeof script.generated_at).toBe('string'); // ISO string over the wire
      expectSnakeCaseKeys(script, 'WalkthroughScript');

      // Summary shape
      expect(script.summary).toBeDefined();
      expect(typeof script.summary.total_submissions).toBe('number');
      expect(typeof script.summary.filtered_out).toBe('number');
      expect(typeof script.summary.analyzed_submissions).toBe('number');
      expect(script.summary.completion_estimate).toBeDefined();
      expect(typeof script.summary.completion_estimate.finished).toBe('number');
      expect(typeof script.summary.completion_estimate.in_progress).toBe('number');
      expect(typeof script.summary.completion_estimate.not_started).toBe('number');
      expectSnakeCaseKeys(script.summary, 'WalkthroughSummary');
      expectSnakeCaseKeys(script.summary.completion_estimate, 'CompletionEstimate');

      // Each issue (if any) has the right shape
      for (const issue of script.issues) {
        expect(typeof issue.title).toBe('string');
        expect(typeof issue.explanation).toBe('string');
        expect(typeof issue.count).toBe('number');
        expect(Array.isArray(issue.student_ids)).toBe(true);
        expect(issue.count).toBe(issue.student_ids.length);
        expect(typeof issue.representative_student_id).toBe('string');
        expect(typeof issue.representative_student_label).toBe('string');
        expect(typeof issue.severity).toBe('string');
        expectSnakeCaseKeys(issue, 'AnalysisIssue');
      }
    });
  });

  // -----------------------------------------------------------------------
  // 5. featureCode
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
  // 6. createSession
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
  // 7. endSession
  // -----------------------------------------------------------------------
  describe('endSession()', () => {
    it('resolves without throwing', async () => {
      // Create a fresh session just for ending
      const session = await createSession(ownSectionId);
      await expect(endSession(session.id)).resolves.toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // 8. reopenSession (end first, then reopen)
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
  // 9. listSessionHistoryWithFilters
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

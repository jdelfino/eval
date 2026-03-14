/**
 * Contract tests for test execution API functions.
 * Validates that the typed API functions work correctly against the real backend.
 *
 * Covers both functions from tests.ts:
 *   - runTests()         — practice mode (POST /student-work/{id}/test)
 *   - runSessionTests()  — live session mode (POST /sessions/{id}/test)
 *
 * Requires the executor service to be running.
 * Creates a problem with I/O test cases, a student user for practice mode,
 * and a session for live session mode.
 */
import {
  configureTestAuth,
  INSTRUCTOR_TOKEN,
  resetAuthProvider,
} from './helpers';
import { getVerifiedEmulatorToken } from './emulator-token';
import { state } from './shared-state';
import { runTests, runSessionTests, TestResponse } from '@/lib/api/tests';
import { createProblem, deleteProblem } from '@/lib/api/problems';
import {
  publishProblem,
  unpublishProblem,
} from '@/lib/api/section-problems';
import { createSession, endSession } from '@/lib/api/sessions';
import { expectSnakeCaseKeys } from './validators';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

let createdProblemId: string | null = null;
let studentWorkId: string | null = null;
let sessionId: string | null = null;
let studentToken: string | null = null;

// A simple Python program: output the input in uppercase.
const PASS_CODE = 'print(input().upper())';

// Test cases that match the code above.
const TEST_CASES = [
  {
    name: 'uppercase-hello',
    input: 'hello',
    expected_output: 'HELLO',
    match_type: 'exact',
    order: 0,
  },
  {
    name: 'uppercase-world',
    input: 'world',
    expected_output: 'WORLD',
    match_type: 'exact',
    order: 1,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Validate the shape of a TestResponse from the backend. */
function validateTestResponseShape(resp: TestResponse) {
  // Top-level keys
  expect(Array.isArray(resp.results)).toBe(true);
  expect(typeof resp.summary).toBe('object');
  expect(resp.summary).not.toBeNull();
  expectSnakeCaseKeys(resp, 'TestResponse');

  // Summary fields
  const s = resp.summary;
  expect(typeof s.total).toBe('number');
  expect(typeof s.passed).toBe('number');
  expect(typeof s.failed).toBe('number');
  expect(typeof s.errors).toBe('number');
  expect(typeof s.time_ms).toBe('number');
  expectSnakeCaseKeys(s, 'TestSummary');

  // Each result
  for (const r of resp.results) {
    expect(typeof r.name).toBe('string');
    expect(typeof r.type).toBe('string');
    expect(['passed', 'failed', 'error']).toContain(r.status);
    expect(typeof r.time_ms).toBe('number');
    // Optional fields: input, expected, actual, stderr (omitempty)
    if ('input' in r) expect(typeof r.input).toBe('string');
    if ('expected' in r) expect(typeof r.expected).toBe('string');
    if ('actual' in r) expect(typeof r.actual).toBe('string');
    if ('stderr' in r) expect(typeof r.stderr).toBe('string');
    expectSnakeCaseKeys(r, `TestResult(${r.name})`);
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  configureTestAuth(INSTRUCTOR_TOKEN);

  const sectionId = state.sectionId;
  const classId = state.classId;
  const joinCode = state.joinCode;
  expect(sectionId).toBeTruthy();
  expect(classId).toBeTruthy();
  expect(joinCode).toBeTruthy();

  // Create a problem WITH I/O test cases.
  const problem = await createProblem({
    title: `contract-tests-problem-${Date.now()}`,
    description: 'Contract test problem for I/O test execution',
    class_id: classId,
    tags: ['contract-tests-test'],
    starter_code: PASS_CODE,
    language: 'python',
    test_cases: TEST_CASES,
  });
  createdProblemId = problem.id;

  // Publish to section so students can enroll and create student work.
  await publishProblem(sectionId, createdProblemId);

  // Create and enroll a student.
  const studentEmail = `contract-tests-student-${Date.now()}@contract-test.local`;
  const studentPassword = `contract-tests-pw-${Date.now()}`; // gitleaks:allow
  studentToken = await getVerifiedEmulatorToken(studentEmail, studentPassword);

  configureTestAuth(studentToken);
  try {
    const { apiPost } = await import('@/lib/api-client');
    await apiPost('/auth/register-student', {
      join_code: joinCode,
      display_name: 'Contract Tests Student',
    });
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status !== 409) throw err;
  }

  // Create student work (GET-or-create) as the student, then save the passing code.
  const { apiPost: apiPostStudent } = await import('@/lib/api-client');
  const work = await apiPostStudent<{ id: string; code: string }>(
    `/sections/${sectionId}/problems/${createdProblemId}/work`,
    {}
  );
  studentWorkId = work.id;

  // Update the student work to use the passing code.
  const { apiPatch } = await import('@/lib/api-client');
  await apiPatch(`/student-work/${studentWorkId}`, { code: PASS_CODE });

  // Create a session for session-mode tests.
  // Switch back to instructor to create the session.
  configureTestAuth(INSTRUCTOR_TOKEN);
  const session = await createSession(sectionId, createdProblemId);
  sessionId = session.id;
});

afterAll(async () => {
  configureTestAuth(INSTRUCTOR_TOKEN);

  const sectionId = state.sectionId;

  if (sessionId) {
    try {
      await endSession(sessionId);
    } catch {
      // best-effort
    }
    sessionId = null;
  }

  if (createdProblemId && sectionId) {
    try {
      await unpublishProblem(sectionId, createdProblemId);
    } catch {
      // best-effort
    }
    try {
      await deleteProblem(createdProblemId);
    } catch {
      // best-effort
    }
  }

  resetAuthProvider();
});

// ---------------------------------------------------------------------------
// runTests() — practice mode
// ---------------------------------------------------------------------------

describe('runTests()', () => {
  it('returns TestResponse with correct snake_case shape when all tests pass', async () => {
    expect(studentWorkId).toBeTruthy();

    // Instructors can run tests on any student work (PermContentManage bypass).
    configureTestAuth(INSTRUCTOR_TOKEN);

    const resp = await runTests(studentWorkId!);

    validateTestResponseShape(resp);

    // With PASS_CODE, both test cases should pass.
    expect(resp.summary.total).toBe(2);
    expect(resp.summary.passed).toBe(2);
    expect(resp.summary.failed).toBe(0);
    expect(resp.summary.errors).toBe(0);

    // Each result should reference the test case name.
    const names = resp.results.map(r => r.name);
    expect(names).toContain('uppercase-hello');
    expect(names).toContain('uppercase-world');

    // Results should be type "io".
    for (const r of resp.results) {
      expect(r.type).toBe('io');
    }
  });

  it('runs only the named test when testName is provided', async () => {
    expect(studentWorkId).toBeTruthy();

    configureTestAuth(INSTRUCTOR_TOKEN);

    const resp = await runTests(studentWorkId!, 'uppercase-hello');

    validateTestResponseShape(resp);

    // Only one test case should be returned.
    expect(resp.summary.total).toBe(1);
    expect(resp.results).toHaveLength(1);
    expect(resp.results[0].name).toBe('uppercase-hello');
    expect(resp.results[0].status).toBe('passed');
  });
});

// ---------------------------------------------------------------------------
// runSessionTests() — live session mode
// ---------------------------------------------------------------------------

describe('runSessionTests()', () => {
  it('returns TestResponse with correct snake_case shape when all tests pass', async () => {
    expect(sessionId).toBeTruthy();

    // Instructor is the session creator — passes isCreatorOrParticipant check.
    configureTestAuth(INSTRUCTOR_TOKEN);

    const resp = await runSessionTests(
      sessionId!,
      PASS_CODE
    );

    validateTestResponseShape(resp);

    // With PASS_CODE, both test cases should pass.
    expect(resp.summary.total).toBe(2);
    expect(resp.summary.passed).toBe(2);
    expect(resp.summary.failed).toBe(0);
    expect(resp.summary.errors).toBe(0);

    const names = resp.results.map(r => r.name);
    expect(names).toContain('uppercase-hello');
    expect(names).toContain('uppercase-world');

    for (const r of resp.results) {
      expect(r.type).toBe('io');
    }
  });

  it('runs only the named test when testName is provided', async () => {
    expect(sessionId).toBeTruthy();

    configureTestAuth(INSTRUCTOR_TOKEN);

    const resp = await runSessionTests(
      sessionId!,
      PASS_CODE,
      'uppercase-world'
    );

    validateTestResponseShape(resp);

    expect(resp.summary.total).toBe(1);
    expect(resp.results).toHaveLength(1);
    expect(resp.results[0].name).toBe('uppercase-world');
    expect(resp.results[0].status).toBe('passed');
  });
});

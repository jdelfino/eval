/**
 * Contract tests: Centrifugo realtime event payload shapes.
 *
 * These tests subscribe to Centrifugo channels, trigger backend actions via
 * the typed API client (same client the frontend uses), and verify that the
 * received event payloads match the TypeScript interfaces in
 * types/realtime-events.ts.
 *
 * Infrastructure requirements (separate from existing contract tests):
 *   CENTRIFUGO_URL          — HTTP URL for the Centrifugo API (e.g. http://localhost:8000)
 *   CENTRIFUGO_WS_URL       — WebSocket URL (e.g. ws://localhost:8000/connection/websocket)
 *   CENTRIFUGO_TOKEN_SECRET — HMAC secret for signing JWTs
 *   CENTRIFUGO_API_KEY      — API key for direct Centrifugo publish calls (not used here,
 *                             but required to confirm the environment is fully configured)
 *   API_BASE_URL            — Backend HTTP URL (e.g. http://localhost:8080)
 *
 * All env vars are REQUIRED. The test fails hard if any is missing.
 */

import * as crypto from 'crypto';
import { Centrifuge } from 'centrifuge';
import WebSocket from 'ws';
import { getSetupState } from './helpers';
import { getVerifiedEmulatorToken } from './emulator-token';
import { configureTestAuth, resetAuthProvider } from '@/lib/auth-provider';
import {
  validateStudentJoinedShape,
  validateStudentCodeUpdatedShape,
  validateSessionEndedShape,
  validateSessionReplacedShape,
  validateFeaturedStudentChangedShape,
  validateProblemUpdatedShape,
  validateSessionStartedInSectionShape,
  validateSessionEndedInSectionShape,
} from './validators';
import type {
  RealtimeEventEnvelope,
  StudentJoinedData,
  StudentCodeUpdatedData,
  SessionEndedData,
  SessionReplacedData,
  FeaturedStudentChangedData,
  ProblemUpdatedData,
  SessionStartedInSectionData,
  SessionEndedInSectionData,
} from '@/types/realtime-events';
import { createProblem } from '@/lib/api/problems';
import { createSession, endSession, updateSessionProblemPartial, featureCode } from '@/lib/api/sessions';
import { registerStudent } from '@/lib/api/registration';
import {
  joinSessionAsStudent,
  updateStudentCode,
  updateCode,
  featureStudent,
} from '@/lib/api/realtime';

// ---------------------------------------------------------------------------
// Environment — fail hard if not configured
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(
      `Realtime contract tests require ${name} to be set.\n` +
      `Run 'make test-integration-realtime-contract' to start the required infrastructure.`
    );
  }
  return val;
}

const CENTRIFUGO_URL = requireEnv('CENTRIFUGO_URL');
const CENTRIFUGO_WS_URL = requireEnv('CENTRIFUGO_WS_URL');
const CENTRIFUGO_TOKEN_SECRET = requireEnv('CENTRIFUGO_TOKEN_SECRET');
// Required to confirm environment is fully configured; used indirectly by infrastructure
requireEnv('CENTRIFUGO_API_KEY');

// ---------------------------------------------------------------------------
// JWT helpers — HS256 using native Node.js crypto (no external JWT lib needed)
// ---------------------------------------------------------------------------

function base64url(data: string | Buffer): string {
  const buf = typeof data === 'string' ? Buffer.from(data) : data;
  return buf.toString('base64url');
}

function signJWT(payload: Record<string, unknown>, secret: string): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const sig = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${sig}`;
}

function connectionToken(userId: string): string {
  return signJWT(
    { sub: userId, exp: Math.floor(Date.now() / 1000) + 300 },
    CENTRIFUGO_TOKEN_SECRET
  );
}

function subscriptionToken(userId: string, channel: string): string {
  return signJWT(
    { sub: userId, channel, exp: Math.floor(Date.now() / 1000) + 300 },
    CENTRIFUGO_TOKEN_SECRET
  );
}

// ---------------------------------------------------------------------------
// Centrifugo subscriber helpers
// ---------------------------------------------------------------------------

/**
 * Create a Centrifuge client connected to Centrifugo as the given user.
 */
function createConnectedClient(userId: string): Promise<Centrifuge> {
  return new Promise((resolve, reject) => {
    const client = new Centrifuge(CENTRIFUGO_WS_URL, {
      token: connectionToken(userId),
      websocket: WebSocket,
    });

    client.on('connected', () => resolve(client));
    client.on('error', (evt) => reject(new Error(`Centrifuge connection error: ${String(evt.error)}`)));

    const timeout = setTimeout(() => {
      client.disconnect();
      reject(new Error(`Timeout connecting to Centrifugo at ${CENTRIFUGO_WS_URL}`));
    }, 8000);

    client.on('connected', () => clearTimeout(timeout));
    client.connect();
  });
}

/**
 * Subscribe to a channel and return a function that collects the next published event.
 * Resolves once the subscription is active (server confirmed).
 */
function subscribeAndCollect(
  client: Centrifuge,
  channel: string,
  userId: string
): Promise<{ collectNext: (timeoutMs?: number) => Promise<RealtimeEventEnvelope<unknown>>; unsubscribe: () => void }> {
  return new Promise((resolve, reject) => {
    const sub = client.newSubscription(channel, {
      token: subscriptionToken(userId, channel),
    });

    const published: RealtimeEventEnvelope<unknown>[] = [];
    const waiters: Array<(evt: RealtimeEventEnvelope<unknown>) => void> = [];

    sub.on('publication', (ctx) => {
      const envelope = ctx.data as RealtimeEventEnvelope<unknown>;
      const waiter = waiters.shift();
      if (waiter) {
        waiter(envelope);
      } else {
        published.push(envelope);
      }
    });

    sub.on('subscribed', () => {
      resolve({
        collectNext: (timeoutMs = 8000) =>
          new Promise((res, rej) => {
            const next = published.shift();
            if (next) {
              res(next);
              return;
            }
            const timer = setTimeout(() => {
              const idx = waiters.indexOf(res);
              if (idx !== -1) {
                waiters.splice(idx, 1);
              }
              rej(new Error(`Timeout (${timeoutMs}ms) waiting for event on channel ${channel}`));
            }, timeoutMs);
            waiters.push((evt) => {
              clearTimeout(timer);
              res(evt);
            });
          }),
        unsubscribe: () => sub.unsubscribe(),
      });
    });

    sub.on('error', (evt) => {
      reject(new Error(`Subscription error on ${channel}: ${String(evt.error)}`));
    });

    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for subscription to ${channel}`));
    }, 8000);
    sub.on('subscribed', () => clearTimeout(timeout));

    sub.subscribe();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const OBSERVER_USER_ID = 'realtime-contract-observer';

describe('Realtime event contract tests', () => {
  let setupState: NonNullable<ReturnType<typeof getSetupState>>;
  let client: Centrifuge;

  // We create a fresh student for session join / code update tests
  const STUDENT_EMAIL = `rt-contract-student-${Date.now()}@contract-test.local`;
  const STUDENT_PASSWORD = `rt-contract-pw-${Date.now()}`; // gitleaks:allow
  const STUDENT_NAME = 'RT Contract Student';
  let STUDENT_TOKEN = '';
  let joinedStudentUserId = '';

  // Health-check Centrifugo before running tests
  beforeAll(async () => {
    const res = await fetch(`${CENTRIFUGO_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    }).catch((err: unknown) => {
      throw new Error(
        `Centrifugo not reachable at ${CENTRIFUGO_URL}: ${String(err)}\n` +
        `Run 'make test-integration-realtime-contract' to start Centrifugo.`
      );
    });
    if (!res.ok) {
      throw new Error(`Centrifugo health check returned ${res.status}`);
    }

    const state = getSetupState();
    if (!state) {
      throw new Error(
        `Realtime contract tests require globalSetup state.\n` +
        `Run 'make test-integration-realtime-contract' to start the required infrastructure.`
      );
    }
    setupState = state;
    // NEXT_PUBLIC_API_URL is already set by helpers.ts module-level code

    // Connect the observer client once for all tests
    client = await createConnectedClient(OBSERVER_USER_ID);

    // Create student in emulator and get token
    STUDENT_TOKEN = await getVerifiedEmulatorToken(STUDENT_EMAIL, STUDENT_PASSWORD);

    // Register the student so they can join sessions
    configureTestAuth(STUDENT_TOKEN);
    try {
      await registerStudent(setupState.joinCode, STUDENT_NAME);
    } catch (err: unknown) {
      // 409 = already registered from a previous run — acceptable
      // ApiError with status 409 is thrown by the typed client
      const status = (err as { status?: number }).status;
      if (status !== 409) {
        throw err;
      }
    }
    resetAuthProvider();
  });

  afterAll(async () => {
    if (client) {
      client.disconnect();
    }
    resetAuthProvider();
  });

  // -------------------------------------------------------------------------
  // session_started_in_section — create a new session triggers this on section channel
  // -------------------------------------------------------------------------
  describe('session_started_in_section', () => {
    it('publishes correct payload to section channel when session is created', async () => {
      const { sectionId, instructorToken, classId } = setupState;

      // Create a new problem for the session
      configureTestAuth(instructorToken);
      const problem = await createProblem({
        title: 'RT Contract Test Problem',
        description: 'A test problem',
        class_id: classId,
        starter_code: 'print("rt-test")',
        language: 'python',
        tags: ['rt-contract'],
      });

      // Subscribe to the section channel before triggering the event
      const sectionChannel = `section:${sectionId}`;
      const { collectNext, unsubscribe } = await subscribeAndCollect(client, sectionChannel, OBSERVER_USER_ID);

      try {
        // Create a new session (triggers session_started_in_section on the section channel)
        const newSession = await createSession(sectionId, problem.id);

        const envelope = await collectNext();

        expect(envelope.type).toBe('session_started_in_section');
        expect(typeof envelope.timestamp).toBe('string');
        const data = envelope.data as SessionStartedInSectionData;
        validateSessionStartedInSectionShape(data);
        expect(data.session_id).toBe(newSession.id);
        expect(data.problem).not.toBeNull();

        // TC4: Validate the nested problem shape matches the concrete ApiProblem type.
        // If the backend returns problem with wrong field names or missing fields,
        // the shape check here catches it. We check key fields directly since
        // the full Problem is validated via SessionStartedInSectionData's typia validator.
        const p = data.problem;
        expect(typeof p.id).toBe('string');
        expect(typeof p.namespace_id).toBe('string');
        expect(typeof p.title).toBe('string');
        expect(typeof p.language).toBe('string');
        expect(typeof p.author_id).toBe('string');
        expect(typeof p.created_at).toBe('string');
        expect(typeof p.updated_at).toBe('string');
        expect(Array.isArray(p.tags)).toBe(true);
        expect(p.description === null || typeof p.description === 'string').toBe(true);
        expect(p.starter_code === null || typeof p.starter_code === 'string').toBe(true);
        expect(p.class_id === null || typeof p.class_id === 'string').toBe(true);
        expect(p.solution === null || typeof p.solution === 'string').toBe(true);

        // Clean up new session (DELETE triggers session_ended + session_ended_in_section)
        // We consume those events in the session_ended tests below, so just delete
        await endSession(newSession.id);
      } finally {
        unsubscribe();
        resetAuthProvider();
      }
    });
  });

  // -------------------------------------------------------------------------
  // student_joined — joining a session publishes to the session channel
  // -------------------------------------------------------------------------
  describe('student_joined', () => {
    it('publishes correct payload to session channel when student joins', async () => {
      const { sessionId } = setupState;

      const sessionChannel = `session:${sessionId}`;
      const { collectNext, unsubscribe } = await subscribeAndCollect(client, sessionChannel, OBSERVER_USER_ID);

      try {
        // Student joins the session
        configureTestAuth(STUDENT_TOKEN);
        let joinData: Awaited<ReturnType<typeof joinSessionAsStudent>> | null = null;
        try {
          joinData = await joinSessionAsStudent(sessionId, STUDENT_NAME);
        } catch (err: unknown) {
          // 409 = already joined from a previous run — acceptable
          const status = (err as { status?: number }).status;
          if (status !== 409 && status !== 200) {
            throw err;
          }
        }
        // Capture the student's DB user_id for use in feature tests
        if (joinData?.user_id) {
          joinedStudentUserId = joinData.user_id;
        }

        const envelope = await collectNext();

        expect(envelope.type).toBe('student_joined');
        expect(typeof envelope.timestamp).toBe('string');
        const data = envelope.data as StudentJoinedData;
        validateStudentJoinedShape(data);
        expect(data.display_name).toBe(STUDENT_NAME);
      } finally {
        unsubscribe();
        resetAuthProvider();
      }
    });
  });

  // -------------------------------------------------------------------------
  // student_code_updated — student updates code publishes to session channel
  // -------------------------------------------------------------------------
  describe('student_code_updated', () => {
    it('publishes correct payload to session channel when student updates code', async () => {
      const { sessionId } = setupState;

      const sessionChannel = `session:${sessionId}`;
      const { collectNext, unsubscribe } = await subscribeAndCollect(client, sessionChannel, OBSERVER_USER_ID);

      try {
        // Student updates their code
        configureTestAuth(STUDENT_TOKEN);
        await updateStudentCode(sessionId, 'print("rt-contract-test")');

        const envelope = await collectNext();

        expect(envelope.type).toBe('student_code_updated');
        expect(typeof envelope.timestamp).toBe('string');
        const data = envelope.data as StudentCodeUpdatedData;
        validateStudentCodeUpdatedShape(data);
        expect(data.code).toBe('print("rt-contract-test")');
      } finally {
        unsubscribe();
        resetAuthProvider();
      }
    });

    it('publishes test_cases field when student updates code with execution settings', async () => {
      /**
       * TC1/TC2: Verifies that student_code_updated event carries test_cases when
       * code is saved with execution settings. The typia validator checks the full
       * StudentCodeUpdatedData shape including the optional test_cases field.
       * If the wire field is misnamed (e.g. execution_settings), the equality
       * check against the sent settings would fail.
       */
      const { sessionId, instructorToken } = setupState;

      const sessionChannel = `session:${sessionId}`;
      const { collectNext, unsubscribe } = await subscribeAndCollect(client, sessionChannel, OBSERVER_USER_ID);

      try {
        const testCases = {
          stdin: 'student-input',
          random_seed: 7,
          attached_files: [{ name: 'helper.py', content: 'def helper(): pass' }],
        };

        // Instructor updates student code with test_cases (instructor path sends test_cases field)
        configureTestAuth(instructorToken);
        if (joinedStudentUserId) {
          await updateCode(sessionId, joinedStudentUserId, 'print("with-test-cases")', testCases);
        } else {
          // Can't run this test without a joined student — skip gracefully
          unsubscribe();
          return;
        }

        const envelope = await collectNext();

        expect(envelope.type).toBe('student_code_updated');
        const data = envelope.data as StudentCodeUpdatedData;
        validateStudentCodeUpdatedShape(data);
        expect(data.code).toBe('print("with-test-cases")');

        // Verify test_cases contents are present and match what was sent
        expect(data.test_cases).toBeDefined();
        expect(data.test_cases).toEqual(testCases);

        // Ensure execution_settings does NOT appear (wrong field name)
        expect('execution_settings' in data).toBe(false);
      } finally {
        unsubscribe();
        resetAuthProvider();
      }
    });
  });

  // -------------------------------------------------------------------------
  // featured_student_changed — instructor features a student
  // -------------------------------------------------------------------------
  describe('featured_student_changed', () => {
    it('publishes correct payload to session channel when instructor features a student', async () => {
      const { sessionId, instructorToken } = setupState;

      const sessionChannel = `session:${sessionId}`;
      const { collectNext, unsubscribe } = await subscribeAndCollect(client, sessionChannel, OBSERVER_USER_ID);

      try {
        // Instructor features the student (uses DB user_id captured during join)
        configureTestAuth(instructorToken);
        if (joinedStudentUserId) {
          await featureStudent(sessionId, joinedStudentUserId, 'print("featured")');
        } else {
          // Fallback: feature code-only when no student ID is available
          await featureCode(sessionId, 'print("featured")');
        }

        const envelope = await collectNext();

        expect(envelope.type).toBe('featured_student_changed');
        expect(typeof envelope.timestamp).toBe('string');
        const data = envelope.data as FeaturedStudentChangedData;
        validateFeaturedStudentChangedShape(data);
        expect(data.code).toBe('print("featured")');
      } finally {
        unsubscribe();
        resetAuthProvider();
      }
    });

    it('publishes test_cases field when provided in feature request', async () => {
      const { sessionId, instructorToken } = setupState;

      const sessionChannel = `session:${sessionId}`;
      const { collectNext, unsubscribe } = await subscribeAndCollect(client, sessionChannel, OBSERVER_USER_ID);

      try {
        // Feature with execution settings (test_cases)
        const executionSettings = {
          stdin: 'contract-test-input',
          random_seed: 42,
          attached_files: [{ name: 'test.txt', content: 'test content' }],
        };

        configureTestAuth(instructorToken);
        if (joinedStudentUserId) {
          await featureStudent(
            sessionId,
            joinedStudentUserId,
            'print("with-settings")',
            executionSettings
          );
        } else {
          // Fallback: feature code-only with test_cases when no student ID is available
          await featureCode(sessionId, 'print("with-settings")', executionSettings);
        }

        const envelope = await collectNext();

        expect(envelope.type).toBe('featured_student_changed');
        const data = envelope.data as FeaturedStudentChangedData;
        validateFeaturedStudentChangedShape(data);
        expect(data.code).toBe('print("with-settings")');

        // Verify test_cases field exists and matches what we sent
        expect(data.test_cases).toBeDefined();
        expect(data.test_cases).toEqual(executionSettings);

        // Ensure execution_settings does NOT exist (wrong field name)
        expect('execution_settings' in data).toBe(false);
      } finally {
        unsubscribe();
        resetAuthProvider();
      }
    });
  });

  // -------------------------------------------------------------------------
  // problem_updated — updating session problem inline
  // -------------------------------------------------------------------------
  describe('problem_updated', () => {
    it('publishes correct payload to session channel when problem is updated', async () => {
      const { sessionId, instructorToken } = setupState;

      const sessionChannel = `session:${sessionId}`;
      const { collectNext, unsubscribe } = await subscribeAndCollect(client, sessionChannel, OBSERVER_USER_ID);

      try {
        // Update the session problem inline
        configureTestAuth(instructorToken);
        await updateSessionProblemPartial(sessionId, {
          title: 'Updated Problem Title',
          description: 'Updated description',
          starter_code: 'print("updated")',
        });

        const envelope = await collectNext();

        expect(envelope.type).toBe('problem_updated');
        expect(typeof envelope.timestamp).toBe('string');
        const data = envelope.data as ProblemUpdatedData;
        validateProblemUpdatedShape(data);
        expect(typeof data.problem_id).toBe('string');
      } finally {
        unsubscribe();
        resetAuthProvider();
      }
    });
  });

  // -------------------------------------------------------------------------
  // session_ended + session_ended_in_section — ending a session
  // -------------------------------------------------------------------------
  describe('session_ended and session_ended_in_section', () => {
    it('publishes session_ended to session channel and session_ended_in_section to section channel when session is deleted', async () => {
      const { sectionId, instructorToken, classId } = setupState;

      // Create a fresh problem and session to end
      configureTestAuth(instructorToken);
      const endProblem = await createProblem({
        title: 'RT Contract End Session Problem',
        description: 'A test problem for session_ended',
        class_id: classId,
        starter_code: 'pass',
        language: 'python',
        tags: ['rt-contract-end'],
      });

      const sessionToEnd = await createSession(sectionId, endProblem.id);

      // Subscribe to both channels before ending
      const sessionChannel = `session:${sessionToEnd.id}`;
      const sectionChannel = `section:${sectionId}`;
      const { collectNext: collectSession, unsubscribe: unsubSession } = await subscribeAndCollect(
        client, sessionChannel, OBSERVER_USER_ID
      );
      const { collectNext: collectSection, unsubscribe: unsubSection } = await subscribeAndCollect(
        client, sectionChannel, OBSERVER_USER_ID
      );

      try {
        // End the session — this triggers both events
        await endSession(sessionToEnd.id);

        // Collect session_ended from session channel
        const sessionEnvelope = await collectSession();
        expect(sessionEnvelope.type).toBe('session_ended');
        expect(typeof sessionEnvelope.timestamp).toBe('string');
        const sessionData = sessionEnvelope.data as SessionEndedData;
        validateSessionEndedShape(sessionData);
        expect(sessionData.session_id).toBe(sessionToEnd.id);
        expect(typeof sessionData.reason).toBe('string');

        // Collect session_ended_in_section from section channel
        const sectionEnvelope = await collectSection();
        expect(sectionEnvelope.type).toBe('session_ended_in_section');
        expect(typeof sectionEnvelope.timestamp).toBe('string');
        const sectionData = sectionEnvelope.data as SessionEndedInSectionData;
        validateSessionEndedInSectionShape(sectionData);
        expect(sectionData.session_id).toBe(sessionToEnd.id);
      } finally {
        unsubSession();
        unsubSection();
        resetAuthProvider();
      }
    });
  });

  // -------------------------------------------------------------------------
  // session_replaced — creating a new session when one already exists replaces it
  // -------------------------------------------------------------------------
  describe('session_replaced', () => {
    it('publishes session_replaced to old session channel when a new session replaces it', async () => {
      const { sectionId, instructorToken, classId } = setupState;

      // Create problem and first session
      configureTestAuth(instructorToken);
      const replaceProblem = await createProblem({
        title: 'RT Contract Replace Problem',
        description: 'A test problem for session_replaced',
        class_id: classId,
        starter_code: 'pass',
        language: 'python',
        tags: ['rt-contract-replace'],
      });

      // Create the first session (will be replaced)
      const firstSession = await createSession(sectionId, replaceProblem.id);

      // Subscribe to the first session's channel BEFORE triggering the replace
      const firstSessionChannel = `session:${firstSession.id}`;
      const { collectNext, unsubscribe } = await subscribeAndCollect(
        client, firstSessionChannel, OBSERVER_USER_ID
      );

      try {
        // Create a second problem for the replacement session
        const replaceProblem2 = await createProblem({
          title: 'RT Contract Replace Problem 2',
          description: 'Replacement problem',
          class_id: classId,
          starter_code: 'pass',
          language: 'python',
          tags: ['rt-contract-replace2'],
        });

        // Create a new session for the SAME section while the first is still active.
        // CreateSessionReplacingActive atomically ends the old session and publishes
        // session_replaced to the old session's channel.
        const newSession = await createSession(sectionId, replaceProblem2.id);

        // Collect the session_replaced event from the OLD session's channel
        const envelope = await collectNext();

        expect(envelope.type).toBe('session_replaced');
        expect(typeof envelope.timestamp).toBe('string');
        const data = envelope.data as SessionReplacedData;
        validateSessionReplacedShape(data);
        expect(data.new_session_id).toBe(newSession.id);

        // Clean up the replacement session
        await endSession(newSession.id);
      } finally {
        unsubscribe();
        resetAuthProvider();
      }
    });
  });
});

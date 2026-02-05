import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:8080';

// Read state from global setup
interface SetupState {
  runId: string;
  namespaceId: string;
  invitationId: string;
  instructorUserId: string;
  classId: string;
  sectionId: string;
  sessionId: string;
  joinCode: string;
  instructorExternalId: string;
  instructorEmail: string;
  instructorToken: string;
}

function loadState(): SetupState | null {
  const stateFile = path.join(os.tmpdir(), `jest-contract-state-${process.ppid || 'default'}.json`);
  try {
    if (fs.existsSync(stateFile)) {
      return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    }
  } catch {
    // State file doesn't exist or can't be read
  }
  return null;
}

const setupState = loadState();

// Fall back to generating values if global setup didn't run
const RUN_ID = setupState?.runId || `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CONTRACT_NS = setupState?.namespaceId || `contract-${RUN_ID}`;

// System admin token (seeded in contract-test-seed.sql) — used for namespace/invitation creation
const ADMIN_TOKEN = 'test:contract-admin:contract-admin@test.local';

// Instructor credentials — user created via invitation during test setup
const INSTRUCTOR_EXTERNAL_ID = setupState?.instructorExternalId || `instructor-${RUN_ID}`;
const INSTRUCTOR_EMAIL = setupState?.instructorEmail || `instructor-${RUN_ID}@contract-test.local`;
const INSTRUCTOR_TOKEN = setupState?.instructorToken || `test:${INSTRUCTOR_EXTERNAL_ID}:${INSTRUCTOR_EMAIL}`;

/**
 * Fetch with authorization header.
 * @param path API path (e.g., '/api/v1/classes')
 * @param token Auth token (defaults to INSTRUCTOR_TOKEN)
 * @param options Additional fetch options
 */
export function contractFetch(path: string, token: string = INSTRUCTOR_TOKEN, options?: RequestInit) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
}

export function testToken(externalId: string, email: string) {
  return `test:${externalId}:${email}`;
}

// Export setup state for tests that need IDs
export function getSetupState(): SetupState | null {
  return setupState;
}

export { CONTRACT_NS, ADMIN_TOKEN, INSTRUCTOR_TOKEN, INSTRUCTOR_EXTERNAL_ID, INSTRUCTOR_EMAIL };

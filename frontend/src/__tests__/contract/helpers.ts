import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { configureTestAuth, resetAuthProvider } from '@/lib/auth-provider';

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
  apiBaseUrl: string;
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

// Set NEXT_PUBLIC_API_URL for typed API functions
const API_BASE = setupState?.apiBaseUrl || process.env.API_BASE_URL || 'http://localhost:8080';
process.env.NEXT_PUBLIC_API_URL = API_BASE;

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
 * Create a test token in the format expected by the backend's test auth validator.
 * @param externalId - The user's external ID
 * @param email - The user's email
 * @returns Token string in format "test:<externalId>:<email>"
 */
export function testToken(externalId: string, email: string) {
  return `test:${externalId}:${email}`;
}

// Export setup state for tests that need IDs
export function getSetupState(): SetupState | null {
  return setupState;
}

export {
  CONTRACT_NS,
  ADMIN_TOKEN,
  INSTRUCTOR_TOKEN,
  INSTRUCTOR_EXTERNAL_ID,
  INSTRUCTOR_EMAIL,
  configureTestAuth,
  resetAuthProvider,
};

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
  problemId: string;
  sessionId: string;
  joinCode: string;
  instructorExternalId: string;
  instructorEmail: string;
  instructorToken: string;
  adminToken: string;
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
// The typed API functions expect paths like /sessions, but the backend serves at /api/v1/sessions
// So NEXT_PUBLIC_API_URL must include the /api/v1 prefix
const API_BASE = setupState?.apiBaseUrl || process.env.API_BASE_URL || 'http://localhost:8080';
process.env.NEXT_PUBLIC_API_URL = `${API_BASE}/api/v1`;

// Fall back to generating values if global setup didn't run
const RUN_ID = setupState?.runId || `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CONTRACT_NS = setupState?.namespaceId || `contract-${RUN_ID}`;

// System admin token (from global setup which bootstrapped the emulator admin)
const ADMIN_TOKEN = setupState?.adminToken || '';

// Instructor credentials — user created via invitation during test setup
const INSTRUCTOR_EXTERNAL_ID = setupState?.instructorExternalId || `instructor-${RUN_ID}`;
const INSTRUCTOR_EMAIL = setupState?.instructorEmail || `instructor-${RUN_ID}@contract-test.local`;
const INSTRUCTOR_TOKEN = setupState?.instructorToken || '';

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

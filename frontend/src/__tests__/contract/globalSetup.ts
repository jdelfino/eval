/**
 * Jest global setup for contract tests.
 * Runs once before all test files.
 * Creates namespace, instructor user, class, section, and session.
 * Uses Firebase Auth Emulator for token generation.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getVerifiedEmulatorToken, clearEmulatorUsers } from './emulator-token';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:8080';

// Generate unique run ID
const RUN_ID = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CONTRACT_NS = `contract-${RUN_ID}`;

// Admin credentials — must match BOOTSTRAP_ADMIN_EMAIL in ensure-test-api.sh
const BOOTSTRAP_ADMIN_EMAIL = 'emulator-admin@test.local';
const BOOTSTRAP_ADMIN_PASSWORD = 'emulator-admin-password-e2e'; // gitleaks:allow

const INSTRUCTOR_EXTERNAL_ID = `instructor-${RUN_ID}`;
const INSTRUCTOR_EMAIL = `instructor-${RUN_ID}@contract-test.local`;
const INSTRUCTOR_PASSWORD = `instructor-pw-${RUN_ID}`; // gitleaks:allow

async function contractFetch(path: string, token: string, options?: RequestInit) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
}

export default async () => {
  console.log(`Contract tests global setup starting (RUN_ID: ${RUN_ID})`);

  // Check if backend is reachable before proceeding
  try {
    const healthRes = await fetch(`${API_BASE}/healthz`, { signal: AbortSignal.timeout(3000) });
    if (!healthRes.ok) {
      throw new Error(`healthz returned ${healthRes.status}`);
    }
  } catch (err) {
    throw new Error(
      `Contract tests require a running backend at ${API_BASE}.\n` +
      `Run 'make test-integration-contract' to start the backend automatically,\n` +
      `or start it manually with FIREBASE_AUTH_EMULATOR_HOST set.`
    );
  }

  // Clear emulator users from previous runs to avoid email conflicts
  await clearEmulatorUsers();

  // Bootstrap admin user
  const adminToken = await getVerifiedEmulatorToken(BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD);

  // Bootstrap the system admin DB record (idempotent)
  const bootstrapRes = await contractFetch('/api/v1/auth/bootstrap', adminToken, { method: 'POST' });
  if (bootstrapRes.status !== 201 && bootstrapRes.status !== 409) {
    const body = await bootstrapRes.text();
    throw new Error(`Failed to bootstrap admin: ${bootstrapRes.status} ${body}`);
  }

  // Create namespace
  const nsRes = await contractFetch('/api/v1/namespaces', adminToken, {
    method: 'POST',
    body: JSON.stringify({
      id: CONTRACT_NS,
      display_name: 'Contract Test Namespace',
    }),
  });
  if (nsRes.status !== 201 && nsRes.status !== 500) {
    throw new Error(`Failed to create namespace: ${nsRes.status}`);
  }

  // Create instructor user in emulator
  const instructorToken = await getVerifiedEmulatorToken(INSTRUCTOR_EMAIL, INSTRUCTOR_PASSWORD);

  // Create invitation
  const invRes = await contractFetch('/api/v1/system/invitations', adminToken, {
    method: 'POST',
    body: JSON.stringify({
      email: INSTRUCTOR_EMAIL,
      target_role: 'instructor',
      namespace_id: CONTRACT_NS,
    }),
  });
  if (invRes.status !== 201) {
    throw new Error(`Failed to create invitation: ${invRes.status}`);
  }
  const inv = await invRes.json();

  // Accept invitation
  const acceptRes = await contractFetch('/api/v1/auth/accept-invite', instructorToken, {
    method: 'POST',
    body: JSON.stringify({
      token: inv.id,
      display_name: 'Contract Test Instructor',
    }),
  });
  if (acceptRes.status !== 201) {
    throw new Error(`Failed to accept invitation: ${acceptRes.status}`);
  }
  const user = await acceptRes.json();

  // Create class
  const classRes = await contractFetch('/api/v1/classes', instructorToken, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Contract Test Class',
      description: 'Created by contract tests',
    }),
  });
  if (classRes.status !== 201) {
    throw new Error(`Failed to create class: ${classRes.status}`);
  }
  const cls = await classRes.json();

  // Create section
  const sectionRes = await contractFetch(`/api/v1/classes/${cls.id}/sections`, instructorToken, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Contract Test Section',
      semester: 'Fall 2025',
    }),
  });
  if (sectionRes.status !== 201) {
    throw new Error(`Failed to create section: ${sectionRes.status}`);
  }
  const sec = await sectionRes.json();

  // Create problem (required for session join and I/O test execution).
  // Include test_cases so tests.integration.test.ts can reuse this problem
  // without creating its own (to stay within write rate limits).
  const problemRes = await contractFetch('/api/v1/problems', instructorToken, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Contract Test Problem',
      description: 'Uppercase the input',
      class_id: cls.id,
      starter_code: 'print(input().upper())',
      language: 'python',
      tags: ['contract-test'],
      test_cases: [
        { name: 'uppercase-hello', input: 'hello', expected_output: 'HELLO', match_type: 'exact', order: 0 },
        { name: 'uppercase-world', input: 'world', expected_output: 'WORLD', match_type: 'exact', order: 1 },
      ],
    }),
  });
  if (problemRes.status !== 201) {
    throw new Error(`Failed to create problem: ${problemRes.status}`);
  }
  const prob = await problemRes.json();

  // Publish the problem to the section so students can create student work.
  // Endpoint: POST /api/v1/sections/{sectionId}/problems with problem_id in body.
  const pubRes = await contractFetch(
    `/api/v1/sections/${sec.id}/problems`,
    instructorToken,
    { method: 'POST', body: JSON.stringify({ problem_id: prob.id }) },
  );
  if (pubRes.status !== 201 && pubRes.status !== 409) {
    throw new Error(`Failed to publish problem to section: ${pubRes.status}`);
  }

  // Create session from problem
  const sessionRes = await contractFetch('/api/v1/sessions', instructorToken, {
    method: 'POST',
    body: JSON.stringify({
      section_id: sec.id,
      problem_id: prob.id,
    }),
  });
  if (sessionRes.status !== 201) {
    throw new Error(`Failed to create session: ${sessionRes.status}`);
  }
  const sess = await sessionRes.json();

  // Write state to temp file for tests to read
  const stateFile = path.join(os.tmpdir(), `jest-contract-state-${process.ppid || 'default'}.json`);
  const state = {
    runId: RUN_ID,
    namespaceId: CONTRACT_NS,
    invitationId: inv.id,
    instructorUserId: user.id,
    classId: cls.id,
    sectionId: sec.id,
    problemId: prob.id,
    sessionId: sess.id,
    joinCode: sec.join_code,
    instructorExternalId: INSTRUCTOR_EXTERNAL_ID,
    instructorEmail: INSTRUCTOR_EMAIL,
    instructorToken: instructorToken,
    adminToken: adminToken,
    apiBaseUrl: API_BASE,
  };
  fs.writeFileSync(stateFile, JSON.stringify(state));

  console.log('Contract tests global setup complete');
};

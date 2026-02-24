/**
 * Jest global setup for contract tests.
 * Runs once before all test files.
 * Creates namespace, instructor user, class, section, and session.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:8080';

// Generate unique run ID
const RUN_ID = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CONTRACT_NS = `contract-${RUN_ID}`;
const ADMIN_TOKEN = 'test:contract-admin:contract-admin@test.local';
const INSTRUCTOR_EXTERNAL_ID = `instructor-${RUN_ID}`;
const INSTRUCTOR_EMAIL = `instructor-${RUN_ID}@contract-test.local`;
const INSTRUCTOR_TOKEN = `test:${INSTRUCTOR_EXTERNAL_ID}:${INSTRUCTOR_EMAIL}`;

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
      `or start it manually and set API_BASE_URL.`
    );
  }

  // Create namespace
  const nsRes = await contractFetch('/api/v1/namespaces', ADMIN_TOKEN, {
    method: 'POST',
    body: JSON.stringify({
      id: CONTRACT_NS,
      display_name: 'Contract Test Namespace',
    }),
  });
  if (nsRes.status !== 201 && nsRes.status !== 500) {
    throw new Error(`Failed to create namespace: ${nsRes.status}`);
  }

  // Create invitation
  const invRes = await contractFetch('/api/v1/system/invitations', ADMIN_TOKEN, {
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
  const acceptRes = await contractFetch('/api/v1/auth/accept-invite', INSTRUCTOR_TOKEN, {
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
  const classRes = await contractFetch('/api/v1/classes', INSTRUCTOR_TOKEN, {
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
  const sectionRes = await contractFetch(`/api/v1/classes/${cls.id}/sections`, INSTRUCTOR_TOKEN, {
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

  // Create problem (required for session join to work — Join handler needs a real problem UUID)
  const problemRes = await contractFetch('/api/v1/problems', INSTRUCTOR_TOKEN, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Contract Test Problem',
      description: 'Print hello',
      class_id: cls.id,
      starter_code: 'print("hello")',
      tags: ['contract-test'],
    }),
  });
  if (problemRes.status !== 201) {
    throw new Error(`Failed to create problem: ${problemRes.status}`);
  }
  const prob = await problemRes.json();

  // Create session from problem
  const sessionRes = await contractFetch('/api/v1/sessions', INSTRUCTOR_TOKEN, {
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
    sessionId: sess.id,
    joinCode: sec.join_code,
    instructorExternalId: INSTRUCTOR_EXTERNAL_ID,
    instructorEmail: INSTRUCTOR_EMAIL,
    instructorToken: INSTRUCTOR_TOKEN,
    apiBaseUrl: API_BASE,
  };
  fs.writeFileSync(stateFile, JSON.stringify(state));

  console.log('Contract tests global setup complete');
};

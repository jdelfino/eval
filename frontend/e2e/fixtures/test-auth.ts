/**
 * Firebase Auth helpers for E2E tests.
 *
 * Supports two modes, selected by environment variables:
 *
 * 1. **Emulator mode** (local dev, CI): FIREBASE_AUTH_EMULATOR_HOST is set.
 *    Talks to the Firebase Auth Emulator REST API with a fake API key.
 *
 * 2. **Real IDP mode** (staging): FIREBASE_AUTH_EMULATOR_HOST is NOT set.
 *    Talks to the real Identity Toolkit REST API with a real API key.
 *    Tenant-scoped when FIREBASE_TENANT_ID is set.
 *    Admin operations use a GCP access token from the GKE metadata server.
 *
 * The Identity Toolkit REST API is the same in both modes — only the base URL,
 * API key, and admin auth header differ.
 *
 * @see https://firebase.google.com/docs/reference/rest/auth
 */

const IS_EMULATOR = !!process.env.FIREBASE_AUTH_EMULATOR_HOST;
const EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';

// ── Production safety guards ────────────────────────────────────────────────
// Real IDP mode REQUIRES a tenant ID. Production uses the default tenant
// (no FIREBASE_TENANT_ID), so this guard prevents tests from ever creating
// users in the production IDP tenant.
if (!IS_EMULATOR && !process.env.FIREBASE_TENANT_ID) {
  throw new Error(
    'SAFETY: Real IDP mode requires FIREBASE_TENANT_ID to be set. ' +
    'Tests must never run against the production (default) tenant. ' +
    'Set FIREBASE_AUTH_EMULATOR_HOST for local/CI or FIREBASE_TENANT_ID for staging.'
  );
}
if (!IS_EMULATOR && !process.env.FIREBASE_API_KEY) {
  throw new Error(
    'SAFETY: Real IDP mode requires FIREBASE_API_KEY to be set.'
  );
}
// ─────────────────────────────────────────────────────────────────────────────

// Identity Toolkit REST API base URL
const IDP_BASE_URL = IS_EMULATOR
  ? `http://${EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`
  : 'https://identitytoolkit.googleapis.com/v1';

// API key for public endpoints (signUp, signIn)
const API_KEY = IS_EMULATOR
  ? 'fake-api-key'
  : process.env.FIREBASE_API_KEY!;

// Tenant ID for tenant-scoped operations (real IDP staging)
const TENANT_ID = process.env.FIREBASE_TENANT_ID || undefined;

// Project ID for emulator admin endpoints
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'demo-test';

// Track created user UIDs for cleanup in real IDP mode
const createdUserIds = new Set<string>();

/**
 * Get an admin auth header for Identity Toolkit admin operations.
 *
 * - Emulator: uses the magic "Bearer owner" token
 * - Real IDP: fetches an OAuth2 access token from the GKE metadata server
 *   (requires Workload Identity on the pod's service account)
 */
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getAdminAuthHeader(): Promise<string> {
  if (IS_EMULATOR) {
    return 'Bearer owner';
  }

  // Return cached token if still valid (with 60s buffer)
  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt - 60_000) {
    return `Bearer ${cachedAccessToken.token}`;
  }

  // Prefer explicit GCP_ACCESS_TOKEN (set by CI from WIF credentials).
  // Falls back to the GKE metadata server (in-cluster runs).
  const envToken = process.env.GCP_ACCESS_TOKEN;
  if (envToken) {
    cachedAccessToken = {
      token: envToken,
      // WIF tokens last ~1h; cache for the test run duration
      expiresAt: Date.now() + 3600_000,
    };
    return `Bearer ${envToken}`;
  }

  // Fetch access token from GKE metadata server
  const res = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(3000),
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to get GCP access token: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return `Bearer ${data.access_token}`;
}

/** Build the request body, adding tenantId when configured. */
function withTenant<T extends Record<string, unknown>>(body: T): T {
  if (TENANT_ID) {
    return { ...body, tenantId: TENANT_ID };
  }
  return body;
}

/**
 * Creates a new user account in Firebase Auth.
 */
export async function createTestUser(email: string, password: string): Promise<void> {
  const url = `${IDP_BASE_URL}/accounts:signUp?key=${API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withTenant({ email, password, returnSecureToken: true })),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create user: ${res.status} ${body}`);
  }
  const data = await res.json();
  if (data.localId) {
    createdUserIds.add(data.localId);
  }
}

/**
 * Creates a new user account with emailVerified=true.
 *
 * Uses the admin API to set emailVerified directly, bypassing the normal
 * email-verification flow. Required for endpoints that check EmailVerified
 * (e.g. POST /auth/bootstrap, POST /auth/register-student).
 *
 * Idempotent: if the user already exists, this is a no-op (returns without error).
 *
 * In real IDP mode (staging), users are pre-created. This function tries signIn
 * first — if the user exists, it skips signUp to avoid rate-limit triggers. If
 * signIn fails with EMAIL_NOT_FOUND, it falls back to signUp (handles first-time
 * setup or emulator mode).
 */
export async function createVerifiedTestUser(email: string, password: string): Promise<void> {
  const signInUrl = `${IDP_BASE_URL}/accounts:signInWithPassword?key=${API_KEY}`;

  if (!IS_EMULATOR) {
    // Real IDP mode: try signIn first — user may be pre-created.
    const signInRes = await fetch(signInUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withTenant({ email, password, returnSecureToken: true })),
    });
    if (signInRes.ok) {
      // User already exists and credentials are correct — no signUp needed.
      const { localId } = await signInRes.json();
      createdUserIds.add(localId);
      // emailVerified should already be set on pre-created users; skip update.
      return;
    }
    const signInBody = await signInRes.text();
    // Only fall through to signUp if the user doesn't exist yet.
    if (!signInBody.includes('EMAIL_NOT_FOUND') && !signInBody.includes('INVALID_LOGIN_CREDENTIALS')) {
      throw new Error(`Failed to sign in user for verification: ${signInRes.status} ${signInBody}`);
    }
    // Fall through to signUp below for first-time setup.
  }

  // Emulator mode or first-time real IDP setup: create user via signUp.
  const signUpUrl = `${IDP_BASE_URL}/accounts:signUp?key=${API_KEY}`;
  const signUpRes = await fetch(signUpUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withTenant({ email, password, returnSecureToken: false })),
  });
  if (!signUpRes.ok) {
    const body = await signUpRes.text();
    // EMAIL_EXISTS is fine — user was already created
    if (!body.includes('EMAIL_EXISTS')) {
      throw new Error(`Failed to create user: ${signUpRes.status} ${body}`);
    }
  }

  // Sign in to get the user's localId (UID) so we can update emailVerified
  const signInRes2 = await fetch(signInUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withTenant({ email, password, returnSecureToken: true })),
  });
  if (!signInRes2.ok) {
    const body = await signInRes2.text();
    throw new Error(`Failed to sign in user for verification: ${signInRes2.status} ${body}`);
  }
  const { localId } = await signInRes2.json();
  createdUserIds.add(localId);

  // Set emailVerified=true via admin API.
  // Emulator uses "Bearer owner"; real IDP uses a GCP access token.
  const updateUrl = `${IDP_BASE_URL}/accounts:update`;
  const authHeader = await getAdminAuthHeader();
  const updateRes = await fetch(updateUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify(withTenant({ localId, emailVerified: true })),
  });
  if (!updateRes.ok) {
    const body = await updateRes.text();
    throw new Error(`Failed to set emailVerified on user: ${updateRes.status} ${body}`);
  }
}

/**
 * Signs in a user via the Firebase Auth REST API and returns the ID token.
 */
export async function getTestToken(email: string, password: string): Promise<string> {
  const url = `${IDP_BASE_URL}/accounts:signInWithPassword?key=${API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withTenant({ email, password, returnSecureToken: true })),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to sign in: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.idToken as string;
}

/**
 * Deletes all test users created during this test run.
 *
 * - Emulator mode: bulk-deletes all users via the emulator admin endpoint.
 * - Real IDP mode: users are stable and reused across runs (pre-created for staging).
 *   Namespace deletion (FK CASCADE) removes the DB records; IDP users are kept.
 */
export async function clearTestUsers(): Promise<void> {
  if (!IS_EMULATOR) {
    // Real IDP: users are stable and reused — don't delete them from the IDP.
    // Namespace teardown (deleteTestNamespace) handles DB record cleanup via CASCADE.
    createdUserIds.clear();
    return;
  }

  // Emulator mode: bulk-delete all users
  const url = `http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to clear emulator users: ${res.status} ${body}`);
  }
  createdUserIds.clear();
}

/**
 * Firebase Auth Emulator helpers for contract (Jest/Node.js) tests.
 *
 * These functions talk directly to the emulator REST API to create users
 * and sign in to get Firebase ID tokens.
 *
 * Unlike the E2E (Playwright) emulator helpers, these run in Node.js
 * (Jest test runner) rather than the browser.
 */

const EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';
const EMULATOR_BASE_URL = `http://${EMULATOR_HOST}`;
const API_KEY = 'fake-api-key';

/**
 * Creates a user in the Firebase Auth Emulator with emailVerified=true
 * and returns a Firebase ID token.
 *
 * Idempotent: if the user already exists, signs in to get the token.
 */
export async function getVerifiedEmulatorToken(email: string, password: string): Promise<string> {
  // Try to sign up (ignore EMAIL_EXISTS)
  const signUpUrl = `${EMULATOR_BASE_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`;
  const signUpRes = await fetch(signUpUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: false }),
  });
  if (!signUpRes.ok) {
    const body = await signUpRes.text();
    if (!body.includes('EMAIL_EXISTS')) {
      throw new Error(`Failed to create emulator user ${email}: ${signUpRes.status} ${body}`);
    }
  }

  // Sign in to get token and localId
  const signInUrl = `${EMULATOR_BASE_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
  const signInRes = await fetch(signInUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (!signInRes.ok) {
    const body = await signInRes.text();
    throw new Error(`Failed to sign in emulator user ${email}: ${signInRes.status} ${body}`);
  }
  const { idToken, localId } = await signInRes.json();

  // Set emailVerified=true via the emulator admin API.
  // The user-facing accounts:update endpoint ignores emailVerified, so we must
  // use the admin endpoint with "Bearer owner" auth and the localId field.
  const updateUrl = `${EMULATOR_BASE_URL}/identitytoolkit.googleapis.com/v1/accounts:update`;
  const updateRes = await fetch(updateUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer owner',
    },
    body: JSON.stringify({ localId, emailVerified: true }),
  });
  if (!updateRes.ok) {
    const body = await updateRes.text();
    throw new Error(`Failed to set emailVerified on ${email}: ${updateRes.status} ${body}`);
  }

  // Sign in again to get a token that reflects emailVerified=true
  const refreshRes = await fetch(signInUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (!refreshRes.ok) {
    const body = await refreshRes.text();
    throw new Error(`Failed to refresh token for ${email}: ${refreshRes.status} ${body}`);
  }
  const refreshData = await refreshRes.json();

  return refreshData.idToken;
}

const PROJECT_ID = 'demo-test';

/**
 * Delete all users from the Firebase Auth Emulator.
 */
export async function clearEmulatorUsers(): Promise<void> {
  const url = `${EMULATOR_BASE_URL}/emulator/v1/projects/${PROJECT_ID}/accounts`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to clear emulator users: ${res.status} ${body}`);
  }
}

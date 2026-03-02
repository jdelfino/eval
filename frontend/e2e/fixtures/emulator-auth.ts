/**
 * Firebase Auth Emulator helpers for E2E tests.
 *
 * These functions talk directly to the emulator REST API to create users,
 * sign in, and reset state between tests. They are used when running E2E
 * tests with USE_FIREBASE_EMULATOR=1.
 *
 * The emulator REST API is compatible with the Google Identity Toolkit API:
 * https://firebase.google.com/docs/reference/rest/auth
 */

import { Page } from '@playwright/test';

const EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';
const EMULATOR_BASE_URL = `http://${EMULATOR_HOST}`;
const API_KEY = 'fake-api-key';
const PROJECT_ID = 'demo-test';

/**
 * Creates a new user account in the Firebase Auth Emulator.
 */
export async function createEmulatorUser(email: string, password: string): Promise<void> {
  const url = `${EMULATOR_BASE_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create emulator user: ${res.status} ${body}`);
  }
}

/**
 * Signs in a user via the Firebase Auth Emulator REST API and returns the ID token.
 */
export async function getEmulatorToken(email: string, password: string): Promise<string> {
  const url = `${EMULATOR_BASE_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to sign in via emulator: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.idToken as string;
}

/**
 * Deletes all users from the Firebase Auth Emulator, resetting auth state.
 * Call this between tests or in afterEach/afterAll hooks.
 */
export async function clearEmulatorUsers(): Promise<void> {
  const url = `${EMULATOR_BASE_URL}/emulator/v1/projects/${PROJECT_ID}/accounts`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to clear emulator users: ${res.status} ${body}`);
  }
}

/**
 * Signs in via the Firebase Auth Emulator using Playwright by driving the
 * Firebase client SDK in the browser context. Calls signInWithEmailAndPassword
 * on the window-exposed Firebase auth instance.
 *
 * Requires the frontend to be built with:
 *   NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=http://localhost:9099
 *
 * After sign-in, waits for auth hydration to complete by polling until the
 * page navigates away from "/" (authenticated users are redirected to their
 * role dashboard).
 */
export async function signInViaEmulator(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  // Navigate to establish origin and trigger auth state initialization
  await page.goto('/');

  // Use Firebase client SDK via browser evaluation
  await page.evaluate(
    async ({ email, password }) => {
      const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');
      const auth = getAuth();
      await signInWithEmailAndPassword(auth, email, password);
    },
    { email, password }
  );

  // Wait for auth hydration — landing page redirects authenticated users
  // to their role-appropriate dashboard (/instructor, /sections, /system, etc.)
  await page.waitForURL(
    (url) => {
      const path = new URL(url).pathname;
      return path !== '/' && !path.startsWith('/auth/');
    },
    { timeout: 15_000 }
  );
}

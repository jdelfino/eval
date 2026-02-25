/**
 * Injectable auth provider for the API client.
 *
 * In production: uses Firebase Auth to get tokens.
 * In E2E test mode (NEXT_PUBLIC_AUTH_MODE=test): uses localStorage-backed test tokens,
 * avoiding any Firebase dependency.
 * In unit tests: can be configured with a static test token via configureTestAuth().
 */

/**
 * Interface for auth token providers.
 */
export interface AuthProvider {
  getToken(): Promise<string>;
}

/**
 * Check if running in E2E test mode.
 */
export function isTestMode(): boolean {
  return typeof window !== 'undefined' && process.env.NEXT_PUBLIC_AUTH_MODE === 'test';
}

export const TEST_USER_KEY = 'testAuthUser';

/**
 * Test auth provider that stores user in localStorage for persistence across page navigations.
 * Used for E2E tests with AUTH_MODE=test.
 */
class LocalStorageTestAuthProvider implements AuthProvider {
  async getToken(): Promise<string> {
    if (typeof window === 'undefined') {
      throw new Error('LocalStorageTestAuthProvider requires browser environment');
    }
    const stored = localStorage.getItem(TEST_USER_KEY);
    if (!stored) {
      throw new Error('No test user set');
    }
    const { externalId, email } = JSON.parse(stored);
    return `test:${externalId}:${email}`;
  }
}

/**
 * Set test user in localStorage (for E2E test mode).
 */
export function setTestUser(externalId: string, email: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(TEST_USER_KEY, JSON.stringify({ externalId, email }));
  }
}

/**
 * Get test token from localStorage (for E2E test mode).
 */
export function getTestToken(): string | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(TEST_USER_KEY);
  if (!stored) return null;
  const { externalId, email } = JSON.parse(stored);
  return `test:${externalId}:${email}`;
}

/**
 * Clear test user from localStorage.
 */
export function clearTestUser(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TEST_USER_KEY);
  }
}

/**
 * Production auth provider using Firebase Auth.
 * Lazy-loads Firebase to avoid importing it in test mode.
 */
class FirebaseAuthProvider implements AuthProvider {
  async getToken(): Promise<string> {
    const { firebaseAuth } = await import('@/lib/firebase');
    const user = firebaseAuth.currentUser;
    if (!user) {
      throw new Error('No authenticated user');
    }
    return user.getIdToken();
  }
}

/**
 * Static token provider for unit tests.
 */
class StaticTokenProvider implements AuthProvider {
  constructor(private token: string) {}

  async getToken(): Promise<string> {
    return this.token;
  }
}

// Module-level provider instance
// In test mode, use localStorage-backed provider; otherwise use Firebase
let authProvider: AuthProvider = isTestMode()
  ? new LocalStorageTestAuthProvider()
  : new FirebaseAuthProvider();

/**
 * Set the auth provider to use for API requests.
 * @param provider - The auth provider instance
 */
export function setAuthProvider(provider: AuthProvider): void {
  authProvider = provider;
}

/**
 * Get an auth token from the current provider.
 * @returns The auth token string
 */
export function getAuthToken(): Promise<string> {
  return authProvider.getToken();
}

/**
 * Configure test auth with a static token.
 * Convenience function for unit/integration tests.
 *
 * @param token - Test token in format "test:<external_id>:<email>"
 */
export function configureTestAuth(token: string): void {
  authProvider = new StaticTokenProvider(token);
}

/**
 * Reset to the default auth provider based on environment.
 * Useful for cleanup in tests.
 */
export function resetAuthProvider(): void {
  authProvider = isTestMode()
    ? new LocalStorageTestAuthProvider()
    : new FirebaseAuthProvider();
}

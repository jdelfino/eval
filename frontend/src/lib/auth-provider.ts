/**
 * Injectable auth provider for the API client.
 *
 * In production, uses Firebase Auth to get tokens.
 * In tests, can be configured with a static test token.
 */

import { firebaseAuth } from '@/lib/firebase';

/**
 * Interface for auth token providers.
 */
export interface AuthProvider {
  getToken(): Promise<string>;
}

/**
 * Production auth provider using Firebase Auth.
 */
class FirebaseAuthProvider implements AuthProvider {
  async getToken(): Promise<string> {
    const user = firebaseAuth.currentUser;
    if (!user) {
      throw new Error('No authenticated user');
    }
    return user.getIdToken();
  }
}

/**
 * Test auth provider that returns a static token.
 * Used for integration tests against the backend with AUTH_MODE=test.
 */
class TestAuthProvider implements AuthProvider {
  constructor(private token: string) {}

  async getToken(): Promise<string> {
    return this.token;
  }
}

// Module-level provider instance, defaults to Firebase
let authProvider: AuthProvider = new FirebaseAuthProvider();

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
 * Convenience function for integration tests.
 *
 * @param token - Test token in format "test:<external_id>:<email>"
 */
export function configureTestAuth(token: string): void {
  authProvider = new TestAuthProvider(token);
}

/**
 * Reset to the default Firebase auth provider.
 * Useful for cleanup in tests.
 */
export function resetAuthProvider(): void {
  authProvider = new FirebaseAuthProvider();
}

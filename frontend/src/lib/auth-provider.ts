/**
 * Injectable auth provider for the API client.
 *
 * In production: uses Firebase Auth to get tokens.
 * In unit tests: can be configured with a static test token via configureTestAuth().
 */

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

// Module-level provider instance — always Firebase in production
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
 * Convenience function for unit/integration tests.
 *
 * @param token - Test token string
 */
export function configureTestAuth(token: string): void {
  authProvider = new StaticTokenProvider(token);
}

/**
 * Reset to the default Firebase auth provider.
 * Useful for cleanup in tests.
 */
export function resetAuthProvider(): void {
  authProvider = new FirebaseAuthProvider();
}

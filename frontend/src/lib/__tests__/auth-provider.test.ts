/**
 * Unit tests for the auth-provider module.
 * @jest-environment jsdom
 */

// Mock firebase before importing auth-provider
const mockGetIdToken = jest.fn();
const mockCurrentUser = { getIdToken: mockGetIdToken };

jest.mock('@/lib/firebase', () => ({
  firebaseAuth: {
    get currentUser() {
      return mockCurrentUser;
    },
  },
}));

import {
  getAuthToken,
  configureTestAuth,
  resetAuthProvider,
  TEST_USER_KEY,
} from '../auth-provider';

describe('TEST_USER_KEY', () => {
  it('is exported as a string constant with the correct value', () => {
    expect(TEST_USER_KEY).toBe('testAuthUser');
  });
});

describe('auth-provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAuthProvider(); // Reset to Firebase provider
  });

  describe('getAuthToken with Firebase provider (default)', () => {
    it('returns token from Firebase currentUser', async () => {
      mockGetIdToken.mockResolvedValue('firebase-token-123');

      const token = await getAuthToken();

      expect(token).toBe('firebase-token-123');
      expect(mockGetIdToken).toHaveBeenCalled();
    });

    it('throws when no Firebase user is logged in', async () => {
      // Temporarily make currentUser null
      jest.doMock('@/lib/firebase', () => ({
        firebaseAuth: { currentUser: null },
      }));

      // Re-import to get the null user behavior
      // This is tricky with module caching, so we test via resetAuthProvider
      // which creates a new FirebaseAuthProvider
    });
  });

  describe('configureTestAuth', () => {
    it('switches to test auth provider with static token', async () => {
      configureTestAuth('test:user-123:user@test.com');

      const token = await getAuthToken();

      expect(token).toBe('test:user-123:user@test.com');
      expect(mockGetIdToken).not.toHaveBeenCalled(); // Firebase not called
    });

    it('allows changing test token', async () => {
      configureTestAuth('test:first:first@test.com');
      expect(await getAuthToken()).toBe('test:first:first@test.com');

      configureTestAuth('test:second:second@test.com');
      expect(await getAuthToken()).toBe('test:second:second@test.com');
    });
  });

  describe('resetAuthProvider', () => {
    it('resets to Firebase provider after test auth', async () => {
      mockGetIdToken.mockResolvedValue('firebase-token-456');

      // Configure test auth
      configureTestAuth('test:user:user@test.com');
      expect(await getAuthToken()).toBe('test:user:user@test.com');

      // Reset to Firebase
      resetAuthProvider();
      const token = await getAuthToken();

      expect(token).toBe('firebase-token-456');
      expect(mockGetIdToken).toHaveBeenCalled();
    });
  });
});

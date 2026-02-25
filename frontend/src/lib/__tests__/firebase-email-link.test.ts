/**
 * Unit tests for firebase-email-link helper module.
 * @jest-environment jsdom
 */

// Mock isTestMode from auth-provider so we can control it per test
const mockIsTestMode = jest.fn();
jest.mock('@/lib/auth-provider', () => ({
  isTestMode: () => mockIsTestMode(),
}));

// Mock firebase/auth (mapped via jest config to src/__mocks__/firebase/auth.ts)
// We capture refs to mock functions so we can configure them per test.
const mockSendSignInLinkToEmail = jest.fn();
const mockIsSignInWithEmailLink = jest.fn();
const mockSignInWithEmailLink = jest.fn();

jest.mock('firebase/auth', () => ({
  sendSignInLinkToEmail: (...args: unknown[]) => mockSendSignInLinkToEmail(...args),
  isSignInWithEmailLink: (...args: unknown[]) => mockIsSignInWithEmailLink(...args),
  signInWithEmailLink: (...args: unknown[]) => mockSignInWithEmailLink(...args),
}));

// Mock @/lib/firebase so firebaseAuth is accessible
const mockFirebaseAuth = { name: 'mock-auth' };
jest.mock('@/lib/firebase', () => ({
  firebaseAuth: mockFirebaseAuth,
}));

import {
  sendInvitationEmail,
  checkIsSignInWithEmailLink,
  completeSignInWithEmailLink,
} from '../firebase-email-link';

// jsdom sets window.location.origin to 'http://localhost' by default.
// The tests below rely on that value when asserting the action code URL.

describe('firebase-email-link', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: not test mode
    mockIsTestMode.mockReturnValue(false);
  });

  describe('sendInvitationEmail', () => {
    it('is a no-op in test mode', async () => {
      mockIsTestMode.mockReturnValue(true);

      await sendInvitationEmail('user@example.com', 'token-abc');

      expect(mockSendSignInLinkToEmail).not.toHaveBeenCalled();
    });

    it('calls sendSignInLinkToEmail with correct args in production mode', async () => {
      mockIsTestMode.mockReturnValue(false);
      mockSendSignInLinkToEmail.mockResolvedValue(undefined);

      await sendInvitationEmail('user@example.com', 'invite-token-123');

      expect(mockSendSignInLinkToEmail).toHaveBeenCalledTimes(1);
      expect(mockSendSignInLinkToEmail).toHaveBeenCalledWith(
        mockFirebaseAuth,
        'user@example.com',
        {
          url: 'http://localhost/invite/accept?token=invite-token-123',
          handleCodeInApp: true,
        },
      );
    });

    it('propagates errors from sendSignInLinkToEmail', async () => {
      mockIsTestMode.mockReturnValue(false);
      const error = new Error('Firebase error');
      mockSendSignInLinkToEmail.mockRejectedValue(error);

      await expect(sendInvitationEmail('user@example.com', 'token-xyz')).rejects.toThrow('Firebase error');
    });
  });

  describe('checkIsSignInWithEmailLink', () => {
    it('returns false in test mode without calling Firebase', async () => {
      mockIsTestMode.mockReturnValue(true);

      const result = await checkIsSignInWithEmailLink('https://example.com?oobCode=abc');

      expect(result).toBe(false);
      expect(mockIsSignInWithEmailLink).not.toHaveBeenCalled();
    });

    it('calls isSignInWithEmailLink with correct args in production mode', async () => {
      mockIsTestMode.mockReturnValue(false);
      mockIsSignInWithEmailLink.mockReturnValue(true);

      const url = 'https://example.com?oobCode=abc';
      const result = await checkIsSignInWithEmailLink(url);

      expect(result).toBe(true);
      expect(mockIsSignInWithEmailLink).toHaveBeenCalledTimes(1);
      expect(mockIsSignInWithEmailLink).toHaveBeenCalledWith(mockFirebaseAuth, url);
    });

    it('returns false when Firebase says it is not a sign-in link', async () => {
      mockIsTestMode.mockReturnValue(false);
      mockIsSignInWithEmailLink.mockReturnValue(false);

      const result = await checkIsSignInWithEmailLink('https://example.com/other');

      expect(result).toBe(false);
    });
  });

  describe('completeSignInWithEmailLink', () => {
    it('calls signInWithEmailLink with correct args', async () => {
      const mockCredential = { user: { uid: 'user-123' } };
      mockSignInWithEmailLink.mockResolvedValue(mockCredential);

      const url = 'https://example.com?oobCode=abc';
      const result = await completeSignInWithEmailLink('user@example.com', url);

      expect(result).toBe(mockCredential);
      expect(mockSignInWithEmailLink).toHaveBeenCalledTimes(1);
      expect(mockSignInWithEmailLink).toHaveBeenCalledWith(mockFirebaseAuth, 'user@example.com', url);
    });

    it('propagates errors from signInWithEmailLink', async () => {
      const error = new Error('auth/invalid-action-code');
      mockSignInWithEmailLink.mockRejectedValue(error);

      await expect(
        completeSignInWithEmailLink('user@example.com', 'https://example.com?oobCode=bad'),
      ).rejects.toThrow('auth/invalid-action-code');
    });

    it('works regardless of test mode (no test mode guard)', async () => {
      // completeSignInWithEmailLink has no test mode guard per the spec
      mockIsTestMode.mockReturnValue(true);
      const mockCredential = { user: { uid: 'user-456' } };
      mockSignInWithEmailLink.mockResolvedValue(mockCredential);

      const result = await completeSignInWithEmailLink('user@example.com', 'https://example.com?oobCode=abc');

      expect(result).toBe(mockCredential);
      expect(mockSignInWithEmailLink).toHaveBeenCalledTimes(1);
    });
  });
});

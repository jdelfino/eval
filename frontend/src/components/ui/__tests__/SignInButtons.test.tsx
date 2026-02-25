/**
 * Unit tests for SignInButtons component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Mock auth-provider module (no isTestMode or setTestUser — they are not used by SignInButtons)
jest.mock('@/lib/auth-provider', () => ({}));

// Mock firebase/auth (auto-loaded from __mocks__)
const mockSignInWithPopup = jest.fn();
const mockGoogleAuthProvider = jest.fn();
const mockGithubAuthProvider = jest.fn();
const mockOAuthProvider = jest.fn();

jest.mock('firebase/auth', () => ({
  signInWithPopup: (...args: unknown[]) => mockSignInWithPopup(...args),
  GoogleAuthProvider: function () {
    return mockGoogleAuthProvider();
  },
  GithubAuthProvider: function () {
    return mockGithubAuthProvider();
  },
  OAuthProvider: function (providerId: string) {
    return mockOAuthProvider(providerId);
  },
}));

// Mock @/lib/firebase
const mockFirebaseAuth = { currentUser: null };
jest.mock('@/lib/firebase', () => ({
  firebaseAuth: mockFirebaseAuth,
}));

import { SignInButtons } from '../SignInButtons';

describe('SignInButtons', () => {
  const mockOnSuccess = jest.fn();
  const mockOnError = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('production mode', () => {
    it('renders one button per provider', () => {
      render(<SignInButtons onSuccess={mockOnSuccess} onError={mockOnError} />);

      expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /github/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /microsoft/i })).toBeInTheDocument();
    });

    it('renders an optional label heading', () => {
      render(
        <SignInButtons
          onSuccess={mockOnSuccess}
          onError={mockOnError}
          label="Sign in to join CS101"
        />
      );

      expect(screen.getByText('Sign in to join CS101')).toBeInTheDocument();
    });

    it('does not render a heading when label is not provided', () => {
      render(<SignInButtons onSuccess={mockOnSuccess} onError={mockOnError} />);

      expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    });

    it('calls signInWithPopup with GoogleAuthProvider when Google button is clicked', async () => {
      const googleProviderInstance = { providerId: 'google.com' };
      mockGoogleAuthProvider.mockReturnValue(googleProviderInstance);
      mockSignInWithPopup.mockResolvedValue({ user: { uid: 'abc' } });

      render(<SignInButtons onSuccess={mockOnSuccess} onError={mockOnError} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /google/i }));
      });

      await waitFor(() => {
        expect(mockSignInWithPopup).toHaveBeenCalledWith(
          mockFirebaseAuth,
          googleProviderInstance
        );
      });
    });

    it('calls signInWithPopup with GithubAuthProvider when GitHub button is clicked', async () => {
      const githubProviderInstance = { providerId: 'github.com' };
      mockGithubAuthProvider.mockReturnValue(githubProviderInstance);
      mockSignInWithPopup.mockResolvedValue({ user: { uid: 'abc' } });

      render(<SignInButtons onSuccess={mockOnSuccess} onError={mockOnError} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /github/i }));
      });

      await waitFor(() => {
        expect(mockSignInWithPopup).toHaveBeenCalledWith(
          mockFirebaseAuth,
          githubProviderInstance
        );
      });
    });

    it('calls signInWithPopup with OAuthProvider for Microsoft when Microsoft button is clicked', async () => {
      const microsoftProviderInstance = { providerId: 'microsoft.com' };
      mockOAuthProvider.mockReturnValue(microsoftProviderInstance);
      mockSignInWithPopup.mockResolvedValue({ user: { uid: 'abc' } });

      render(<SignInButtons onSuccess={mockOnSuccess} onError={mockOnError} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /microsoft/i }));
      });

      await waitFor(() => {
        expect(mockOAuthProvider).toHaveBeenCalledWith('microsoft.com');
        expect(mockSignInWithPopup).toHaveBeenCalledWith(
          mockFirebaseAuth,
          microsoftProviderInstance
        );
      });
    });

    it('calls onSuccess after successful sign-in', async () => {
      mockGoogleAuthProvider.mockReturnValue({});
      mockSignInWithPopup.mockResolvedValue({ user: { uid: 'abc' } });

      render(<SignInButtons onSuccess={mockOnSuccess} onError={mockOnError} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /google/i }));
      });

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalledTimes(1);
      });
    });

    it('silently ignores auth/popup-closed-by-user error', async () => {
      mockGoogleAuthProvider.mockReturnValue({});
      const error = Object.assign(new Error('Popup closed'), { code: 'auth/popup-closed-by-user' });
      mockSignInWithPopup.mockRejectedValue(error);

      render(<SignInButtons onSuccess={mockOnSuccess} onError={mockOnError} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /google/i }));
      });

      await waitFor(() => {
        expect(mockOnSuccess).not.toHaveBeenCalled();
        expect(mockOnError).not.toHaveBeenCalled();
      });
    });

    it('silently ignores auth/cancelled-popup-request error', async () => {
      mockGoogleAuthProvider.mockReturnValue({});
      const error = Object.assign(new Error('Cancelled'), { code: 'auth/cancelled-popup-request' });
      mockSignInWithPopup.mockRejectedValue(error);

      render(<SignInButtons onSuccess={mockOnSuccess} onError={mockOnError} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /google/i }));
      });

      await waitFor(() => {
        expect(mockOnSuccess).not.toHaveBeenCalled();
        expect(mockOnError).not.toHaveBeenCalled();
      });
    });

    it('shows popup-blocked message for auth/popup-blocked error', async () => {
      mockGoogleAuthProvider.mockReturnValue({});
      const error = Object.assign(new Error('Popup blocked'), { code: 'auth/popup-blocked' });
      mockSignInWithPopup.mockRejectedValue(error);

      render(<SignInButtons onSuccess={mockOnSuccess} onError={mockOnError} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /google/i }));
      });

      await waitFor(() => {
        expect(screen.getByText(/allow popups/i)).toBeInTheDocument();
        expect(mockOnSuccess).not.toHaveBeenCalled();
        expect(mockOnError).not.toHaveBeenCalled();
      });
    });

    it('calls onError for unknown errors', async () => {
      mockGoogleAuthProvider.mockReturnValue({});
      const error = new Error('Unknown sign-in error');
      mockSignInWithPopup.mockRejectedValue(error);

      render(<SignInButtons onSuccess={mockOnSuccess} onError={mockOnError} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /google/i }));
      });

      await waitFor(() => {
        expect(mockOnError).toHaveBeenCalledWith(error);
        expect(mockOnSuccess).not.toHaveBeenCalled();
      });
    });

    it('shows loading state on clicked button while popup is open', async () => {
      mockGoogleAuthProvider.mockReturnValue({});
      // Never resolves so we can inspect the loading state
      mockSignInWithPopup.mockImplementation(() => new Promise(() => {}));

      render(<SignInButtons onSuccess={mockOnSuccess} onError={mockOnError} />);

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /google/i }));
      });

      await waitFor(() => {
        const googleButton = screen.getByRole('button', { name: /google/i });
        expect(googleButton).toBeDisabled();
      });
    });
  });

  describe('no test mode branch', () => {
    it('always renders provider buttons, never a Test Sign In button', () => {
      render(<SignInButtons onSuccess={mockOnSuccess} onError={mockOnError} />);

      expect(screen.queryByRole('button', { name: /test sign in/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /github/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /microsoft/i })).toBeInTheDocument();
    });
  });
});

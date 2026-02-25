/**
 * Tests for the email/password sign-in fallback page.
 * This page is used for testing environments where social providers are unavailable.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import EmailSignInPage from '../page';
import { useAuth } from '@/contexts/AuthContext';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

// Mock AuthContext — refreshUser is NOT needed (no test mode branch)
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

// Mock auth-provider — isTestMode and setTestUser are NOT imported by the page
jest.mock('@/lib/auth-provider', () => ({}));

// Mock Firebase signInWithEmailAndPassword
const mockSignInWithEmailAndPassword = jest.fn();
jest.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: (...args: unknown[]) => mockSignInWithEmailAndPassword(...args),
  getAuth: jest.fn(),
}));

// Mock firebase lib
jest.mock('@/lib/firebase', () => ({
  firebaseAuth: {},
}));

describe('EmailSignInPage', () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    });
    (useAuth as jest.Mock).mockReturnValue({
      isAuthenticated: false,
    });
  });

  describe('Page Rendering', () => {
    it('renders email and password input fields', () => {
      render(<EmailSignInPage />);

      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    });

    it('renders sign in button', () => {
      render(<EmailSignInPage />);

      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('renders link back to social sign-in page', () => {
      render(<EmailSignInPage />);

      const link = screen.getByRole('link', { name: /sign in with google|social sign.in|back|use a different sign.in method/i });
      expect(link).toHaveAttribute('href', '/auth/signin');
    });

    it('does NOT include account creation or registration links', () => {
      render(<EmailSignInPage />);

      expect(screen.queryByText(/create account/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/register/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/sign up/i)).not.toBeInTheDocument();
    });
  });

  describe('Authentication flow', () => {
    it('redirects to home when already authenticated', async () => {
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: true,
      });

      render(<EmailSignInPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });

    it('calls signInWithEmailAndPassword with submitted credentials', async () => {
      const user = userEvent.setup();
      mockSignInWithEmailAndPassword.mockResolvedValue({
        user: { uid: 'test-uid', email: 'test@example.com' },
      });

      render(<EmailSignInPage />);

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
          expect.anything(),
          'test@example.com',
          'password123'
        );
      });
    });

    it('redirects to home on successful sign-in', async () => {
      const { rerender } = render(<EmailSignInPage />);
      const user = userEvent.setup();

      mockSignInWithEmailAndPassword.mockResolvedValue({
        user: { uid: 'test-uid', email: 'test@example.com' },
      });

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      // Simulate AuthContext updating isAuthenticated
      (useAuth as jest.Mock).mockReturnValue({ isAuthenticated: true });
      rerender(<EmailSignInPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });
  });

  describe('no test mode branch', () => {
    it('always calls signInWithEmailAndPassword — no test mode shortcut', async () => {
      const user = userEvent.setup();
      mockSignInWithEmailAndPassword.mockResolvedValue({
        user: { uid: 'test-uid', email: 'instructor@test.local' },
      });

      render(<EmailSignInPage />);

      await user.type(screen.getByLabelText(/email address/i), 'instructor@test.local');
      await user.type(screen.getByLabelText(/^password$/i), 'any-password');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
          expect.anything(),
          'instructor@test.local',
          'any-password'
        );
      });
    });
  });

  describe('Form Validation', () => {
    it('shows error when submitting empty email', async () => {
      const user = userEvent.setup();
      render(<EmailSignInPage />);

      await user.click(screen.getByRole('button', { name: /sign in/i }));

      expect(screen.getByText(/email is required/i)).toBeInTheDocument();
      expect(mockSignInWithEmailAndPassword).not.toHaveBeenCalled();
    });

    it('shows error when submitting empty password', async () => {
      const user = userEvent.setup();
      render(<EmailSignInPage />);

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
      expect(mockSignInWithEmailAndPassword).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('shows error for invalid credentials', async () => {
      const user = userEvent.setup();
      const firebaseError = new Error('Firebase: Error (auth/invalid-credential).');
      (firebaseError as { code?: string }).code = 'auth/invalid-credential';
      mockSignInWithEmailAndPassword.mockRejectedValue(firebaseError);

      render(<EmailSignInPage />);

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'wrongpassword');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
      });
    });

    it('shows error for wrong password', async () => {
      const user = userEvent.setup();
      const firebaseError = new Error('Firebase: Error (auth/wrong-password).');
      (firebaseError as { code?: string }).code = 'auth/wrong-password';
      mockSignInWithEmailAndPassword.mockRejectedValue(firebaseError);

      render(<EmailSignInPage />);

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'wrongpassword');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
      });
    });

    it('shows error for user-not-found', async () => {
      const user = userEvent.setup();
      const firebaseError = new Error('Firebase: Error (auth/user-not-found).');
      (firebaseError as { code?: string }).code = 'auth/user-not-found';
      mockSignInWithEmailAndPassword.mockRejectedValue(firebaseError);

      render(<EmailSignInPage />);

      await user.type(screen.getByLabelText(/email address/i), 'noone@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
      });
    });

    it('shows loading state while signing in', async () => {
      const user = userEvent.setup();
      mockSignInWithEmailAndPassword.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<EmailSignInPage />);

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      // Button should be disabled or show loading
      const button = screen.getByRole('button', { name: /sign(ing)? in/i });
      expect(button).toBeDisabled();
    });
  });
});

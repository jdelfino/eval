/**
 * Tests for the sign-in page with email/password authentication.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter, useSearchParams } from 'next/navigation';
import SignInPage from '../page';
import { useAuth } from '@/contexts/AuthContext';

// Mock next/navigation
const mockSearchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(() => mockSearchParams),
}));

// Mock AuthContext
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

describe('SignInPage', () => {
  const mockSignIn = jest.fn();
  const mockPush = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset search params
    mockSearchParams.delete('registered');
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    });
    (useSearchParams as jest.Mock).mockReturnValue(mockSearchParams);
    (useAuth as jest.Mock).mockReturnValue({
      signIn: mockSignIn,
      isAuthenticated: false,
      mfaPending: false,
      pendingEmail: null,
      sendMfaCode: jest.fn(),
      verifyMfaCode: jest.fn(),
      cancelMfa: jest.fn(),
    });
  });

  describe('Form Rendering', () => {
    it('renders sign-in form with email and password fields', () => {
      render(<SignInPage />);

      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('renders link to student registration page', () => {
      render(<SignInPage />);

      const studentLink = screen.getByText(/join as a student/i);
      expect(studentLink).toBeInTheDocument();
      expect(studentLink.closest('a')).toHaveAttribute('href', '/register/student');
    });

    it('has correct input types and autocomplete attributes', () => {
      render(<SignInPage />);

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/^password$/i);

      expect(emailInput).toHaveAttribute('type', 'email');
      expect(emailInput).toHaveAttribute('autocomplete', 'email');
      expect(passwordInput).toHaveAttribute('type', 'password');
      expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
    });
  });

  describe('Form Validation', () => {
    it('shows error when email is empty', async () => {
      render(<SignInPage />);

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);

      // The validation error is displayed via ErrorAlert component
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      // The specific message "please enter your email address" should be part of the alert
      expect(screen.getByRole('alert').textContent).toMatch(/please enter your email address/i);

      expect(mockSignIn).not.toHaveBeenCalled();
    });

    it('shows error when email format is invalid', async () => {
      render(<SignInPage />);

      const emailInput = screen.getByLabelText(/email address/i);
      const form = emailInput.closest('form')!;

      fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
      fireEvent.submit(form);

      // The validation error is displayed via ErrorAlert component
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      expect(screen.getByRole('alert').textContent).toMatch(/please enter a valid email address/i);

      expect(mockSignIn).not.toHaveBeenCalled();
    });

    it('shows error when password is empty', async () => {
      render(<SignInPage />);

      const emailInput = screen.getByLabelText(/email address/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.click(submitButton);

      // The validation error is displayed via ErrorAlert component
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      expect(screen.getByRole('alert').textContent).toMatch(/please enter your password/i);

      expect(mockSignIn).not.toHaveBeenCalled();
    });

    it('trims whitespace from email', async () => {
      mockSignIn.mockResolvedValue(undefined);

      render(<SignInPage />);

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: '  test@example.com  ' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'password123');
      });
    });
  });

  describe('Form Submission', () => {
    it('calls signIn with email and password on valid submission', async () => {
      mockSignIn.mockResolvedValue(undefined);

      render(<SignInPage />);

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'password123');
      });
    });

    it('redirects to home page on successful sign-in', async () => {
      // Simulate successful sign-in by updating isAuthenticated after signIn completes
      mockSignIn.mockImplementation(() => {
        // After signIn succeeds, update mock to return isAuthenticated: true
        (useAuth as jest.Mock).mockReturnValue({
          signIn: mockSignIn,
          isAuthenticated: true,
          mfaPending: false,
          pendingEmail: null,
          sendMfaCode: jest.fn(),
          verifyMfaCode: jest.fn(),
          cancelMfa: jest.fn(),
        });
        return Promise.resolve();
      });

      const { rerender } = render(<SignInPage />);

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);

      // Wait for signIn to complete, then rerender to pick up new mock state
      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalled();
      });

      // Rerender to trigger useEffect with isAuthenticated: true
      rerender(<SignInPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });

    it('shows loading state during sign-in', async () => {
      let resolveSignIn: () => void;
      const signInPromise = new Promise<void>((resolve) => {
        resolveSignIn = resolve;
      });
      mockSignIn.mockReturnValue(signInPromise);

      render(<SignInPage />);

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);

      // Check loading state
      await waitFor(() => {
        expect(screen.getByText(/signing in\.\.\./i)).toBeInTheDocument();
      });

      expect(submitButton).toBeDisabled();
      expect(emailInput).toBeDisabled();
      expect(passwordInput).toBeDisabled();

      // Resolve the promise
      resolveSignIn!();
      await waitFor(() => {
        expect(submitButton).not.toBeDisabled();
      });
    });
  });

  describe('Error Handling', () => {
    it('displays error message on sign-in failure', async () => {
      mockSignIn.mockRejectedValue(new Error('Invalid credentials'));

      render(<SignInPage />);

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      // Check for the user-friendly message inside the ErrorAlert
      expect(screen.getByRole('alert').textContent).toMatch(/invalid email or password/i);
    });

    it('maps "not found" errors to user-friendly message', async () => {
      mockSignIn.mockRejectedValue(new Error('User not found'));

      render(<SignInPage />);

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      expect(screen.getByRole('alert').textContent).toMatch(/no account found with this email/i);
    });

    it('clears error message on new submission attempt', async () => {
      mockSignIn.mockRejectedValue(new Error('Invalid credentials'));

      render(<SignInPage />);

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      // First submission with error
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      // Clear error
      mockSignIn.mockResolvedValue(undefined);

      // Second submission
      fireEvent.change(passwordInput, { target: { value: 'correctpassword' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });
    });

    it('handles non-Error exceptions', async () => {
      mockSignIn.mockRejectedValue('String error');

      render(<SignInPage />);

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);

      // When signIn rejects with a non-Error, it falls back to "Sign in failed"
      // which is then classified by ErrorAlert's classifyError, resulting in user-friendly message
      await waitFor(() => {
        // The error message is displayed via ErrorAlert which shows user-friendly messages
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('shows retry button for retryable errors', async () => {
      mockSignIn.mockRejectedValue(new Error('Network error'));

      render(<SignInPage />);

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
      });
    });

    it('allows dismissing error alerts', async () => {
      mockSignIn.mockRejectedValue(new Error('Invalid credentials'));

      render(<SignInPage />);

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/^password$/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      // Dismiss the error
      const dismissButton = screen.getByRole('button', { name: /dismiss/i });
      fireEvent.click(dismissButton);

      await waitFor(() => {
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });
    });
  });

  describe('Registration Success Message', () => {
    it('shows success message when redirected from registration', () => {
      // Set the registered query param
      mockSearchParams.set('registered', 'true');
      (useSearchParams as jest.Mock).mockReturnValue(mockSearchParams);

      render(<SignInPage />);

      expect(screen.getByText('Registration successful! Please sign in with your email and password.')).toBeInTheDocument();
    });

    it('does not show success message when registered param is not set', () => {
      render(<SignInPage />);

      expect(screen.queryByText(/Registration successful/i)).not.toBeInTheDocument();
    });
  });
});

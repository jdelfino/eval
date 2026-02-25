/**
 * Tests for the sign-in page with social provider authentication.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import SignInPage from '../page';
import { useAuth } from '@/contexts/AuthContext';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

// Mock AuthContext
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

// Mock SignInButtons so tests don't depend on Firebase
jest.mock('@/components/ui/SignInButtons', () => ({
  SignInButtons: ({ onSuccess, onError, label }: any) => (
    <div data-testid="sign-in-buttons">
      {label && <p>{label}</p>}
      <button onClick={onSuccess} data-testid="mock-sign-in-success">
        Mock Sign In
      </button>
      <button
        onClick={() => onError(new Error('Sign in failed. Please try again.'))}
        data-testid="mock-sign-in-error"
      >
        Mock Sign In Error
      </button>
    </div>
  ),
}));

describe('SignInPage', () => {
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
    it('renders sign-in page with SignInButtons component', () => {
      render(<SignInPage />);

      expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
    });

    it('renders link to student registration page', () => {
      render(<SignInPage />);

      const studentLink = screen.getByText(/join as a student/i);
      expect(studentLink).toBeInTheDocument();
      expect(studentLink.closest('a')).toHaveAttribute('href', '/register/student');
    });

    it('renders link to email sign-in page', () => {
      render(<SignInPage />);

      const emailLink = screen.getByText(/sign in with email/i);
      expect(emailLink).toBeInTheDocument();
      expect(emailLink.closest('a')).toHaveAttribute('href', '/auth/signin/email');
    });

    it('does not render email or password input fields', () => {
      render(<SignInPage />);

      expect(screen.queryByLabelText(/email address/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
    });
  });

  describe('Authentication flow', () => {
    it('redirects to home when already authenticated', async () => {
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: true,
      });

      render(<SignInPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });

    it('redirects to home after successful sign-in via SignInButtons', async () => {
      // Start unauthenticated
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: false,
      });

      const { rerender } = render(<SignInPage />);

      // Simulate successful sign-in from SignInButtons
      const successButton = screen.getByTestId('mock-sign-in-success');
      fireEvent.click(successButton);

      // Now simulate AuthContext updating isAuthenticated (via onAuthStateChanged)
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: true,
      });

      rerender(<SignInPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });
  });

  describe('Error handling', () => {
    it('displays error when SignInButtons calls onError', async () => {
      render(<SignInPage />);

      const errorButton = screen.getByTestId('mock-sign-in-error');
      fireEvent.click(errorButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('allows dismissing error alerts', async () => {
      render(<SignInPage />);

      // Trigger an error
      const errorButton = screen.getByTestId('mock-sign-in-error');
      fireEvent.click(errorButton);

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
});

/**
 * Tests for the email/password sign-in fallback page.
 * This page is used for testing environments where social providers are unavailable.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter, useSearchParams } from 'next/navigation';
import EmailSignInPage from '../page';
import { useAuth } from '@/contexts/AuthContext';
import { acceptInvite, registerStudent, getStudentRegistrationInfo } from '@/lib/api/registration';
import { ApiError } from '@/lib/api-error';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

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

// Mock registration API
jest.mock('@/lib/api/registration', () => ({
  acceptInvite: jest.fn(),
  registerStudent: jest.fn(),
  getStudentRegistrationInfo: jest.fn(),
}));

const mockAcceptInvite = acceptInvite as jest.Mock;
const mockRegisterStudent = registerStudent as jest.Mock;
const mockGetStudentRegistrationInfo = getStudentRegistrationInfo as jest.Mock;

describe('EmailSignInPage', () => {
  const mockPush = jest.fn();
  const mockRefreshUser = jest.fn();

  const mockSetUserProfile = jest.fn();
  const mockBeginAuthFlow = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockRefreshUser.mockResolvedValue(undefined);
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    });
    (useAuth as jest.Mock).mockReturnValue({
      isAuthenticated: false,
      refreshUser: mockRefreshUser,
      setUserProfile: mockSetUserProfile,
      beginAuthFlow: mockBeginAuthFlow,
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
      expect(screen.queryByText(/sign up/i)).not.toBeInTheDocument();
    });
  });

  describe('Authentication flow', () => {
    it('redirects to home when already authenticated', async () => {
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: true,
        refreshUser: mockRefreshUser,
        setUserProfile: mockSetUserProfile,
        beginAuthFlow: mockBeginAuthFlow,
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
      (useAuth as jest.Mock).mockReturnValue({ isAuthenticated: true, refreshUser: mockRefreshUser, setUserProfile: mockSetUserProfile, beginAuthFlow: mockBeginAuthFlow });
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

  describe('Invite token flow', () => {
    beforeEach(() => {
      const params = new URLSearchParams('token=test-invite-token-123');
      (useSearchParams as jest.Mock).mockReturnValue(params);
    });

    it('calls acceptInvite with the invite token after successful sign-in', async () => {
      const user = userEvent.setup();
      mockSignInWithEmailAndPassword.mockResolvedValue({
        user: { uid: 'test-uid', email: 'test@example.com' },
      });
      mockAcceptInvite.mockResolvedValue({ role: 'instructor' });

      render(<EmailSignInPage />);

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockAcceptInvite).toHaveBeenCalledWith('test-invite-token-123');
      });
    });

    it('redirects to /instructor when invite accepted by instructor role', async () => {
      const user = userEvent.setup();
      mockSignInWithEmailAndPassword.mockResolvedValue({
        user: { uid: 'test-uid', email: 'test@example.com' },
      });
      mockAcceptInvite.mockResolvedValue({ role: 'instructor' });

      render(<EmailSignInPage />);

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/instructor');
      });
    });

    it('redirects to /namespace/invitations when invite accepted by namespace-admin role', async () => {
      const user = userEvent.setup();
      mockSignInWithEmailAndPassword.mockResolvedValue({
        user: { uid: 'test-uid', email: 'test@example.com' },
      });
      mockAcceptInvite.mockResolvedValue({ role: 'namespace-admin' });

      render(<EmailSignInPage />);

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/namespace/invitations');
      });
    });

    it('redirects to / when invite accepted by default role', async () => {
      const user = userEvent.setup();
      mockSignInWithEmailAndPassword.mockResolvedValue({
        user: { uid: 'test-uid', email: 'test@example.com' },
      });
      mockAcceptInvite.mockResolvedValue({ role: 'student' });

      render(<EmailSignInPage />);

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });

    it('shows error message when invite token is expired', async () => {
      const user = userEvent.setup();
      mockSignInWithEmailAndPassword.mockResolvedValue({
        user: { uid: 'test-uid', email: 'test@example.com' },
      });
      mockAcceptInvite.mockRejectedValue(
        new ApiError('Invitation expired', 410, 'INVITATION_EXPIRED')
      );

      render(<EmailSignInPage />);

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByText(/expired/i)).toBeInTheDocument();
      });
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('shows error message when invite token is already consumed', async () => {
      const user = userEvent.setup();
      mockSignInWithEmailAndPassword.mockResolvedValue({
        user: { uid: 'test-uid', email: 'test@example.com' },
      });
      mockAcceptInvite.mockRejectedValue(
        new ApiError('Invitation already consumed', 409, 'INVITATION_CONSUMED')
      );

      render(<EmailSignInPage />);

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByText(/already been used|consumed/i)).toBeInTheDocument();
      });
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('shows generic error message when acceptInvite fails with unknown error', async () => {
      const user = userEvent.setup();
      mockSignInWithEmailAndPassword.mockResolvedValue({
        user: { uid: 'test-uid', email: 'test@example.com' },
      });
      mockAcceptInvite.mockRejectedValue(new Error('Network error'));

      render(<EmailSignInPage />);

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByText(/failed|error/i)).toBeInTheDocument();
      });
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('calls setUserProfile with acceptInvite result to sync AuthContext cache before redirect', async () => {
      const user = userEvent.setup();
      mockSignInWithEmailAndPassword.mockResolvedValue({
        user: { uid: 'test-uid', email: 'test@example.com' },
      });
      const inviteResult = { role: 'instructor' };
      mockAcceptInvite.mockResolvedValue(inviteResult);

      render(<EmailSignInPage />);

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockSetUserProfile).toHaveBeenCalledWith(inviteResult);
      });
      // setUserProfile must be called before the redirect
      const setProfileOrder = mockSetUserProfile.mock.invocationCallOrder[0];
      const pushOrder = mockPush.mock.invocationCallOrder[0];
      expect(setProfileOrder).toBeLessThan(pushOrder);
    });

    it('does NOT call refreshUser after accepting invite (uses setUserProfile instead)', async () => {
      const user = userEvent.setup();
      mockSignInWithEmailAndPassword.mockResolvedValue({
        user: { uid: 'test-uid', email: 'test@example.com' },
      });
      mockAcceptInvite.mockResolvedValue({ role: 'instructor' });

      render(<EmailSignInPage />);

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/instructor');
      });
      expect(mockRefreshUser).not.toHaveBeenCalled();
    });

    it('does NOT redirect to / when isAuthenticated becomes true (suppresses auto-redirect)', () => {
      // When invite param is present, the isAuthenticated redirect should be suppressed
      // so that acceptInvite can run and redirect based on role instead.
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: true,
        refreshUser: mockRefreshUser,
        setUserProfile: mockSetUserProfile,
        beginAuthFlow: mockBeginAuthFlow,
      });

      render(<EmailSignInPage />);

      expect(mockPush).not.toHaveBeenCalledWith('/');
    });

    it('does not call acceptInvite without signing in first', () => {
      render(<EmailSignInPage />);

      // Simply rendering the page with invite param should not call acceptInvite
      expect(mockAcceptInvite).not.toHaveBeenCalled();
    });

    it('shows Firebase credential error even when invite token is present', async () => {
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
      expect(mockAcceptInvite).not.toHaveBeenCalled();
    });
  });

  describe('Join code flow', () => {
    const mockSectionId = 'section-abc-123';

    beforeEach(() => {
      const params = new URLSearchParams('code=TESTCODE');
      (useSearchParams as jest.Mock).mockReturnValue(params);

      mockGetStudentRegistrationInfo.mockResolvedValue({
        section: { id: mockSectionId, name: 'Test Section', active: true },
        class: { id: 'class-1', name: 'Test Class' },
      });
      mockRegisterStudent.mockResolvedValue({ role: 'student' });
    });

    it('calls registerStudent with the join code after successful sign-in', async () => {
      const user = userEvent.setup();
      mockSignInWithEmailAndPassword.mockResolvedValue({
        user: { uid: 'test-uid', email: 'student@example.com' },
      });

      render(<EmailSignInPage />);

      await user.type(screen.getByLabelText(/email address/i), 'student@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockRegisterStudent).toHaveBeenCalledWith('TESTCODE');
      });
    });

    it('calls getStudentRegistrationInfo to get section id before redirecting', async () => {
      const user = userEvent.setup();
      mockSignInWithEmailAndPassword.mockResolvedValue({
        user: { uid: 'test-uid', email: 'student@example.com' },
      });

      render(<EmailSignInPage />);

      await user.type(screen.getByLabelText(/email address/i), 'student@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockGetStudentRegistrationInfo).toHaveBeenCalledWith('TESTCODE');
      });
    });

    it('redirects to the section page after successful student registration', async () => {
      const user = userEvent.setup();
      mockSignInWithEmailAndPassword.mockResolvedValue({
        user: { uid: 'test-uid', email: 'student@example.com' },
      });

      render(<EmailSignInPage />);

      await user.type(screen.getByLabelText(/email address/i), 'student@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(`/sections/${mockSectionId}`);
      });
    });

    it('calls setUserProfile with registerStudent result to sync AuthContext cache before redirect', async () => {
      const user = userEvent.setup();
      mockSignInWithEmailAndPassword.mockResolvedValue({
        user: { uid: 'test-uid', email: 'student@example.com' },
      });
      const registerResult = { role: 'student' };
      mockRegisterStudent.mockResolvedValue(registerResult);

      render(<EmailSignInPage />);

      await user.type(screen.getByLabelText(/email address/i), 'student@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockSetUserProfile).toHaveBeenCalledWith(registerResult);
      });
      // setUserProfile must be called before the redirect
      const setProfileOrder = mockSetUserProfile.mock.invocationCallOrder[0];
      const pushOrder = mockPush.mock.invocationCallOrder[0];
      expect(setProfileOrder).toBeLessThan(pushOrder);
    });

    it('shows error message when join code is invalid', async () => {
      const user = userEvent.setup();
      mockSignInWithEmailAndPassword.mockResolvedValue({
        user: { uid: 'test-uid', email: 'student@example.com' },
      });
      mockGetStudentRegistrationInfo.mockRejectedValue(
        new ApiError('Invalid join code', 404, 'INVALID_CODE')
      );

      render(<EmailSignInPage />);

      await user.type(screen.getByLabelText(/email address/i), 'student@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByText(/invalid.*join code|join code.*invalid/i)).toBeInTheDocument();
      });
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('shows error message when section is inactive', async () => {
      const user = userEvent.setup();
      mockSignInWithEmailAndPassword.mockResolvedValue({
        user: { uid: 'test-uid', email: 'student@example.com' },
      });
      mockRegisterStudent.mockRejectedValue(
        new ApiError('Section is inactive', 400, 'SECTION_INACTIVE')
      );

      render(<EmailSignInPage />);

      await user.type(screen.getByLabelText(/email address/i), 'student@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByText(/section.*inactive|inactive.*section/i)).toBeInTheDocument();
      });
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('shows error message when section is at capacity', async () => {
      const user = userEvent.setup();
      mockSignInWithEmailAndPassword.mockResolvedValue({
        user: { uid: 'test-uid', email: 'student@example.com' },
      });
      mockRegisterStudent.mockRejectedValue(
        new ApiError('Section is at capacity', 409, 'NAMESPACE_AT_CAPACITY')
      );

      render(<EmailSignInPage />);

      await user.type(screen.getByLabelText(/email address/i), 'student@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByText(/capacity/i)).toBeInTheDocument();
      });
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('shows generic error message when registerStudent fails with unknown error', async () => {
      const user = userEvent.setup();
      mockSignInWithEmailAndPassword.mockResolvedValue({
        user: { uid: 'test-uid', email: 'student@example.com' },
      });
      mockRegisterStudent.mockRejectedValue(new Error('Network error'));

      render(<EmailSignInPage />);

      await user.type(screen.getByLabelText(/email address/i), 'student@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByText(/failed|error/i)).toBeInTheDocument();
      });
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('does NOT redirect to / when isAuthenticated becomes true (suppresses auto-redirect)', () => {
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: true,
        refreshUser: mockRefreshUser,
        setUserProfile: mockSetUserProfile,
        beginAuthFlow: mockBeginAuthFlow,
      });

      render(<EmailSignInPage />);

      expect(mockPush).not.toHaveBeenCalledWith('/');
    });

    it('does not call registerStudent without signing in first', () => {
      render(<EmailSignInPage />);

      expect(mockRegisterStudent).not.toHaveBeenCalled();
    });

    it('shows info banner when ?code= is in URL', () => {
      render(<EmailSignInPage />);

      // Should display some informational text indicating join code flow is active
      expect(
        screen.getByText(/joining.*section|section.*join|join code/i)
      ).toBeInTheDocument();
    });

    it('does not call acceptInvite when join code is present', async () => {
      const user = userEvent.setup();
      mockSignInWithEmailAndPassword.mockResolvedValue({
        user: { uid: 'test-uid', email: 'student@example.com' },
      });

      render(<EmailSignInPage />);

      await user.type(screen.getByLabelText(/email address/i), 'student@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockRegisterStudent).toHaveBeenCalled();
      });
      expect(mockAcceptInvite).not.toHaveBeenCalled();
    });

    it('calls beginAuthFlow before signing in to gate onAuthStateChanged', async () => {
      const user = userEvent.setup();
      mockSignInWithEmailAndPassword.mockResolvedValue({
        user: { uid: 'test-uid', email: 'student@example.com' },
      });

      render(<EmailSignInPage />);

      await user.type(screen.getByLabelText(/email address/i), 'student@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockBeginAuthFlow).toHaveBeenCalled();
      });
    });
  });

  describe('Join code manual input (no URL param)', () => {
    beforeEach(() => {
      // No code param in URL
      (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams());
    });

    it('renders a join code input field when no ?code= param is present', () => {
      render(<EmailSignInPage />);

      expect(screen.getByLabelText(/join code/i)).toBeInTheDocument();
    });

    it('normalizes join code input (strips dashes, uppercases)', async () => {
      const user = userEvent.setup();
      mockSignInWithEmailAndPassword.mockResolvedValue({
        user: { uid: 'test-uid', email: 'student@example.com' },
      });
      mockGetStudentRegistrationInfo.mockResolvedValue({
        section: { id: 'section-456', name: 'Test Section', active: true },
        class: { id: 'class-1', name: 'Test Class' },
      });
      mockRegisterStudent.mockResolvedValue({ role: 'student' });

      render(<EmailSignInPage />);

      await user.type(screen.getByLabelText(/join code/i), 'TEST-CODE');
      await user.type(screen.getByLabelText(/email address/i), 'student@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockRegisterStudent).toHaveBeenCalledWith('TESTCODE');
      });
    });

    it('does not call registerStudent when join code input is empty', async () => {
      const user = userEvent.setup();
      mockSignInWithEmailAndPassword.mockResolvedValue({
        user: { uid: 'test-uid', email: 'student@example.com' },
      });

      render(<EmailSignInPage />);

      // Don't fill in join code
      await user.type(screen.getByLabelText(/email address/i), 'student@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      // Should perform plain sign-in, not student registration
      await waitFor(() => {
        expect(mockSignInWithEmailAndPassword).toHaveBeenCalled();
      });
      expect(mockRegisterStudent).not.toHaveBeenCalled();
    });
  });
});

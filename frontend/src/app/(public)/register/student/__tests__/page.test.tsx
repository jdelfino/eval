/**
 * Tests for Student Registration Page
 *
 * After the social auth migration:
 * - Step 1: enter join code → validate
 * - Step 2: if already signed in, call registerStudent directly
 *           if not signed in, show SignInButtons
 * - On sign-in success: call registerStudent → redirect
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StudentRegistrationPage from '../page';
import { ApiError } from '@/lib/api-error';

// Mock next/navigation
const mockPush = jest.fn();
const mockSearchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => mockSearchParams,
}));

// Mock AuthContext
const mockRefreshUser = jest.fn();
const mockSetUserProfile = jest.fn();
const mockBeginAuthFlow = jest.fn();
const mockEndAuthFlow = jest.fn();
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    refreshUser: mockRefreshUser,
    setUserProfile: mockSetUserProfile,
    beginAuthFlow: mockBeginAuthFlow,
    endAuthFlow: mockEndAuthFlow,
  }),
}));

// Mock SignInButtons so tests don't depend on Firebase popup flow
const mockSignInButtonsOnSuccess = jest.fn();
const mockSignInButtonsOnBeforeSignIn = jest.fn();
jest.mock('@/components/ui/SignInButtons', () => ({
  SignInButtons: ({ onSuccess, onError, onBeforeSignIn, label }: any) => {
    // Store callbacks for test control
    mockSignInButtonsOnSuccess.mockImplementation(onSuccess);
    if (onBeforeSignIn) {
      mockSignInButtonsOnBeforeSignIn.mockImplementation(onBeforeSignIn);
    }
    return (
      <div data-testid="sign-in-buttons">
        {label && <p data-testid="sign-in-label">{label}</p>}
        <button onClick={onSuccess} data-testid="mock-sign-in-success">
          Mock Sign In
        </button>
        <button
          onClick={() => onError(new Error('Sign in failed'))}
          data-testid="mock-sign-in-error"
        >
          Mock Sign In Error
        </button>
      </div>
    );
  },
}));

// Track current user for "already signed in" tests
let mockCurrentUser: { delete: jest.Mock; uid: string; email: string } | null = null;
const mockDeleteUser = jest.fn();

// Track onAuthStateChanged subscriber so tests can trigger it
let authStateCallback: ((user: typeof mockCurrentUser) => void) | null = null;

jest.mock('@/lib/firebase', () => ({
  firebaseAuth: {
    get currentUser() {
      return mockCurrentUser;
    },
  },
}));

// Mock firebase/auth to capture onAuthStateChanged subscription
const mockOnAuthStateChangedUnsubscribe = jest.fn();
jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn((auth: unknown, callback: (user: typeof mockCurrentUser) => void) => {
    authStateCallback = callback;
    return mockOnAuthStateChangedUnsubscribe;
  }),
}));

// Mock typed registration API client functions
const mockGetStudentRegistrationInfo = jest.fn();
const mockRegisterStudent = jest.fn();
jest.mock('@/lib/api/registration', () => ({
  getStudentRegistrationInfo: (...args: unknown[]) => mockGetStudentRegistrationInfo(...args),
  registerStudent: (...args: unknown[]) => mockRegisterStudent(...args),
}));

describe('StudentRegistrationPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
    mockRefreshUser.mockClear();
    mockRefreshUser.mockResolvedValue(undefined);
    mockSetUserProfile.mockClear();
    mockBeginAuthFlow.mockClear();
    mockEndAuthFlow.mockClear();
    mockSearchParams.delete('code');
    mockDeleteUser.mockClear();
    mockGetStudentRegistrationInfo.mockClear();
    mockRegisterStudent.mockClear();
    mockCurrentUser = null;
    mockDeleteUser.mockResolvedValue(undefined);
    authStateCallback = null;
    mockOnAuthStateChangedUnsubscribe.mockClear();
  });

  describe('Initial State', () => {
    it('renders code entry form initially', () => {
      render(<StudentRegistrationPage />);

      expect(screen.getByText('Join Your Section')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('ABC-123')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Continue to Register' })).toBeInTheDocument();
    });

    it('pre-fills code from URL param', () => {
      mockSearchParams.set('code', 'TESTCODE123');

      render(<StudentRegistrationPage />);

      const input = screen.getByPlaceholderText('ABC-123');
      expect(input).toHaveValue('TES-TCO');
    });
  });

  describe('Join Code Formatting', () => {
    it('auto-formats code with dashes', async () => {
      const user = userEvent.setup();
      render(<StudentRegistrationPage />);

      const input = screen.getByPlaceholderText('ABC-123');
      await user.type(input, 'abc123xyz');

      expect(input).toHaveValue('ABC-123');
    });

    it('auto-uppercases code', async () => {
      const user = userEvent.setup();
      render(<StudentRegistrationPage />);

      const input = screen.getByPlaceholderText('ABC-123');
      await user.type(input, 'abc');

      expect(input).toHaveValue('ABC');
    });

    it('removes non-alphanumeric characters', async () => {
      const user = userEvent.setup();
      render(<StudentRegistrationPage />);

      const input = screen.getByPlaceholderText('ABC-123');
      await user.type(input, 'abc-!@#-123');

      expect(input).toHaveValue('ABC-123');
    });
  });

  describe('Code Validation', () => {
    it('validates code format before API call', async () => {
      const user = userEvent.setup();
      render(<StudentRegistrationPage />);

      const input = screen.getByPlaceholderText('ABC-123');
      await user.type(input, 'ABC');

      const button = screen.getByRole('button', { name: 'Continue to Register' });
      await user.click(button);

      expect(screen.getByText('Please enter a valid join code (e.g., ABC-123)')).toBeInTheDocument();
      expect(mockGetStudentRegistrationInfo).not.toHaveBeenCalled();
    });

    it('shows loading state during validation', async () => {
      const user = userEvent.setup();
      mockGetStudentRegistrationInfo.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<StudentRegistrationPage />);

      const input = screen.getByPlaceholderText('ABC-123');
      await user.type(input, 'ABC123');

      const button = screen.getByRole('button', { name: 'Continue to Register' });
      await user.click(button);

      expect(screen.getByText('Checking code...')).toBeInTheDocument();
    });

    it('shows error for invalid code', async () => {
      const user = userEvent.setup();
      mockGetStudentRegistrationInfo.mockRejectedValue(new ApiError('Invalid code', 400, 'INVALID_CODE'));

      render(<StudentRegistrationPage />);

      const input = screen.getByPlaceholderText('ABC-123');
      await user.type(input, 'ABC123');

      const button = screen.getByRole('button', { name: 'Continue to Register' });
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText("This join code doesn't exist. Check with your instructor.")).toBeInTheDocument();
      });
    });

    it('shows error for inactive section', async () => {
      const user = userEvent.setup();
      mockGetStudentRegistrationInfo.mockRejectedValue(new ApiError('Section inactive', 400, 'SECTION_INACTIVE'));

      render(<StudentRegistrationPage />);

      const input = screen.getByPlaceholderText('ABC-123');
      await user.type(input, 'ABC123');

      const button = screen.getByRole('button', { name: 'Continue to Register' });
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText('This section is no longer accepting new students.')).toBeInTheDocument();
      });
    });

    it('shows section preview after valid code', async () => {
      const user = userEvent.setup();
      mockGetStudentRegistrationInfo.mockResolvedValue({
        section: { id: 'sec-1', name: 'Monday 2pm' },
        class: { id: 'cls-1', name: 'CS 101 - Intro to Python' },
      });

      render(<StudentRegistrationPage />);

      const input = screen.getByPlaceholderText('ABC-123');
      await user.type(input, 'ABC123');

      const button = screen.getByRole('button', { name: 'Continue to Register' });
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText('CS 101 - Intro to Python')).toBeInTheDocument();
        expect(screen.getByText('Section: Monday 2pm')).toBeInTheDocument();
      });
    });
  });

  describe('Step 2: Not Already Signed In', () => {
    const validateCode = async () => {
      const user = userEvent.setup();
      mockGetStudentRegistrationInfo.mockResolvedValue({
        section: { id: 'sec-1', name: 'Test Section' },
        class: { id: 'cls-1', name: 'CS 101' },
      });

      render(<StudentRegistrationPage />);

      const codeInput = screen.getByPlaceholderText('ABC-123');
      await user.type(codeInput, 'ABC123');
      await user.click(screen.getByRole('button', { name: 'Continue to Register' }));

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      return user;
    };

    it('renders SignInButtons when not signed in after code validation', async () => {
      mockCurrentUser = null;
      await validateCode();

      expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
    });

    it('does NOT render email or password input fields', async () => {
      mockCurrentUser = null;
      await validateCode();

      expect(screen.queryByLabelText(/email address/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
    });

    it('shows class name in sign-in label', async () => {
      mockCurrentUser = null;
      await validateCode();

      expect(screen.getByTestId('sign-in-label')).toHaveTextContent(/CS 101/);
    });

    it('calls registerStudent after SignInButtons onSuccess', async () => {
      mockCurrentUser = null;
      mockRegisterStudent.mockResolvedValue({ id: 'user-1', role: 'student' });

      await validateCode();

      const signInButton = screen.getByTestId('mock-sign-in-success');
      fireEvent.click(signInButton);

      await waitFor(() => {
        expect(mockRegisterStudent).toHaveBeenCalledWith('ABC-123');
      });
    });

    it('redirects to section page after successful sign-in and registration', async () => {
      mockCurrentUser = null;
      mockRegisterStudent.mockResolvedValue({ id: 'user-1', role: 'student' });

      await validateCode();

      const signInButton = screen.getByTestId('mock-sign-in-success');
      fireEvent.click(signInButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/sections/sec-1');
      });
    });

    it('shows error when registerStudent fails after sign-in', async () => {
      mockCurrentUser = null;
      mockRegisterStudent.mockRejectedValue(new ApiError('At capacity', 400, 'NAMESPACE_AT_CAPACITY'));

      await validateCode();

      const signInButton = screen.getByTestId('mock-sign-in-success');
      fireEvent.click(signInButton);

      await waitFor(() => {
        expect(screen.getByText('This class has reached its student limit. Contact your instructor.')).toBeInTheDocument();
      });
    });

    it('shows error when SignInButtons calls onError', async () => {
      mockCurrentUser = null;
      await validateCode();

      const errorButton = screen.getByTestId('mock-sign-in-error');
      fireEvent.click(errorButton);

      await waitFor(() => {
        expect(screen.getByText('Sign in failed')).toBeInTheDocument();
      });
    });

    it('deletes Firebase account on backend failure after sign-in', async () => {
      mockCurrentUser = null;
      // After sign-in via SignInButtons, currentUser is set
      mockRegisterStudent.mockImplementation(() => {
        mockCurrentUser = { delete: mockDeleteUser, uid: 'uid-1', email: 'test@example.com' };
        return Promise.reject(new ApiError('Internal error', 500));
      });

      await validateCode();

      const signInButton = screen.getByTestId('mock-sign-in-success');
      // Simulate sign-in sets currentUser before registerStudent is called
      mockCurrentUser = { delete: mockDeleteUser, uid: 'uid-1', email: 'test@example.com' };
      mockRegisterStudent.mockRejectedValue(new ApiError('Internal error', 500));

      fireEvent.click(signInButton);

      await waitFor(() => {
        expect(mockDeleteUser).toHaveBeenCalled();
      });
    });

    it('still shows error message when delete() throws during error recovery', async () => {
      mockCurrentUser = null;
      mockDeleteUser.mockRejectedValue(new Error('auth/requires-recent-login'));
      // Use a non-ApiError so error path sets 'Registration failed' message
      mockRegisterStudent.mockRejectedValue(new Error('network failure'));

      await validateCode();

      // Simulate sign-in sets currentUser before registerStudent is called
      mockCurrentUser = { delete: mockDeleteUser, uid: 'uid-1', email: 'test@example.com' };

      const signInButton = screen.getByTestId('mock-sign-in-success');
      fireEvent.click(signInButton);

      // Error recovery flow must still run even though delete() threw
      await waitFor(() => {
        expect(screen.getByText('Registration failed')).toBeInTheDocument();
      });
    });

    it('logs error when delete() throws during error recovery', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockCurrentUser = null;
      const deleteError = new Error('auth/requires-recent-login');
      mockDeleteUser.mockRejectedValue(deleteError);
      mockRegisterStudent.mockRejectedValue(new ApiError('Internal error', 500, 'INTERNAL'));

      await validateCode();

      mockCurrentUser = { delete: mockDeleteUser, uid: 'uid-1', email: 'test@example.com' };

      const signInButton = screen.getByTestId('mock-sign-in-success');
      fireEvent.click(signInButton);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('delete'),
          deleteError
        );
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Step 2: Already Signed In', () => {
    const signedInUser = { delete: mockDeleteUser, uid: 'existing-uid', email: 'student@example.com' };

    const validateCodeAsSignedIn = async () => {
      mockCurrentUser = signedInUser;
      const user = userEvent.setup();
      mockGetStudentRegistrationInfo.mockResolvedValue({
        section: { id: 'sec-1', name: 'Test Section' },
        class: { id: 'cls-1', name: 'CS 101' },
      });

      render(<StudentRegistrationPage />);

      const codeInput = screen.getByPlaceholderText('ABC-123');
      await user.type(codeInput, 'ABC123');
      await user.click(screen.getByRole('button', { name: 'Continue to Register' }));

      return user;
    };

    it('skips sign-in step when already signed in and shows section preview', async () => {
      mockRegisterStudent.mockResolvedValue({ id: 'user-1', role: 'student' });

      await validateCodeAsSignedIn();

      // Should NOT show SignInButtons since already signed in
      await waitFor(() => {
        expect(screen.queryByTestId('sign-in-buttons')).not.toBeInTheDocument();
      });
    });

    it('calls registerStudent directly when already signed in', async () => {
      mockRegisterStudent.mockResolvedValue({ id: 'user-1', role: 'student' });

      await validateCodeAsSignedIn();

      await waitFor(() => {
        expect(mockRegisterStudent).toHaveBeenCalledWith('ABC-123');
      });
    });

    it('redirects to section page when already signed in', async () => {
      mockRegisterStudent.mockResolvedValue({ id: 'user-1', role: 'student' });

      await validateCodeAsSignedIn();

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/sections/sec-1');
      });
    });

    it('shows error if registerStudent fails when already signed in', async () => {
      mockRegisterStudent.mockRejectedValue(new ApiError('At capacity', 400, 'NAMESPACE_AT_CAPACITY'));

      await validateCodeAsSignedIn();

      await waitFor(() => {
        expect(screen.getByText('This class has reached its student limit. Contact your instructor.')).toBeInTheDocument();
      });
    });
  });

  describe('Back Button', () => {
    it('returns to code entry on back button', async () => {
      const user = userEvent.setup();

      mockGetStudentRegistrationInfo.mockResolvedValueOnce({
        section: { id: 'sec-1', name: 'Test Section' },
        class: { id: 'cls-1', name: 'Test Class' },
      });

      render(<StudentRegistrationPage />);

      const codeInput = screen.getByPlaceholderText('ABC-123');
      await user.type(codeInput, 'ABC123');
      await user.click(screen.getByRole('button', { name: 'Continue to Register' }));

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Back' }));

      expect(screen.getByText('Join Your Section')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('ABC-123')).toBeInTheDocument();
    });
  });

  describe('Sign In Link', () => {
    it('shows sign in link on the page', () => {
      render(<StudentRegistrationPage />);

      expect(screen.getByRole('link', { name: 'Sign in here' })).toHaveAttribute('href', '/auth/signin');
    });

    it('shows prominent sign-in box on code entry step', () => {
      render(<StudentRegistrationPage />);

      expect(screen.getByText("If you've registered before, sign in to access your sections.")).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Sign in to your account/i })).toHaveAttribute('href', '/auth/signin');
    });
  });

  describe('Auth Hydration Race (PLAT-my3o)', () => {
    // Scenario: user signed in before navigating to the page, but Firebase Auth
    // hasn't hydrated from IndexedDB yet when the button is clicked.
    // firebaseAuth.currentUser is null at validation time, so the page shows
    // sign-in buttons. Then auth hydrates (onAuthStateChanged fires) and the
    // page should auto-register without requiring a manual re-click.

    const setupCodeValidWithNoCurrentUser = async () => {
      mockCurrentUser = null;
      const user = userEvent.setup();
      mockGetStudentRegistrationInfo.mockResolvedValue({
        section: { id: 'sec-42', name: 'Fall Section' },
        class: { id: 'cls-1', name: 'CS 101' },
      });

      render(<StudentRegistrationPage />);

      const codeInput = screen.getByPlaceholderText('ABC-123');
      await user.type(codeInput, 'ABC123');
      await user.click(screen.getByRole('button', { name: 'Continue to Register' }));

      // Page is in code-valid state, showing sign-in buttons (auth not hydrated yet)
      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      return user;
    };

    it('auto-registers when onAuthStateChanged fires with a user while in code-valid state', async () => {
      const registeredUser = { id: 'user-1', role: 'student' };
      mockRegisterStudent.mockResolvedValue(registeredUser);

      await setupCodeValidWithNoCurrentUser();

      // Simulate Firebase Auth hydrating: set currentUser and fire the subscriber
      const hydratedUser = { delete: mockDeleteUser, uid: 'uid-1', email: 'student@test.com' };
      mockCurrentUser = hydratedUser;
      expect(authStateCallback).not.toBeNull();
      authStateCallback!(hydratedUser);

      await waitFor(() => {
        expect(mockRegisterStudent).toHaveBeenCalledWith('ABC-123');
      });
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/sections/sec-42');
      });
    });

    it('does not auto-register when onAuthStateChanged fires with null (sign-out)', async () => {
      mockRegisterStudent.mockResolvedValue({ id: 'user-1', role: 'student' });

      await setupCodeValidWithNoCurrentUser();

      // Auth fires with null (signed out) — should NOT trigger registration
      expect(authStateCallback).not.toBeNull();
      authStateCallback!(null);

      // Give it time to possibly (incorrectly) call register
      await new Promise((r) => setTimeout(r, 50));

      expect(mockRegisterStudent).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('does not double-register if auth fires while already submitting', async () => {
      // Simulate code-valid with currentUser already set (normal fast path)
      const existingUser = { delete: mockDeleteUser, uid: 'uid-existing', email: 'student@test.com' };
      mockCurrentUser = existingUser;
      mockRegisterStudent.mockResolvedValue({ id: 'user-1', role: 'student' });

      const user = userEvent.setup();
      mockGetStudentRegistrationInfo.mockResolvedValue({
        section: { id: 'sec-42', name: 'Fall Section' },
        class: { id: 'cls-1', name: 'CS 101' },
      });

      render(<StudentRegistrationPage />);

      const codeInput = screen.getByPlaceholderText('ABC-123');
      await user.type(codeInput, 'ABC123');
      await user.click(screen.getByRole('button', { name: 'Continue to Register' }));

      // Already-signed-in path: registers directly, never shows sign-in buttons
      await waitFor(() => {
        expect(mockRegisterStudent).toHaveBeenCalledTimes(1);
      });

      // Now auth state fires again — should NOT trigger a second registration
      if (authStateCallback) {
        authStateCallback!(existingUser);
        await new Promise((r) => setTimeout(r, 50));
      }

      expect(mockRegisterStudent).toHaveBeenCalledTimes(1);
    });

    it('unsubscribes from onAuthStateChanged on unmount', async () => {
      const { unmount } = render(<StudentRegistrationPage />);
      unmount();
      expect(mockOnAuthStateChangedUnsubscribe).toHaveBeenCalled();
    });
  });

  describe('Auth Flow Gating (PLAT-6nzj)', () => {
    const validateCodeHelper = async () => {
      const user = userEvent.setup();
      mockGetStudentRegistrationInfo.mockResolvedValue({
        section: { id: 'sec-1', name: 'Test Section' },
        class: { id: 'cls-1', name: 'CS 101' },
      });
      render(<StudentRegistrationPage />);
      const codeInput = screen.getByPlaceholderText('ABC-123');
      await user.type(codeInput, 'ABC123');
      await user.click(screen.getByRole('button', { name: 'Continue to Register' }));
      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });
      return user;
    };

    it('passes onBeforeSignIn prop to SignInButtons that calls beginAuthFlow', async () => {
      mockCurrentUser = null;
      mockRegisterStudent.mockResolvedValue({ id: 'user-1', role: 'student' });

      await validateCodeHelper();

      // onBeforeSignIn should have been registered
      expect(mockSignInButtonsOnBeforeSignIn).toBeDefined();
      // Invoke it to check it calls beginAuthFlow
      mockSignInButtonsOnBeforeSignIn();
      expect(mockBeginAuthFlow).toHaveBeenCalledTimes(1);
    });

    it('calls endAuthFlow when doRegister encounters a backend error (new sign-in)', async () => {
      mockCurrentUser = null;
      mockRegisterStudent.mockRejectedValue(new Error('unexpected error'));

      await validateCodeHelper();

      mockCurrentUser = { delete: mockDeleteUser, uid: 'uid-1', email: 'test@example.com' };
      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(mockEndAuthFlow).toHaveBeenCalled();
      });
    });

    it('calls endAuthFlow when doRegister encounters NAMESPACE_AT_CAPACITY error', async () => {
      mockCurrentUser = null;
      mockRegisterStudent.mockRejectedValue(new Error('API error: NAMESPACE_AT_CAPACITY'));

      await validateCodeHelper();

      mockCurrentUser = { delete: mockDeleteUser, uid: 'uid-1', email: 'test@example.com' };
      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(mockEndAuthFlow).toHaveBeenCalled();
      });
    });

    it('calls endAuthFlow when handleSignInError fires (popup cancelled or blocked)', async () => {
      mockCurrentUser = null;

      await validateCodeHelper();

      fireEvent.click(screen.getByTestId('mock-sign-in-error'));

      await waitFor(() => {
        expect(mockEndAuthFlow).toHaveBeenCalled();
      });
    });

    it('calls endAuthFlow before restoring UI state in handleSignInError', async () => {
      mockCurrentUser = null;
      const callOrder: string[] = [];
      mockEndAuthFlow.mockImplementation(() => { callOrder.push('endAuthFlow'); });

      await validateCodeHelper();

      fireEvent.click(screen.getByTestId('mock-sign-in-error'));

      await waitFor(() => {
        expect(mockEndAuthFlow).toHaveBeenCalled();
      });
      // endAuthFlow should have been called
      expect(callOrder).toContain('endAuthFlow');
    });
  });

  describe('Auto-login Flow', () => {
    it('calls setUserProfile with the returned user and redirects to section detail on successful registration', async () => {
      mockCurrentUser = null;
      const registeredUser = { id: 'user-1', role: 'student' };
      mockRegisterStudent.mockResolvedValue(registeredUser);

      const user = userEvent.setup();
      mockGetStudentRegistrationInfo.mockResolvedValue({
        section: { id: 'sec-1', name: 'Test Section' },
        class: { id: 'cls-1', name: 'Test Class' },
      });

      render(<StudentRegistrationPage />);

      const codeInput = screen.getByPlaceholderText('ABC-123');
      await user.type(codeInput, 'ABC123');
      await user.click(screen.getByRole('button', { name: 'Continue to Register' }));

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(mockSetUserProfile).toHaveBeenCalledWith(registeredUser);
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/sections/sec-1');
      });
    });

    it('does not call refreshUser after successful registration', async () => {
      mockCurrentUser = null;
      mockRegisterStudent.mockResolvedValue({ id: 'user-1', role: 'student' });

      const user = userEvent.setup();
      mockGetStudentRegistrationInfo.mockResolvedValue({
        section: { id: 'sec-1', name: 'Test Section' },
        class: { id: 'cls-1', name: 'Test Class' },
      });

      render(<StudentRegistrationPage />);

      const codeInput = screen.getByPlaceholderText('ABC-123');
      await user.type(codeInput, 'ABC123');
      await user.click(screen.getByRole('button', { name: 'Continue to Register' }));

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/sections/sec-1');
      });

      expect(mockRefreshUser).not.toHaveBeenCalled();
    });
  });

});

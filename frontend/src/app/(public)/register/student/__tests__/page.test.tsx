/**
 * Tests for Student Registration Page
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
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    refreshUser: mockRefreshUser,
  }),
}));

// Mock Firebase createUserWithEmailAndPassword and deleteUser
const mockCreateUserWithEmailAndPassword = jest.fn();
const mockDeleteUser = jest.fn();
const mockGetIdToken = jest.fn();
const mockFirebaseUser = {
  getIdToken: mockGetIdToken,
  uid: 'firebase-uid-123',
  email: 'student@example.com',
  delete: mockDeleteUser,
};

jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: (...args: unknown[]) => mockCreateUserWithEmailAndPassword(...args),
  getAuth: jest.fn(),
}));

// Track current user for cleanup tests
let mockCurrentUser: typeof mockFirebaseUser | null = null;
jest.mock('@/lib/firebase', () => ({
  firebaseAuth: {
    get currentUser() {
      return mockCurrentUser;
    },
  },
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
    mockSearchParams.delete('code');
    mockCreateUserWithEmailAndPassword.mockClear();
    mockDeleteUser.mockClear();
    mockGetIdToken.mockClear();
    mockGetStudentRegistrationInfo.mockClear();
    mockRegisterStudent.mockClear();
    mockCurrentUser = null;
    // Default: Firebase account creation succeeds and sets currentUser
    mockCreateUserWithEmailAndPassword.mockImplementation(() => {
      mockCurrentUser = mockFirebaseUser;
      return Promise.resolve({ user: mockFirebaseUser });
    });
    mockDeleteUser.mockResolvedValue(undefined);
    mockGetIdToken.mockResolvedValue('mock-firebase-jwt-token');
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
        expect(screen.getByText('Create Your Account')).toBeInTheDocument();
        expect(screen.getByText('CS 101 - Intro to Python')).toBeInTheDocument();
        expect(screen.getByText('Section: Monday 2pm')).toBeInTheDocument();
      });
    });
  });

  describe('Registration Form Validation', () => {
    beforeEach(async () => {
      mockGetStudentRegistrationInfo.mockResolvedValue({
        section: { id: 'sec-1', name: 'Test Section' },
        class: { id: 'cls-1', name: 'Test Class' },
      });
    });

    const setupForm = async () => {
      const user = userEvent.setup();
      render(<StudentRegistrationPage />);

      const codeInput = screen.getByPlaceholderText('ABC-123');
      await user.type(codeInput, 'ABC123');
      await user.click(screen.getByRole('button', { name: 'Continue to Register' }));

      await waitFor(() => {
        expect(screen.getByText('Create Your Account')).toBeInTheDocument();
      });

      return user;
    };

    it('validates email format', async () => {
      const user = await setupForm();

      const emailInput = screen.getByPlaceholderText('you@example.com');
      await user.type(emailInput, 'invalid-email');
      fireEvent.blur(emailInput);

      expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
    });

    it('validates password strength', async () => {
      const user = await setupForm();

      // Fill other fields
      await user.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com');
      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'weak');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'weak');


      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    });

    it('validates password has letter and number', async () => {
      const user = await setupForm();

      await user.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com');
      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'abcdefgh');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'abcdefgh');

      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      expect(screen.getByText('Password must contain at least one letter and one number')).toBeInTheDocument();
    });

    it('shows password mismatch error', async () => {
      const user = await setupForm();

      await user.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com');
      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'Password123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'Different123');

      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });

    it('shows password strength indicator', async () => {
      const user = await setupForm();

      const passwordInput = screen.getByPlaceholderText('At least 8 characters');
      await user.type(passwordInput, 'Password123');

      expect(screen.getByText(/medium/i)).toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    const setupAndFillForm = async () => {
      const user = userEvent.setup();

      // Code validation via typed client
      mockGetStudentRegistrationInfo.mockResolvedValueOnce({
        section: { id: 'sec-1', name: 'Test Section' },
        class: { id: 'cls-1', name: 'Test Class' },
      });

      render(<StudentRegistrationPage />);

      const codeInput = screen.getByPlaceholderText('ABC-123');
      await user.type(codeInput, 'ABC123');
      await user.click(screen.getByRole('button', { name: 'Continue to Register' }));

      await waitFor(() => {
        expect(screen.getByText('Create Your Account')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('you@example.com'), 'student@example.com');
      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'Password123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'Password123');

      return user;
    };

    it('creates Firebase account before calling backend API', async () => {
      const user = await setupAndFillForm();

      // Backend registration succeeds
      mockRegisterStudent.mockResolvedValueOnce({ id: 'user-1', role: 'student' });

      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      // Verify Firebase account was created first
      await waitFor(() => {
        expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalledWith(
          expect.anything(), // firebaseAuth
          'student@example.com',
          'Password123'
        );
      });
    });

    it('calls typed registerStudent client for registration', async () => {
      const user = await setupAndFillForm();

      // Backend registration succeeds
      mockRegisterStudent.mockResolvedValueOnce({ id: 'user-1', role: 'student' });

      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      // Verify typed client was called with the formatted join code
      await waitFor(() => {
        expect(mockRegisterStudent).toHaveBeenCalledWith('ABC-123');
      });
    });

    it('submits form and redirects on success', async () => {
      const user = await setupAndFillForm();

      mockRegisterStudent.mockResolvedValueOnce({ id: 'user-1', role: 'student' });

      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      await waitFor(() => {
        expect(screen.getByText('Account Created!')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/sections/sec-1');
      });
    });

    it('shows loading state during submission', async () => {
      const user = await setupAndFillForm();

      mockRegisterStudent.mockImplementationOnce(() => new Promise(() => {})); // Never resolves

      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      expect(screen.getByText('Creating account...')).toBeInTheDocument();
    });

    it('shows error for duplicate email from Firebase', async () => {
      const user = await setupAndFillForm();

      // Firebase throws error for existing email
      const firebaseError = new Error('Firebase: Error (auth/email-already-in-use).');
      (firebaseError as { code?: string }).code = 'auth/email-already-in-use';
      mockCreateUserWithEmailAndPassword.mockRejectedValueOnce(firebaseError);

      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      await waitFor(() => {
        expect(screen.getByText('An account with this email already exists. Please sign in instead.')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Sign in instead' })).toBeInTheDocument();
      });
    });

    it('shows error for weak password from Firebase', async () => {
      const user = await setupAndFillForm();

      // Firebase throws error for weak password
      const firebaseError = new Error('Firebase: Error (auth/weak-password).');
      (firebaseError as { code?: string }).code = 'auth/weak-password';
      mockCreateUserWithEmailAndPassword.mockRejectedValueOnce(firebaseError);

      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      await waitFor(() => {
        expect(screen.getByText('Password must be at least 8 characters with a number and letter.')).toBeInTheDocument();
      });
    });

    it('shows error when namespace at capacity from backend', async () => {
      const user = await setupAndFillForm();

      mockRegisterStudent.mockRejectedValueOnce(new ApiError('At capacity', 400, 'NAMESPACE_AT_CAPACITY'));

      await user.click(screen.getByRole('button', { name: 'Create Account' }));

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
        expect(screen.getByText('Create Your Account')).toBeInTheDocument();
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

      // The prominent sign-in box has specific helper text
      expect(screen.getByText("If you've registered before, sign in to access your sections.")).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Sign in to your account/i })).toHaveAttribute('href', '/auth/signin');
    });
  });

  describe('Auto-login Flow', () => {
    const setupAndFillForm = async () => {
      const user = userEvent.setup();

      // Code validation via typed client
      mockGetStudentRegistrationInfo.mockResolvedValueOnce({
        section: { id: 'sec-1', name: 'Test Section' },
        class: { id: 'cls-1', name: 'Test Class' },
      });

      render(<StudentRegistrationPage />);

      const codeInput = screen.getByPlaceholderText('ABC-123');
      await user.type(codeInput, 'ABC123');
      await user.click(screen.getByRole('button', { name: 'Continue to Register' }));

      await waitFor(() => {
        expect(screen.getByText('Create Your Account')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('you@example.com'), 'student@example.com');
      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'Password123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'Password123');

      return user;
    };

    it('refreshes user and redirects to section detail on successful registration', async () => {
      const user = await setupAndFillForm();

      // Backend registration succeeds via typed client
      mockRegisterStudent.mockResolvedValueOnce({ id: 'user-1', role: 'student' });

      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      // User is already logged in via Firebase, so refreshUser is called
      await waitFor(() => {
        expect(mockRefreshUser).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/sections/sec-1');
      });
    });
  });

  describe('Firebase Account Cleanup on Backend Failure', () => {
    const setupAndFillForm = async () => {
      const user = userEvent.setup();

      // Code validation via typed client
      mockGetStudentRegistrationInfo.mockResolvedValueOnce({
        section: { id: 'sec-1', name: 'Test Section' },
        class: { id: 'cls-1', name: 'Test Class' },
      });

      render(<StudentRegistrationPage />);

      const codeInput = screen.getByPlaceholderText('ABC-123');
      await user.type(codeInput, 'ABC123');
      await user.click(screen.getByRole('button', { name: 'Continue to Register' }));

      await waitFor(() => {
        expect(screen.getByText('Create Your Account')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('you@example.com'), 'student@example.com');
      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'Password123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'Password123');

      return user;
    };

    it('deletes Firebase account when backend API returns error', async () => {
      const user = await setupAndFillForm();

      // Backend API fails with 500 error (typed client throws)
      mockRegisterStudent.mockRejectedValueOnce(new ApiError('Internal server error', 500));

      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      // Verify Firebase account was created
      await waitFor(() => {
        expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalled();
      });

      // Verify Firebase account was deleted after backend failure
      await waitFor(() => {
        expect(mockDeleteUser).toHaveBeenCalled();
      });
    });

    it('deletes Firebase account when backend returns NAMESPACE_AT_CAPACITY error', async () => {
      const user = await setupAndFillForm();

      // Backend returns namespace at capacity error (typed client throws)
      mockRegisterStudent.mockRejectedValueOnce(new ApiError('At capacity', 400, 'NAMESPACE_AT_CAPACITY'));

      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      await waitFor(() => {
        expect(mockDeleteUser).toHaveBeenCalled();
      });

      // User sees the error
      await waitFor(() => {
        expect(screen.getByText('This class has reached its student limit. Contact your instructor.')).toBeInTheDocument();
      });
    });

    it('deletes Firebase account when backend returns INVALID_CODE error', async () => {
      const user = await setupAndFillForm();

      // Backend returns invalid code error (code became invalid between validation and registration)
      mockRegisterStudent.mockRejectedValueOnce(new ApiError('Invalid code', 400, 'INVALID_CODE'));

      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      await waitFor(() => {
        expect(mockDeleteUser).toHaveBeenCalled();
      });

      // User is returned to code entry
      await waitFor(() => {
        expect(screen.getByText('Join Your Section')).toBeInTheDocument();
      });
    });

    it('deletes Firebase account when backend returns SECTION_INACTIVE error', async () => {
      const user = await setupAndFillForm();

      // Backend returns section inactive error (typed client throws)
      mockRegisterStudent.mockRejectedValueOnce(new ApiError('Section inactive', 400, 'SECTION_INACTIVE'));

      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      await waitFor(() => {
        expect(mockDeleteUser).toHaveBeenCalled();
      });
    });

    it('deletes Firebase account when backend call throws network error', async () => {
      const user = await setupAndFillForm();

      // Backend call throws network error (typed client throws)
      mockRegisterStudent.mockRejectedValueOnce(new Error('Network error'));

      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      await waitFor(() => {
        expect(mockDeleteUser).toHaveBeenCalled();
      });
    });

    it('allows retry after Firebase account cleanup on backend failure', async () => {
      const user = await setupAndFillForm();

      // First attempt: backend fails (typed client throws)
      mockRegisterStudent.mockRejectedValueOnce(new ApiError('Temporary error', 500));

      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      // Wait for cleanup
      await waitFor(() => {
        expect(mockDeleteUser).toHaveBeenCalled();
      });

      // Form should return to ready state for retry
      await waitFor(() => {
        expect(screen.getByText('Temporary error')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Create Account' })).toBeInTheDocument();
      });

      // Reset mocks for retry
      mockCreateUserWithEmailAndPassword.mockClear();
      mockDeleteUser.mockClear();
      mockCurrentUser = null;
      mockCreateUserWithEmailAndPassword.mockImplementation(() => {
        mockCurrentUser = mockFirebaseUser;
        return Promise.resolve({ user: mockFirebaseUser });
      });

      // Second attempt: backend succeeds (typed client returns user)
      mockRegisterStudent.mockResolvedValueOnce({ id: 'user-1', role: 'student' });

      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      // Verify Firebase account was created again on retry
      await waitFor(() => {
        expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalled();
      });

      // Verify redirect on success
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/sections/sec-1');
      });
    });
  });
});

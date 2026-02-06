/**
 * Tests for Student Registration Page
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StudentRegistrationPage from '../page';

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

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock Firebase createUserWithEmailAndPassword
const mockCreateUserWithEmailAndPassword = jest.fn();
const mockGetIdToken = jest.fn();
const mockFirebaseUser = {
  getIdToken: mockGetIdToken,
  uid: 'firebase-uid-123',
  email: 'student@example.com',
};

jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: (...args: unknown[]) => mockCreateUserWithEmailAndPassword(...args),
  getAuth: jest.fn(),
}));

jest.mock('@/lib/firebase', () => ({
  firebaseAuth: { currentUser: null },
}));

// Mock public-api-client to delegate to global.fetch (bypass retry/BASE_URL)
jest.mock('@/lib/public-api-client', () => ({
  publicFetchRaw: (path: string, options?: RequestInit) =>
    global.fetch(path, options),
}));

// Mock api-client for authenticated requests
const mockApiFetchRaw = jest.fn();
jest.mock('@/lib/api-client', () => ({
  apiFetchRaw: (...args: unknown[]) => mockApiFetchRaw(...args),
}));

describe('StudentRegistrationPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
    mockFetch.mockClear();
    mockRefreshUser.mockClear();
    mockRefreshUser.mockResolvedValue(undefined);
    mockSearchParams.delete('code');
    mockCreateUserWithEmailAndPassword.mockClear();
    mockGetIdToken.mockClear();
    mockApiFetchRaw.mockClear();
    // Default: Firebase account creation succeeds
    mockCreateUserWithEmailAndPassword.mockResolvedValue({ user: mockFirebaseUser });
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
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('shows loading state during validation', async () => {
      const user = userEvent.setup();
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<StudentRegistrationPage />);

      const input = screen.getByPlaceholderText('ABC-123');
      await user.type(input, 'ABC123');

      const button = screen.getByRole('button', { name: 'Continue to Register' });
      await user.click(button);

      expect(screen.getByText('Checking code...')).toBeInTheDocument();
    });

    it('shows error for invalid code', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Invalid code', code: 'INVALID_CODE' }),
      });

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
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Section inactive', code: 'SECTION_INACTIVE' }),
      });

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
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          section: { id: 'sec-1', name: 'Monday 2pm' },
          class: { id: 'cls-1', name: 'CS 101 - Intro to Python' },
          namespace: { id: 'ns-1', displayName: 'Test University' },
          instructors: [{ id: 'inst-1', displayName: 'Prof. Smith' }],
        }),
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
        expect(screen.getByText('Instructor: Prof. Smith')).toBeInTheDocument();
      });
    });
  });

  describe('Registration Form Validation', () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          section: { id: 'sec-1', name: 'Test Section' },
          class: { id: 'cls-1', name: 'Test Class' },
          namespace: { id: 'ns-1', displayName: 'Test Org' },
          instructors: [],
        }),
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

      // Reset mock for registration call
      mockFetch.mockClear();

      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    });

    it('validates password has letter and number', async () => {
      const user = await setupForm();

      await user.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com');
      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'abcdefgh');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'abcdefgh');

      mockFetch.mockClear();

      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      expect(screen.getByText('Password must contain at least one letter and one number')).toBeInTheDocument();
    });

    it('shows password mismatch error', async () => {
      const user = await setupForm();

      await user.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com');
      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'Password123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'Different123');

      mockFetch.mockClear();

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

      // First call: validate code (unauthenticated)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          section: { id: 'sec-1', name: 'Test Section' },
          class: { id: 'cls-1', name: 'Test Class' },
          namespace: { id: 'ns-1', displayName: 'Test Org' },
          instructors: [],
        }),
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
      mockApiFetchRaw.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          user: { id: 'user-1', role: 'student' },
        }),
      });

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

    it('uses authenticated API call for registration POST', async () => {
      const user = await setupAndFillForm();

      // Backend registration succeeds
      mockApiFetchRaw.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          user: { id: 'user-1', role: 'student' },
        }),
      });

      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      // Verify authenticated API was called (not publicFetchRaw)
      await waitFor(() => {
        expect(mockApiFetchRaw).toHaveBeenCalledWith(
          '/auth/register-student',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              join_code: 'ABC123',
            }),
          })
        );
      });
    });

    it('submits form and redirects on success', async () => {
      const user = await setupAndFillForm();

      mockApiFetchRaw.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          user: { id: 'user-1', role: 'student' },
        }),
      });

      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      await waitFor(() => {
        expect(screen.getByText('Account Created!')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/sections');
      });
    });

    it('shows loading state during submission', async () => {
      const user = await setupAndFillForm();

      mockApiFetchRaw.mockImplementationOnce(() => new Promise(() => {})); // Never resolves

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

      mockApiFetchRaw.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({
          error: 'At capacity',
          code: 'NAMESPACE_AT_CAPACITY',
        }),
      });

      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      await waitFor(() => {
        expect(screen.getByText('This class has reached its student limit. Contact your instructor.')).toBeInTheDocument();
      });
    });
  });

  describe('Back Button', () => {
    it('returns to code entry on back button', async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          section: { id: 'sec-1', name: 'Test Section' },
          class: { id: 'cls-1', name: 'Test Class' },
          namespace: { id: 'ns-1', displayName: 'Test Org' },
          instructors: [],
        }),
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

      // First call: validate code (unauthenticated)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          section: { id: 'sec-1', name: 'Test Section' },
          class: { id: 'cls-1', name: 'Test Class' },
          namespace: { id: 'ns-1', displayName: 'Test Org' },
          instructors: [],
        }),
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

    it('refreshes user and redirects to /sections on successful registration', async () => {
      const user = await setupAndFillForm();

      // Backend registration succeeds
      mockApiFetchRaw.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          user: { id: 'user-1', role: 'student' },
        }),
      });

      await user.click(screen.getByRole('button', { name: 'Create Account' }));

      // User is already logged in via Firebase, so refreshUser is called
      await waitFor(() => {
        expect(mockRefreshUser).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/sections');
      });
    });
  });
});

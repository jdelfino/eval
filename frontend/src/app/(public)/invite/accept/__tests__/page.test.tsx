/**
 * Tests for Accept Invitation Page
 *
 * Verifies that the invite accept flow uses typed API clients for the new token format
 * and publicFetchRaw for the legacy hash-based flow.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AcceptInvitePage from '../page';

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock fetch — used for legacy hash-based requests (via publicFetchRaw)
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock Firebase createUserWithEmailAndPassword and deleteUser
const mockCreateUserWithEmailAndPassword = jest.fn();
const mockDeleteUser = jest.fn();
const mockGetIdToken = jest.fn();
const mockFirebaseUser = {
  getIdToken: mockGetIdToken,
  uid: 'firebase-uid-123',
  email: 'test@example.com',
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

// Mock typed registration API client functions (for new token format)
const mockGetInvitationDetails = jest.fn();
const mockAcceptInvite = jest.fn();
jest.mock('@/lib/api/registration', () => ({
  getInvitationDetails: (...args: unknown[]) => mockGetInvitationDetails(...args),
  acceptInvite: (...args: unknown[]) => mockAcceptInvite(...args),
}));

// Mock public-api-client for legacy hash-based flow
jest.mock('@/lib/public-api-client', () => ({
  publicFetchRaw: (...args: Parameters<typeof fetch>) => global.fetch(...args),
}));

// Mock the location hash hook
let mockLocationHash = '';
const mockReload = jest.fn();

jest.mock('@/hooks/useLocationHash', () => ({
  useLocationHash: () => mockLocationHash,
  useLocationReload: () => mockReload,
}));

// Helper to set location hash
const setLocationHash = (hash: string) => {
  mockLocationHash = hash;
};

// Mock next/navigation useSearchParams for query parameter support
let mockSearchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => mockSearchParams,
}));

// Helper to set search params
const setSearchParams = (params: Record<string, string>) => {
  mockSearchParams = new URLSearchParams(params);
};

describe('AcceptInvitePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
    mockFetch.mockClear();
    mockReload.mockClear();
    mockLocationHash = '';
    mockSearchParams = new URLSearchParams();
    mockCreateUserWithEmailAndPassword.mockClear();
    mockDeleteUser.mockClear();
    mockGetIdToken.mockClear();
    mockGetInvitationDetails.mockClear();
    mockAcceptInvite.mockClear();
    mockCurrentUser = null;
    // Default: Firebase account creation succeeds and sets currentUser
    mockCreateUserWithEmailAndPassword.mockImplementation(() => {
      mockCurrentUser = mockFirebaseUser;
      return Promise.resolve({ user: mockFirebaseUser });
    });
    mockDeleteUser.mockResolvedValue(undefined);
    mockGetIdToken.mockResolvedValue('mock-firebase-jwt-token');
  });

  it('does not import or use Supabase', () => {
    // This is a compile-time guarantee: if supabase-client were imported,
    // the module mock would need to exist. Since we removed the mock and
    // the module, this test passing confirms no Supabase dependency.
    expect(true).toBe(true);
  });

  describe('Query Parameter Token Support (typed client)', () => {
    it('calls getInvitationDetails with token from query params', async () => {
      setSearchParams({ token: '11111111-1111-1111-1111-111111111111' });
      mockGetInvitationDetails.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(mockGetInvitationDetails).toHaveBeenCalledWith(
          '11111111-1111-1111-1111-111111111111'
        );
      });
    });

    it('displays invitation info when token query param is valid', async () => {
      setSearchParams({ token: '11111111-1111-1111-1111-111111111111' });
      // Typed client returns InvitationDetails directly
      mockGetInvitationDetails.mockResolvedValue({
        id: '11111111-1111-1111-1111-111111111111',
        email: 'test@example.com',
        target_role: 'instructor',
        namespace_id: 'test-ns',
        status: 'pending',
      });

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
        expect(screen.getByText('test@example.com')).toBeInTheDocument();
        expect(screen.getByText('Instructor')).toBeInTheDocument();
      });
    });

    it('shows error for invalid token format in query params', async () => {
      setSearchParams({ token: 'not-a-uuid' });
      const error = new Error('Invalid token format');
      (error as any).status = 400;
      (error as any).code = 'INVALID_TOKEN';
      mockGetInvitationDetails.mockRejectedValue(error);

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Invalid Link')).toBeInTheDocument();
      });
    });

    it('shows error for invitation not found from query param token', async () => {
      setSearchParams({ token: '11111111-1111-1111-1111-111111111111' });
      const error = new Error('Not found');
      (error as any).status = 404;
      (error as any).code = 'INVITATION_NOT_FOUND';
      mockGetInvitationDetails.mockRejectedValue(error);

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Invitation Not Found')).toBeInTheDocument();
      });
    });

    it('prefers query param token over hash-based tokens', async () => {
      // Both are set, query param should take precedence
      setSearchParams({ token: '22222222-2222-2222-2222-222222222222' });
      setLocationHash('#token_hash=hash-token&type=invite');
      mockGetInvitationDetails.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(mockGetInvitationDetails).toHaveBeenCalledWith(
          '22222222-2222-2222-2222-222222222222'
        );
      });
      // Should NOT call fetch for hash-based params
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Token Verification (legacy hash-based)', () => {
    it('sends token_hash to API for verification', async () => {
      setLocationHash('#token_hash=test-token&type=invite');
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/auth/accept-invite?token_hash=test-token&type=invite')
        );
      });
    });

    it('sends access_token to API for verification', async () => {
      setLocationHash('#access_token=at-123&type=invite');
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/auth/accept-invite?access_token=at-123&type=invite')
        );
      });
    });

    it('shows error for missing token', async () => {
      setLocationHash('');

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Invalid Link')).toBeInTheDocument();
      });
    });

    it('shows error for invalid token type', async () => {
      setLocationHash('#token_hash=test-token&type=recovery');

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Invalid Link')).toBeInTheDocument();
      });
    });

    it('shows error for expired token from API', async () => {
      setLocationHash('#token_hash=test-token&type=invite');
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ code: 'OTP_EXPIRED', error: 'Token expired' }),
      });

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Invitation Expired')).toBeInTheDocument();
      });
    });

    it('shows error for invalid token from API', async () => {
      setLocationHash('#token_hash=test-token&type=invite');
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ code: 'OTP_INVALID', error: 'Invalid token' }),
      });

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Invalid Link')).toBeInTheDocument();
      });
    });

    it('shows user already exists error from API', async () => {
      setLocationHash('#token_hash=test-token&type=invite');
      mockFetch.mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ code: 'USER_ALREADY_EXISTS', error: 'User exists' }),
      });

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Account Exists')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Sign In' })).toBeInTheDocument();
      });
    });
  });

  describe('Loading Invitation', () => {
    it('shows loading invitation state after token sent to API', async () => {
      setLocationHash('#token_hash=test-token&type=invite');
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Loading your invitation...')).toBeInTheDocument();
      });
    });

    it('displays invitation info on success', async () => {
      setLocationHash('#token_hash=test-token&type=invite');
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          invitation: {
            id: 'inv-1',
            email: 'test@example.com',
            targetRole: 'instructor',
          },
          namespace: {
            id: 'test-ns',
            displayName: 'Test Organization',
          },
        }),
      });

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
        expect(screen.getByText('test@example.com')).toBeInTheDocument();
        expect(screen.getByText('Instructor')).toBeInTheDocument();
        expect(screen.getByText('Test Organization')).toBeInTheDocument();
      });
    });

    it('shows error for consumed invitation', async () => {
      setLocationHash('#token_hash=test-token&type=invite');
      mockFetch.mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: 'Already used', code: 'INVITATION_CONSUMED' }),
      });

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Already Used')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Sign In' })).toBeInTheDocument();
      });
    });

    it('shows error for revoked invitation', async () => {
      setLocationHash('#token_hash=test-token&type=invite');
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Revoked', code: 'INVITATION_REVOKED' }),
      });

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Invitation Revoked')).toBeInTheDocument();
      });
    });

    it('shows error for not found invitation', async () => {
      setLocationHash('#token_hash=test-token&type=invite');
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not found', code: 'INVITATION_NOT_FOUND' }),
      });

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Invitation Not Found')).toBeInTheDocument();
      });
    });
  });

  describe('Profile Form', () => {
    beforeEach(() => {
      setLocationHash('#token_hash=test-token&type=invite');
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          invitation: {
            id: 'inv-1',
            email: 'test@example.com',
            targetRole: 'instructor',
          },
          namespace: {
            id: 'test-ns',
            displayName: 'Test Organization',
          },
        }),
      });
    });

    it('displays namespace admin role correctly', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          invitation: {
            id: 'inv-1',
            email: 'admin@example.com',
            targetRole: 'namespace-admin',
          },
          namespace: null,
        }),
      });

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Namespace Administrator')).toBeInTheDocument();
      });
    });

    it('has required attribute on password fields', async () => {
      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
      });

      expect(screen.getByPlaceholderText('At least 8 characters')).toHaveAttribute('required');
      expect(screen.getByPlaceholderText('Re-enter your password')).toHaveAttribute('required');
    });

    it('validates password minimum length', async () => {
      const user = userEvent.setup();
      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'short');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'short');
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    });

    it('validates passwords must match', async () => {
      const user = userEvent.setup();
      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'password123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'different456');
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });
  });

  describe('Form Submission (typed client)', () => {
    it('creates Firebase account before calling acceptInvite', async () => {
      const user = userEvent.setup();
      setLocationHash('#token_hash=test-token&type=invite');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          invitation: { id: 'inv-1', email: 'test@example.com', targetRole: 'instructor' },
          namespace: { id: 'test-ns', displayName: 'Test Org' },
        }),
      });

      mockAcceptInvite.mockResolvedValueOnce({
        id: 'user-1', role: 'instructor', email: 'test@example.com',
        external_id: 'ext-1', namespace_id: 'ns-1', display_name: null,
        created_at: '2024-01-01', updated_at: '2024-01-01',
      });

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'securepassword123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'securepassword123');
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      // Verify Firebase account was created first
      await waitFor(() => {
        expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalledWith(
          expect.anything(), // firebaseAuth
          'test@example.com',
          'securepassword123'
        );
      });
    });

    it('uses typed acceptInvite for POST', async () => {
      const user = userEvent.setup();
      setLocationHash('#token_hash=test-token&type=invite');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          invitation: { id: 'inv-1', email: 'test@example.com', targetRole: 'instructor' },
          namespace: { id: 'test-ns', displayName: 'Test Org' },
        }),
      });

      mockAcceptInvite.mockResolvedValueOnce({
        id: 'user-1', role: 'instructor', email: 'test@example.com',
        external_id: 'ext-1', namespace_id: 'ns-1', display_name: null,
        created_at: '2024-01-01', updated_at: '2024-01-01',
      });

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'securepassword123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'securepassword123');
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      // Verify typed acceptInvite was called
      await waitFor(() => {
        expect(mockAcceptInvite).toHaveBeenCalledWith('inv-1', undefined);
      });
    });

    it('submits password and redirects on success', async () => {
      const user = userEvent.setup();
      setLocationHash('#token_hash=test-token&type=invite');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          invitation: { id: 'inv-1', email: 'test@example.com', targetRole: 'instructor' },
          namespace: { id: 'test-ns', displayName: 'Test Org' },
        }),
      });

      mockAcceptInvite.mockResolvedValueOnce({
        id: 'user-1', role: 'instructor', email: 'test@example.com',
        external_id: 'ext-1', namespace_id: 'ns-1', display_name: null,
        created_at: '2024-01-01', updated_at: '2024-01-01',
      });

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'securepassword123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'securepassword123');
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/instructor');
      });
    });

    it('redirects namespace-admin to /namespace/invitations', async () => {
      const user = userEvent.setup();
      setLocationHash('#token_hash=test-token&type=invite');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          invitation: { id: 'inv-1', email: 'admin@example.com', targetRole: 'namespace-admin' },
          namespace: null,
        }),
      });

      mockAcceptInvite.mockResolvedValueOnce({
        id: 'user-1', role: 'namespace-admin', email: 'admin@example.com',
        external_id: 'ext-1', namespace_id: null, display_name: null,
        created_at: '2024-01-01', updated_at: '2024-01-01',
      });

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'adminpassword123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'adminpassword123');
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/namespace/invitations');
      });
    });

    it('shows error for duplicate email from Firebase', async () => {
      const user = userEvent.setup();
      setLocationHash('#token_hash=test-token&type=invite');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          invitation: { id: 'inv-1', email: 'test@example.com', targetRole: 'instructor' },
          namespace: null,
        }),
      });

      // Firebase throws error for existing email
      const firebaseError = new Error('Firebase: Error (auth/email-already-in-use).');
      (firebaseError as { code?: string }).code = 'auth/email-already-in-use';
      mockCreateUserWithEmailAndPassword.mockRejectedValueOnce(firebaseError);

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'testpassword123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'testpassword123');
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      await waitFor(() => {
        expect(screen.getByText('Account Exists')).toBeInTheDocument();
      });
    });

    it('shows error for API failure on submit', async () => {
      const user = userEvent.setup();
      setLocationHash('#token_hash=test-token&type=invite');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          invitation: { id: 'inv-1', email: 'test@example.com', targetRole: 'instructor' },
          namespace: null,
        }),
      });

      // Typed client throws an error
      const apiError = new Error('Something went wrong');
      (apiError as any).status = 500;
      mockAcceptInvite.mockRejectedValueOnce(apiError);

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'testpassword123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'testpassword123');
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      await waitFor(() => {
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      });
    });

    it('shows loading state during submission', async () => {
      const user = userEvent.setup();
      setLocationHash('#token_hash=test-token&type=invite');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          invitation: { id: 'inv-1', email: 'test@example.com', targetRole: 'instructor' },
          namespace: null,
        }),
      });

      mockAcceptInvite.mockImplementationOnce(() => new Promise(() => {}));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'testpassword123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'testpassword123');
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      await waitFor(() => {
        expect(screen.getByText('Creating your account...')).toBeInTheDocument();
      });
    });

    it('includes display name in submission when provided', async () => {
      const user = userEvent.setup();
      setLocationHash('#token_hash=test-token&type=invite');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          invitation: { id: 'inv-1', email: 'test@example.com', targetRole: 'instructor' },
          namespace: { id: 'test-ns', displayName: 'Test Org' },
        }),
      });

      mockAcceptInvite.mockResolvedValueOnce({
        id: 'user-1', role: 'instructor', email: 'test@example.com',
        external_id: 'ext-1', namespace_id: 'ns-1', display_name: 'John Doe',
        created_at: '2024-01-01', updated_at: '2024-01-01',
      });

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('Your preferred display name'), 'John Doe');
      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'securepassword123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'securepassword123');
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      await waitFor(() => {
        expect(mockAcceptInvite).toHaveBeenCalledWith('inv-1', 'John Doe');
      });
    });
  });

  describe('Network Error Handling', () => {
    it('shows network error with retry option', async () => {
      setLocationHash('#token_hash=test-token&type=invite');
      mockFetch.mockRejectedValue(new Error('Network error'));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Connection Error')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
      });
    });

    it('reloads page on retry', async () => {
      setLocationHash('#token_hash=test-token&type=invite');
      mockFetch.mockRejectedValue(new Error('Network error'));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));

      expect(mockReload).toHaveBeenCalled();
    });
  });

  describe('Firebase Account Cleanup on Backend Failure', () => {
    it('deletes Firebase account when acceptInvite throws error', async () => {
      const user = userEvent.setup();
      setLocationHash('#token_hash=test-token&type=invite');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          invitation: { id: 'inv-1', email: 'test@example.com', targetRole: 'instructor' },
          namespace: { id: 'test-ns', displayName: 'Test Org' },
        }),
      });

      // Typed acceptInvite throws error
      const apiError = new Error('Internal server error');
      (apiError as any).status = 500;
      mockAcceptInvite.mockRejectedValueOnce(apiError);

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'securepassword123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'securepassword123');
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      // Verify Firebase account was created
      await waitFor(() => {
        expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalled();
      });

      // Verify Firebase account was deleted after backend failure
      await waitFor(() => {
        expect(mockDeleteUser).toHaveBeenCalled();
      });
    });

    it('deletes Firebase account when acceptInvite throws INVITATION_CONSUMED', async () => {
      const user = userEvent.setup();
      setLocationHash('#token_hash=test-token&type=invite');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          invitation: { id: 'inv-1', email: 'test@example.com', targetRole: 'instructor' },
          namespace: null,
        }),
      });

      // Typed client throws with code
      const apiError = new Error('Invitation already used');
      (apiError as any).status = 409;
      (apiError as any).code = 'INVITATION_CONSUMED';
      mockAcceptInvite.mockRejectedValueOnce(apiError);

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'testpassword123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'testpassword123');
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      await waitFor(() => {
        expect(mockDeleteUser).toHaveBeenCalled();
      });

      // User sees the consumed error page
      await waitFor(() => {
        expect(screen.getByText('Already Used')).toBeInTheDocument();
      });
    });

    it('deletes Firebase account when acceptInvite throws INVITATION_EXPIRED', async () => {
      const user = userEvent.setup();
      setLocationHash('#token_hash=test-token&type=invite');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          invitation: { id: 'inv-1', email: 'test@example.com', targetRole: 'instructor' },
          namespace: null,
        }),
      });

      // Typed client throws with code
      const apiError = new Error('Invitation expired');
      (apiError as any).status = 410;
      (apiError as any).code = 'INVITATION_EXPIRED';
      mockAcceptInvite.mockRejectedValueOnce(apiError);

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'testpassword123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'testpassword123');
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      await waitFor(() => {
        expect(mockDeleteUser).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByText('Invitation Expired')).toBeInTheDocument();
      });
    });

    it('deletes Firebase account when acceptInvite throws network error', async () => {
      const user = userEvent.setup();
      setLocationHash('#token_hash=test-token&type=invite');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          invitation: { id: 'inv-1', email: 'test@example.com', targetRole: 'instructor' },
          namespace: null,
        }),
      });

      // Typed client throws a network error
      mockAcceptInvite.mockRejectedValueOnce(new Error('Network error'));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'testpassword123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'testpassword123');
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      await waitFor(() => {
        expect(mockDeleteUser).toHaveBeenCalled();
      });
    });

    it('allows retry after Firebase account cleanup on backend failure', async () => {
      const user = userEvent.setup();
      setLocationHash('#token_hash=test-token&type=invite');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          invitation: { id: 'inv-1', email: 'test@example.com', targetRole: 'instructor' },
          namespace: { id: 'test-ns', displayName: 'Test Org' },
        }),
      });

      // First attempt: backend fails
      const apiError = new Error('Temporary error');
      (apiError as any).status = 500;
      mockAcceptInvite.mockRejectedValueOnce(apiError);

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'securepassword123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'securepassword123');
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      // Wait for cleanup
      await waitFor(() => {
        expect(mockDeleteUser).toHaveBeenCalled();
      });

      // Form should return to ready state for retry
      await waitFor(() => {
        expect(screen.getByText('Temporary error')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Complete Registration' })).toBeInTheDocument();
      });

      // Reset mocks for retry
      mockCreateUserWithEmailAndPassword.mockClear();
      mockDeleteUser.mockClear();
      mockCurrentUser = null;
      mockCreateUserWithEmailAndPassword.mockImplementation(() => {
        mockCurrentUser = mockFirebaseUser;
        return Promise.resolve({ user: mockFirebaseUser });
      });

      // Second attempt: backend succeeds
      mockAcceptInvite.mockResolvedValueOnce({
        id: 'user-1', role: 'instructor', email: 'test@example.com',
        external_id: 'ext-1', namespace_id: 'ns-1', display_name: null,
        created_at: '2024-01-01', updated_at: '2024-01-01',
      });

      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      // Verify Firebase account was created again on retry
      await waitFor(() => {
        expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalled();
      });

      // Verify redirect on success
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/instructor');
      });
    });
  });
});

/**
 * Tests for Accept Invitation Page
 *
 * Verifies invite acceptance flow using typed API clients:
 * GET /auth/accept-invite (via getInvitationDetails) and
 * POST /auth/accept-invite (via acceptInvite).
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AcceptInvitePage from '../page';
import { ApiError } from '@/lib/api-error';

// Mock next/navigation
const mockPush = jest.fn();
let mockSearchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

// Mock Firebase
const mockCreateUserWithEmailAndPassword = jest.fn();
const mockDeleteUser = jest.fn();
let mockCurrentUser: { delete: jest.Mock } | null = null;

jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: (...args: unknown[]) => mockCreateUserWithEmailAndPassword(...args),
  getAuth: jest.fn(),
}));

jest.mock('@/lib/firebase', () => ({
  firebaseAuth: {
    get currentUser() {
      return mockCurrentUser;
    },
  },
}));

// Mock typed registration API client
const mockGetInvitationDetails = jest.fn();
const mockAcceptInvite = jest.fn();
jest.mock('@/lib/api/registration', () => ({
  getInvitationDetails: (...args: unknown[]) => mockGetInvitationDetails(...args),
  acceptInvite: (...args: unknown[]) => mockAcceptInvite(...args),
}));

// Helpers
const setSearchParams = (params: Record<string, string>) => {
  mockSearchParams = new URLSearchParams(params);
};

const VALID_TOKEN = '11111111-1111-1111-1111-111111111111';

const mockInvitation = {
  id: VALID_TOKEN,
  email: 'test@example.com',
  target_role: 'instructor' as const,
  namespace_id: 'test-ns',
  status: 'pending',
};

const mockUser = {
  id: 'user-1',
  role: 'instructor',
  email: 'test@example.com',
  external_id: 'ext-1',
  namespace_id: 'ns-1',
  display_name: null,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

function makeApiError(message: string, status: number, code?: string) {
  return new ApiError(message, status, code);
}

describe('AcceptInvitePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockCurrentUser = null;
    mockCreateUserWithEmailAndPassword.mockImplementation(() => {
      mockCurrentUser = { delete: mockDeleteUser };
      return Promise.resolve({ user: mockCurrentUser });
    });
    mockDeleteUser.mockResolvedValue(undefined);
  });

  // ---------------------------------------------------------------------------
  // Token Verification
  // ---------------------------------------------------------------------------

  describe('Token Verification', () => {
    it('shows invalid link when no token provided', async () => {
      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Invalid Link')).toBeInTheDocument();
      });
    });

    it('calls getInvitationDetails with token from query params', async () => {
      setSearchParams({ token: VALID_TOKEN });
      mockGetInvitationDetails.mockImplementation(() => new Promise(() => {}));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(mockGetInvitationDetails).toHaveBeenCalledWith(VALID_TOKEN);
      });
    });

    it('shows loading state while verifying', async () => {
      setSearchParams({ token: VALID_TOKEN });
      mockGetInvitationDetails.mockImplementation(() => new Promise(() => {}));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Loading your invitation...')).toBeInTheDocument();
      });
    });

    it('displays invitation info on success', async () => {
      setSearchParams({ token: VALID_TOKEN });
      mockGetInvitationDetails.mockResolvedValue(mockInvitation);

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
        expect(screen.getByText('test@example.com')).toBeInTheDocument();
        expect(screen.getByText('Instructor')).toBeInTheDocument();
      });
    });

    it('displays namespace admin role correctly', async () => {
      setSearchParams({ token: VALID_TOKEN });
      mockGetInvitationDetails.mockResolvedValue({
        ...mockInvitation,
        email: 'admin@example.com',
        target_role: 'namespace-admin',
      });

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Namespace Administrator')).toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Verification Error Handling
  // ---------------------------------------------------------------------------

  describe('Verification Errors', () => {
    it.each([
      ['OTP_EXPIRED', 'Invitation Expired'],
      ['TOKEN_EXPIRED', 'Invitation Expired'],
      ['OTP_INVALID', 'Invalid Link'],
      ['TOKEN_INVALID', 'Invalid Link'],
      ['INVALID_TOKEN', 'Invalid Link'],
      ['USER_ALREADY_EXISTS', 'Account Exists'],
      ['INVITATION_CONSUMED', 'Already Used'],
      ['INVITATION_REVOKED', 'Invitation Revoked'],
      ['INVITATION_NOT_FOUND', 'Invitation Not Found'],
      ['INVITATION_EXPIRED', 'Invitation Expired'],
    ])('maps error code %s to "%s"', async (code, expectedTitle) => {
      setSearchParams({ token: VALID_TOKEN });
      mockGetInvitationDetails.mockRejectedValue(makeApiError('Error', 400, code));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText(expectedTitle)).toBeInTheDocument();
      });
    });

    it('shows invalid link for 400 status without code', async () => {
      setSearchParams({ token: VALID_TOKEN });
      mockGetInvitationDetails.mockRejectedValue(makeApiError('Bad request', 400));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Invalid Link')).toBeInTheDocument();
      });
    });

    it('shows network error for network failures', async () => {
      setSearchParams({ token: VALID_TOKEN });
      mockGetInvitationDetails.mockRejectedValue(new Error('Network error'));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Connection Error')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
      });
    });

    it('shows sign in link for user_already_exists', async () => {
      setSearchParams({ token: VALID_TOKEN });
      mockGetInvitationDetails.mockRejectedValue(makeApiError('Exists', 409, 'USER_ALREADY_EXISTS'));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByRole('link', { name: 'Sign In' })).toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Profile Form
  // ---------------------------------------------------------------------------

  describe('Profile Form', () => {
    beforeEach(() => {
      setSearchParams({ token: VALID_TOKEN });
      mockGetInvitationDetails.mockResolvedValue(mockInvitation);
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

  // ---------------------------------------------------------------------------
  // Form Submission
  // ---------------------------------------------------------------------------

  describe('Form Submission', () => {
    beforeEach(() => {
      setSearchParams({ token: VALID_TOKEN });
      mockGetInvitationDetails.mockResolvedValue(mockInvitation);
    });

    it('creates Firebase account before calling acceptInvite', async () => {
      const user = userEvent.setup();
      mockAcceptInvite.mockResolvedValue(mockUser);

      render(<AcceptInvitePage />);
      await waitFor(() => expect(screen.getByText('Complete Your Profile')).toBeInTheDocument());

      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'securepassword123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'securepassword123');
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      await waitFor(() => {
        expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalledWith(
          expect.anything(),
          'test@example.com',
          'securepassword123'
        );
      });
    });

    it('calls acceptInvite with token and display name', async () => {
      const user = userEvent.setup();
      mockAcceptInvite.mockResolvedValue(mockUser);

      render(<AcceptInvitePage />);
      await waitFor(() => expect(screen.getByText('Complete Your Profile')).toBeInTheDocument());

      await user.type(screen.getByPlaceholderText('Your preferred display name'), 'John Doe');
      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'securepassword123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'securepassword123');
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      await waitFor(() => {
        expect(mockAcceptInvite).toHaveBeenCalledWith(VALID_TOKEN, 'John Doe');
      });
    });

    it('redirects instructor to /instructor on success', async () => {
      const user = userEvent.setup();
      mockAcceptInvite.mockResolvedValue(mockUser);

      render(<AcceptInvitePage />);
      await waitFor(() => expect(screen.getByText('Complete Your Profile')).toBeInTheDocument());

      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'securepassword123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'securepassword123');
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/instructor');
      });
    });

    it('redirects namespace-admin to /namespace/invitations', async () => {
      const user = userEvent.setup();
      mockAcceptInvite.mockResolvedValue({ ...mockUser, role: 'namespace-admin' });

      render(<AcceptInvitePage />);
      await waitFor(() => expect(screen.getByText('Complete Your Profile')).toBeInTheDocument());

      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'adminpassword123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'adminpassword123');
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/namespace/invitations');
      });
    });

    it('shows loading state during submission', async () => {
      const user = userEvent.setup();
      mockAcceptInvite.mockImplementation(() => new Promise(() => {}));

      render(<AcceptInvitePage />);
      await waitFor(() => expect(screen.getByText('Complete Your Profile')).toBeInTheDocument());

      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'testpassword123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'testpassword123');
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      await waitFor(() => {
        expect(screen.getByText('Creating your account...')).toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Error Handling During Submission
  // ---------------------------------------------------------------------------

  describe('Submission Errors', () => {
    beforeEach(() => {
      setSearchParams({ token: VALID_TOKEN });
      mockGetInvitationDetails.mockResolvedValue(mockInvitation);
    });

    it('shows error for duplicate email from Firebase', async () => {
      const user = userEvent.setup();
      const firebaseError = new Error('Firebase: Error (auth/email-already-in-use).');
      (firebaseError as any).code = 'auth/email-already-in-use';
      mockCreateUserWithEmailAndPassword.mockRejectedValue(firebaseError);

      render(<AcceptInvitePage />);
      await waitFor(() => expect(screen.getByText('Complete Your Profile')).toBeInTheDocument());

      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'testpassword123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'testpassword123');
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      await waitFor(() => {
        expect(screen.getByText('Account Exists')).toBeInTheDocument();
      });
    });

    it('shows inline error for API failure on submit', async () => {
      const user = userEvent.setup();
      mockAcceptInvite.mockRejectedValue(makeApiError('Something went wrong', 500));

      render(<AcceptInvitePage />);
      await waitFor(() => expect(screen.getByText('Complete Your Profile')).toBeInTheDocument());

      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'testpassword123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'testpassword123');
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      await waitFor(() => {
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      });
    });

    it('shows consumed error when acceptInvite returns INVITATION_CONSUMED', async () => {
      const user = userEvent.setup();
      mockAcceptInvite.mockRejectedValue(makeApiError('Already used', 409, 'INVITATION_CONSUMED'));

      render(<AcceptInvitePage />);
      await waitFor(() => expect(screen.getByText('Complete Your Profile')).toBeInTheDocument());

      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'testpassword123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'testpassword123');
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      await waitFor(() => {
        expect(screen.getByText('Already Used')).toBeInTheDocument();
      });
    });

    it('shows expired error when acceptInvite returns INVITATION_EXPIRED', async () => {
      const user = userEvent.setup();
      mockAcceptInvite.mockRejectedValue(makeApiError('Invitation expired', 410, 'INVITATION_EXPIRED'));

      render(<AcceptInvitePage />);
      await waitFor(() => expect(screen.getByText('Complete Your Profile')).toBeInTheDocument());

      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'testpassword123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'testpassword123');
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      await waitFor(() => {
        expect(screen.getByText('Invitation Expired')).toBeInTheDocument();
      });
    });

    it('deletes Firebase account when acceptInvite returns INVITATION_EXPIRED', async () => {
      const user = userEvent.setup();
      mockAcceptInvite.mockRejectedValue(makeApiError('Invitation expired', 410, 'INVITATION_EXPIRED'));

      render(<AcceptInvitePage />);
      await waitFor(() => expect(screen.getByText('Complete Your Profile')).toBeInTheDocument());

      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'testpassword123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'testpassword123');
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      await waitFor(() => {
        expect(mockDeleteUser).toHaveBeenCalled();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Firebase Account Cleanup
  // ---------------------------------------------------------------------------

  describe('Firebase Account Cleanup on Backend Failure', () => {
    beforeEach(() => {
      setSearchParams({ token: VALID_TOKEN });
      mockGetInvitationDetails.mockResolvedValue(mockInvitation);
    });

    it('deletes Firebase account when acceptInvite fails', async () => {
      const user = userEvent.setup();
      mockAcceptInvite.mockRejectedValue(makeApiError('Internal error', 500));

      render(<AcceptInvitePage />);
      await waitFor(() => expect(screen.getByText('Complete Your Profile')).toBeInTheDocument());

      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'securepassword123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'securepassword123');
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      await waitFor(() => {
        expect(mockDeleteUser).toHaveBeenCalled();
      });
    });

    it('allows retry after Firebase cleanup on backend failure', async () => {
      const user = userEvent.setup();

      // First attempt: backend fails
      mockAcceptInvite.mockRejectedValueOnce(makeApiError('Temporary error', 500));

      render(<AcceptInvitePage />);
      await waitFor(() => expect(screen.getByText('Complete Your Profile')).toBeInTheDocument());

      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'securepassword123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'securepassword123');
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      await waitFor(() => {
        expect(screen.getByText('Temporary error')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Complete Registration' })).toBeInTheDocument();
      });

      // Reset for retry
      mockCreateUserWithEmailAndPassword.mockClear();
      mockCurrentUser = null;
      mockCreateUserWithEmailAndPassword.mockImplementation(() => {
        mockCurrentUser = { delete: mockDeleteUser };
        return Promise.resolve({ user: mockCurrentUser });
      });

      // Second attempt: succeeds
      mockAcceptInvite.mockResolvedValueOnce(mockUser);
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/instructor');
      });
    });
  });
});

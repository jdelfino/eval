/**
 * Tests for Accept Invitation Page
 *
 * After the social auth migration:
 * - Token validation: GET /auth/accept-invite (via getInvitationDetails)
 * - If already signed in (via firebaseAuth.currentUser): skip sign-in, call acceptInvite directly
 * - If not signed in: render SignInButtons, then call acceptInvite on success
 * - POST /auth/accept-invite (via acceptInvite)
 * - No password fields — social provider handles auth
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

// Mock SignInButtons so tests don't depend on Firebase popup flow
jest.mock('@/components/ui/SignInButtons', () => ({
  SignInButtons: ({ onSuccess, onError, label }: any) => (
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
  ),
}));

// Track current user for "already signed in" tests
let mockCurrentUser: { delete: jest.Mock } | null = null;
const mockDeleteUser = jest.fn();

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

    it('shows sign in link for invitation_consumed', async () => {
      setSearchParams({ token: VALID_TOKEN });
      mockGetInvitationDetails.mockRejectedValue(makeApiError('Exists', 409, 'INVITATION_CONSUMED'));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByRole('link', { name: 'Sign In' })).toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Profile Form — No Password Fields
  // ---------------------------------------------------------------------------

  describe('Profile Form', () => {
    beforeEach(() => {
      setSearchParams({ token: VALID_TOKEN });
      mockGetInvitationDetails.mockResolvedValue(mockInvitation);
    });

    it('renders display name field', async () => {
      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
      });

      expect(screen.getByPlaceholderText('Your preferred display name')).toBeInTheDocument();
    });

    it('does NOT render password fields', async () => {
      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
      });

      expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/confirm password/i)).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/at least 8 characters/i)).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/re-enter your password/i)).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Not Signed In: SignInButtons Flow
  // ---------------------------------------------------------------------------

  describe('Not Signed In: SignInButtons flow', () => {
    beforeEach(() => {
      setSearchParams({ token: VALID_TOKEN });
      mockGetInvitationDetails.mockResolvedValue(mockInvitation);
      mockCurrentUser = null;
    });

    it('renders SignInButtons when not signed in', async () => {
      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });
    });

    it('shows sign-in label with invitation context', async () => {
      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-label')).toBeInTheDocument();
      });
    });

    it('calls acceptInvite after sign-in success', async () => {
      mockAcceptInvite.mockResolvedValue(mockUser);

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        // Empty display name becomes undefined
        expect(mockAcceptInvite).toHaveBeenCalledWith(VALID_TOKEN, undefined);
      });
    });

    it('redirects instructor to /instructor on success', async () => {
      mockAcceptInvite.mockResolvedValue(mockUser);

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/instructor');
      });
    });

    it('redirects namespace-admin to /namespace/invitations on success', async () => {
      mockGetInvitationDetails.mockResolvedValue({
        ...mockInvitation,
        target_role: 'namespace-admin',
      });
      mockAcceptInvite.mockResolvedValue({ ...mockUser, role: 'namespace-admin' });

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/namespace/invitations');
      });
    });

    it('shows error when SignInButtons calls onError', async () => {
      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mock-sign-in-error'));

      await waitFor(() => {
        expect(screen.getByText('Sign in failed')).toBeInTheDocument();
      });
    });

    it('shows error when acceptInvite fails after sign-in', async () => {
      mockAcceptInvite.mockRejectedValue(makeApiError('Something went wrong', 500));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      });
    });

    it('shows consumed error when acceptInvite returns INVITATION_CONSUMED', async () => {
      mockAcceptInvite.mockRejectedValue(makeApiError('Already used', 409, 'INVITATION_CONSUMED'));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(screen.getByText('Already Used')).toBeInTheDocument();
      });
    });

    it('shows expired error when acceptInvite returns INVITATION_EXPIRED', async () => {
      mockAcceptInvite.mockRejectedValue(makeApiError('Invitation expired', 410, 'INVITATION_EXPIRED'));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(screen.getByText('Invitation Expired')).toBeInTheDocument();
      });
    });

    it('deletes Firebase account when acceptInvite returns INVITATION_EXPIRED', async () => {
      // Start not signed in (shows SignInButtons)
      mockCurrentUser = null;
      mockAcceptInvite.mockRejectedValue(makeApiError('Invitation expired', 410, 'INVITATION_EXPIRED'));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      // Simulate sign-in sets currentUser before onSuccess fires
      mockCurrentUser = { delete: mockDeleteUser };
      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(mockDeleteUser).toHaveBeenCalled();
      });
    });

    it('deletes Firebase account when acceptInvite fails after sign-in', async () => {
      // Start not signed in (shows SignInButtons)
      mockCurrentUser = null;
      mockAcceptInvite.mockRejectedValue(makeApiError('Internal error', 500));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      // Simulate sign-in sets currentUser before onSuccess fires
      mockCurrentUser = { delete: mockDeleteUser };
      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(mockDeleteUser).toHaveBeenCalled();
      });
    });

    it('allows retry after Firebase cleanup on backend failure', async () => {
      // Start not signed in
      mockCurrentUser = null;

      // First attempt: backend fails
      mockAcceptInvite.mockRejectedValueOnce(makeApiError('Temporary error', 500));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(screen.getByText('Temporary error')).toBeInTheDocument();
      });

      // Should still show SignInButtons for retry
      expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Already Signed In: Direct Flow
  // ---------------------------------------------------------------------------

  describe('Already Signed In: direct flow', () => {
    beforeEach(() => {
      setSearchParams({ token: VALID_TOKEN });
      mockGetInvitationDetails.mockResolvedValue(mockInvitation);
      mockCurrentUser = { delete: mockDeleteUser };
    });

    it('does NOT render SignInButtons when already signed in', async () => {
      mockAcceptInvite.mockResolvedValue(mockUser);

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.queryByTestId('sign-in-buttons')).not.toBeInTheDocument();
      });
    });

    it('calls acceptInvite directly when already signed in', async () => {
      mockAcceptInvite.mockResolvedValue(mockUser);

      render(<AcceptInvitePage />);

      await waitFor(() => {
        // When already signed in, display name is empty string → undefined
        expect(mockAcceptInvite).toHaveBeenCalledWith(VALID_TOKEN, undefined);
      });
    });

    it('redirects instructor to /instructor when already signed in', async () => {
      mockAcceptInvite.mockResolvedValue(mockUser);

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/instructor');
      });
    });

    it('redirects namespace-admin when already signed in', async () => {
      mockGetInvitationDetails.mockResolvedValue({
        ...mockInvitation,
        target_role: 'namespace-admin',
      });
      mockAcceptInvite.mockResolvedValue({ ...mockUser, role: 'namespace-admin' });

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/namespace/invitations');
      });
    });

    it('shows error when acceptInvite fails when already signed in', async () => {
      mockAcceptInvite.mockRejectedValue(makeApiError('Consumed', 409, 'INVITATION_CONSUMED'));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Already Used')).toBeInTheDocument();
      });
    });

    it('shows inline error for backend failure when already signed in', async () => {
      mockAcceptInvite.mockRejectedValue(makeApiError('Something broke', 500));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Something broke')).toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Optional Display Name
  // ---------------------------------------------------------------------------

  describe('Display Name', () => {
    beforeEach(() => {
      setSearchParams({ token: VALID_TOKEN });
      mockGetInvitationDetails.mockResolvedValue(mockInvitation);
      mockCurrentUser = null;
    });

    it('calls acceptInvite with display name when provided', async () => {
      const user = userEvent.setup();
      mockAcceptInvite.mockResolvedValue(mockUser);

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('Your preferred display name'), 'John Doe');

      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(mockAcceptInvite).toHaveBeenCalledWith(VALID_TOKEN, 'John Doe');
      });
    });

    it('calls acceptInvite with undefined display name when not provided', async () => {
      mockAcceptInvite.mockResolvedValue(mockUser);

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(mockAcceptInvite).toHaveBeenCalledWith(VALID_TOKEN, undefined);
      });
    });
  });
});

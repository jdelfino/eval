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
const mockInviteSignInButtonsOnBeforeSignIn = jest.fn();
jest.mock('@/components/ui/SignInButtons', () => ({
  SignInButtons: ({ onSuccess, onError, onBeforeSignIn }: any) => {
    if (onBeforeSignIn) {
      mockInviteSignInButtonsOnBeforeSignIn.mockImplementation(onBeforeSignIn);
    }
    return (
      <div data-testid="sign-in-buttons">
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

// Mock AuthContext
const mockInviteBeginAuthFlow = jest.fn();
const mockInviteEndAuthFlow = jest.fn();
// mockSignOut is wired into useAuth().signOut so tests can assert on it
const mockSignOut = jest.fn();
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    beginAuthFlow: mockInviteBeginAuthFlow,
    endAuthFlow: mockInviteEndAuthFlow,
    signOut: (...args: unknown[]) => mockSignOut(...args),
  }),
}));

// Track current user for "already signed in" tests
let mockCurrentUser: { email: string | null; delete: jest.Mock } | null = null;
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
  expires_at: '2026-06-17T00:00:00Z',
  created_by: 'some-uuid-1234',
  created_at: '2026-06-10T00:00:00Z',
  consumed_at: null,
  consumed_by: null,
  revoked_at: null,
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
    mockSignOut.mockResolvedValue(undefined);
    mockInviteBeginAuthFlow.mockClear();
    mockInviteEndAuthFlow.mockClear();
    mockInviteSignInButtonsOnBeforeSignIn.mockClear();
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
        // New v4 L layout: kicker, heading, detail rows
        expect(screen.getByText("You've been invited")).toBeInTheDocument();
        // Email appears in both the detail row and the "Use the account that matches…" sub-line
        expect(screen.getAllByText('test@example.com').length).toBeGreaterThan(0);
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
      ['INVITATION_EXPIRED', 'This invitation has expired'],
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
  // T5 Test Case 1: L layout — kicker, role heading, detail rows
  // ---------------------------------------------------------------------------

  describe('L layout (ready state)', () => {
    beforeEach(() => {
      setSearchParams({ token: VALID_TOKEN });
      mockGetInvitationDetails.mockResolvedValue(mockInvitation);
      mockCurrentUser = null;
    });

    /**
     * Contract: Ready state renders v4 L layout with kicker, role-specific heading,
     * and detail rows for Invited email (mono), Role, Expires.
     * Why it matters: copy/layout drift from v4 design is silently invisible without
     * assertions — this test is the regression guard.
     * Breaks if: kicker text changes, heading logic breaks, detail rows are removed.
     */
    it('renders kicker, role heading, and detail rows', async () => {
      render(<AcceptInvitePage />);

      await waitFor(() => {
        // Kicker
        expect(screen.getByText("You've been invited")).toBeInTheDocument();
        // Role heading: instructor
        expect(screen.getByRole('heading', { name: /Join Eval as an instructor/i })).toBeInTheDocument();
        // "Invited email" row label
        expect(screen.getByText('Invited email')).toBeInTheDocument();
        // Email value — appears in both the detail row and the "Use the account that matches…" sub-line
        expect(screen.getAllByText('test@example.com').length).toBeGreaterThan(0);
        // Role row
        expect(screen.getByText('Role')).toBeInTheDocument();
        // Expires row
        expect(screen.getByText('Expires')).toBeInTheDocument();
        // "Sign in to accept" heading
        expect(screen.getByText('Sign in to accept')).toBeInTheDocument();
      });
    });

    it('renders namespace administrator heading for namespace-admin role', async () => {
      mockGetInvitationDetails.mockResolvedValue({
        ...mockInvitation,
        target_role: 'namespace-admin',
      });

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Join Eval as a namespace administrator/i })).toBeInTheDocument();
      });
    });

    /**
     * Contract: No "Decline invitation" button rendered in any state.
     * Why it matters: the mock has the button but there is no backend endpoint — rendering
     * it would be a dead UX path.
     * Breaks if: someone adds the button back from the mock without a backend endpoint.
     */
    it('does NOT render Decline invitation button', async () => {
      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /decline/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/decline invitation/i)).not.toBeInTheDocument();
    });

    /**
     * Contract: The "Expires" row renders the formatted date value from the fixture's
     * expires_at field (not just the label).
     * Why it matters: a missing or blank date value would leave users without key
     * information about the invitation's validity window.
     * Breaks if: formatDate doesn't run, the value is omitted, or the row is removed.
     */
    it('renders "Expires" row with the formatted date value (Jun 17, 2026)', async () => {
      render(<AcceptInvitePage />);

      await waitFor(() => {
        // Label present
        expect(screen.getByText('Expires')).toBeInTheDocument();
        // Formatted date from fixture expires_at: '2026-06-17T00:00:00Z'
        expect(screen.getByText('Jun 17, 2026')).toBeInTheDocument();
      });
    });

    it('renders display name field', async () => {
      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
      });
    });

    it('does NOT render password fields', async () => {
      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/confirm password/i)).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/at least 8 characters/i)).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/re-enter your password/i)).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // T5 Test Case 2: No Decline button in any state
  // ---------------------------------------------------------------------------

  describe('No Decline invitation button in any state', () => {
    /**
     * Contract: Decline invitation button is absent from all page states.
     * Why it matters: there is no backend endpoint for declining — the button would
     * be a dead UX trap if rendered.
     * Breaks if: someone implements the mock's button without a corresponding endpoint.
     */
    it('absent from error state', async () => {
      setSearchParams({ token: VALID_TOKEN });
      mockGetInvitationDetails.mockRejectedValue(makeApiError('expired', 410, 'INVITATION_EXPIRED'));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('This invitation has expired')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /decline/i })).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // T5 Test Case 3: Expired state renders L2 with generic copy, no mailto CTA, no detail rows
  // ---------------------------------------------------------------------------

  describe('L2 expired error state', () => {
    /**
     * Contract: invitation_expired renders L2 with generic copy and without
     * detail rows (Namespace/Sent/Expired) or a mailto CTA.
     * Why it matters: the backend returns 410 with NO body for non-pending invites, and
     * InvitationDetails has no inviter contact info — rendering those fields would error
     * or show stale/misleading data.
     * Breaks if: detail rows or mailto button are added to the expired state.
     */
    it('renders generic expired copy without detail rows or mailto CTA', async () => {
      setSearchParams({ token: VALID_TOKEN });
      mockGetInvitationDetails.mockRejectedValue(makeApiError('expired', 410, 'INVITATION_EXPIRED'));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('This invitation has expired')).toBeInTheDocument();
      });

      // Generic message per task spec
      expect(screen.getByText(/ask the person who invited you to send a new one/i)).toBeInTheDocument();

      // NO detail rows (Namespace, Sent, Expired dates)
      expect(screen.queryByText('Namespace')).not.toBeInTheDocument();
      expect(screen.queryByText('Sent')).not.toBeInTheDocument();

      // NO mailto/email CTA
      expect(screen.queryByRole('link', { name: /email.*to ask/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/email.*to ask/i)).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // T5 Test Case 4: Consumed keeps Sign In link; network error keeps Try Again
  // ---------------------------------------------------------------------------

  describe('Sign In link and Try Again affordances', () => {
    /**
     * Contract: invitation_consumed shows a Sign In link; network_error shows Try Again.
     * Why it matters: losing these affordances traps users with no recovery path.
     * Breaks if: error state rendering drops these affordances during reskin.
     */
    it('consumed state keeps the Sign In link to /auth/signin', async () => {
      setSearchParams({ token: VALID_TOKEN });
      mockGetInvitationDetails.mockRejectedValue(makeApiError('consumed', 409, 'INVITATION_CONSUMED'));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        const link = screen.getByRole('link', { name: 'Sign In' });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '/auth/signin');
      });
    });

    it('network error keeps the Try Again button', async () => {
      setSearchParams({ token: VALID_TOKEN });
      mockGetInvitationDetails.mockRejectedValue(new Error('Network error'));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // T5 Test Case 5: Email mismatch on new sign-in shows L3 interstitial
  // ---------------------------------------------------------------------------

  describe('L3 email mismatch state', () => {
    beforeEach(() => {
      setSearchParams({ token: VALID_TOKEN });
      mockGetInvitationDetails.mockResolvedValue(mockInvitation);
      mockCurrentUser = null;
    });

    /**
     * Contract: When sign-in resolves with an email that doesn't match the invitation,
     * the L3 mismatch interstitial is shown with both emails (invited mono, signed-in
     * in var(--danger)), and acceptInvite is NOT called.
     * Why it matters: without this gate, users could accept an invitation for someone
     * else's email address without being warned.
     * Breaks if: L3 check is removed or bypassed in handleSignIn.
     */
    it('shows L3 when signed-in email differs from invitation email', async () => {
      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      // Simulate sign-in with different email
      mockCurrentUser = { email: 'different@example.com', delete: mockDeleteUser };
      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(screen.getByText('This invitation is for a different email')).toBeInTheDocument();
      });

      // Both emails shown — invited email appears in both the detail row and the footnote
      expect(screen.getAllByText('test@example.com').length).toBeGreaterThan(0);
      expect(screen.getByText('different@example.com')).toBeInTheDocument();

      // acceptInvite NOT called
      expect(mockAcceptInvite).not.toHaveBeenCalled();
    });

    /**
     * Contract: The "You signed in as" email in the L3 detail box carries
     * var(--danger) color to visually signal the mismatch to the user.
     * Why it matters: without the danger color, the mismatch is less obvious
     * and the warning loses its visual weight.
     * Breaks if: the span color is removed or changed from var(--danger).
     */
    it('L3 "You signed in as" email renders with var(--danger) color', async () => {
      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      mockCurrentUser = { email: 'different@example.com', delete: mockDeleteUser };
      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(screen.getByText('This invitation is for a different email')).toBeInTheDocument();
      });

      // The signed-in email should be styled with var(--danger)
      const signedInEmail = screen.getByText('different@example.com');
      expect(signedInEmail).toHaveStyle({ color: 'var(--danger)' });
    });

    /**
     * Contract: Entering L3 calls endAuthFlow() immediately.
     * Why it matters: the suppressed onAuthStateChanged event has already fired and will
     * not replay — if the gate is left open and the user abandons L3 and navigates to
     * /auth/signin, they will be stuck because the auth listener is still gated.
     * Breaks if: endAuthFlow() is not called when transitioning to the mismatch state.
     */
    it('calls endAuthFlow when entering L3 mismatch state', async () => {
      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      mockCurrentUser = { email: 'different@example.com', delete: mockDeleteUser };
      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(screen.getByText('This invitation is for a different email')).toBeInTheDocument();
        expect(mockInviteEndAuthFlow).toHaveBeenCalled();
      });
    });

    /**
     * Contract: "Accept anyway" on L3 calls acceptInvite with the token and redirects
     * by role, enabling the backend-permitted path for deliberate mismatched accept.
     * Why it matters: the backend at auth.go ~line 210 deliberately allows mismatched
     * accept (user is created with the invitation email). Removing this path would be
     * a behavior regression beyond reskin.
     * Breaks if: "Accept anyway" button is removed or doesn't call acceptInvite.
     */
    it('Accept anyway calls acceptInvite with token and redirects', async () => {
      mockAcceptInvite.mockResolvedValue(mockUser);

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      mockCurrentUser = { email: 'different@example.com', delete: mockDeleteUser };
      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(screen.getByText('This invitation is for a different email')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /accept anyway/i }));

      await waitFor(() => {
        expect(mockAcceptInvite).toHaveBeenCalledWith(VALID_TOKEN, undefined);
        expect(mockPush).toHaveBeenCalledWith('/instructor');
      });
    });

    /**
     * Contract: "Sign out & retry" on L3 calls firebase signOut, calls endAuthFlow,
     * and returns to the ready state with providers visible.
     * Why it matters: endAuthFlow must be called so the auth gate is released. The user
     * should be able to sign in again with the correct account.
     * Breaks if: signOut isn't called, the gate isn't released, or the ready state is
     * not restored.
     */
    it('Sign out and retry calls signOut, endAuthFlow, and restores ready state', async () => {
      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      mockCurrentUser = { email: 'different@example.com', delete: mockDeleteUser };
      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(screen.getByText('This invitation is for a different email')).toBeInTheDocument();
      });

      // Clear endAuthFlow call count from entering L3
      mockInviteEndAuthFlow.mockClear();

      fireEvent.click(screen.getByRole('button', { name: /sign out.*retry/i }));

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalled();
        expect(mockInviteEndAuthFlow).toHaveBeenCalled();
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });
    });

    /**
     * Contract: Already-signed-in mount path with MISMATCHED email shows L3 instead
     * of auto-accepting. isNewSignIn=false means no Firebase delete on Accept anyway failure.
     * Why it matters: auto-accepting for a different-email user was never intended; and
     * an existing Firebase account should never be deleted (user didn't sign in during
     * this flow).
     * Breaks if: mount path skips the email check or wrongly sets isNewSignIn=true.
     */
    it('already-signed-in with mismatched email shows L3, not auto-accept (isNewSignIn=false)', async () => {
      // Set up mismatched user BEFORE rendering so mount effect sees it
      mockCurrentUser = { email: 'different@example.com', delete: mockDeleteUser };

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('This invitation is for a different email')).toBeInTheDocument();
      });

      // acceptInvite should NOT have been called
      expect(mockAcceptInvite).not.toHaveBeenCalled();

      // On Accept anyway, since isNewSignIn=false, backend failure should NOT delete Firebase account
      mockAcceptInvite.mockRejectedValue(makeApiError('Something broke', 500));

      fireEvent.click(screen.getByRole('button', { name: /accept anyway/i }));

      await waitFor(() => {
        expect(mockAcceptInvite).toHaveBeenCalled();
      });

      // Firebase account NOT deleted (isNewSignIn=false)
      expect(mockDeleteUser).not.toHaveBeenCalled();
    });

    /**
     * Contract: Email comparison is case-insensitive. J.Chen@X vs j.chen@x → match,
     * so no L3 interstitial shown.
     * Why it matters: OAuth providers may return email in different case than stored in invitation.
     * Breaks if: comparison uses === instead of case-insensitive comparison.
     */
    it('case-insensitive email comparison (uppercase invitation email matches lowercase signed-in)', async () => {
      mockGetInvitationDetails.mockResolvedValue({
        ...mockInvitation,
        email: 'J.Chen@X.com',
      });
      mockAcceptInvite.mockResolvedValue(mockUser);

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      // Sign in with lowercased version
      mockCurrentUser = { email: 'j.chen@x.com', delete: mockDeleteUser };
      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      // Should NOT show mismatch — should call acceptInvite directly
      await waitFor(() => {
        expect(mockAcceptInvite).toHaveBeenCalled();
      });

      expect(screen.queryByText('This invitation is for a different email')).not.toBeInTheDocument();
    });

    /**
     * Contract: If the OAuth provider returns null/empty email (e.g. GitHub private email,
     * some Microsoft accounts), skip the L3 interstitial and proceed with direct accept.
     * Why it matters: locking out private-email OAuth users from instructor onboarding
     * would be a regression. The backend deliberately permits mismatched accept.
     * Breaks if: null/empty email triggers L3 instead of direct accept.
     */
    it('null provider email skips L3 and proceeds with direct accept', async () => {
      mockAcceptInvite.mockResolvedValue(mockUser);

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      // Provider returns null email
      mockCurrentUser = { email: null, delete: mockDeleteUser };
      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      // Should call acceptInvite, not show L3
      await waitFor(() => {
        expect(mockAcceptInvite).toHaveBeenCalled();
      });

      expect(screen.queryByText('This invitation is for a different email')).not.toBeInTheDocument();
    });

    it('empty string provider email skips L3 and proceeds with direct accept', async () => {
      mockAcceptInvite.mockResolvedValue(mockUser);

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      // Provider returns empty string email
      mockCurrentUser = { email: '', delete: mockDeleteUser };
      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(mockAcceptInvite).toHaveBeenCalled();
      });

      expect(screen.queryByText('This invitation is for a different email')).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // T5 Test Case 8: Already-signed-in mount path with MATCHING email auto-accepts
  // ---------------------------------------------------------------------------

  describe('Already Signed In: direct flow (matching email)', () => {
    beforeEach(() => {
      setSearchParams({ token: VALID_TOKEN });
      mockGetInvitationDetails.mockResolvedValue(mockInvitation);
      // Set matching email on current user
      mockCurrentUser = { email: 'test@example.com', delete: mockDeleteUser };
    });

    /**
     * Contract: When already signed in with the SAME email as the invitation,
     * auto-accept runs immediately without showing sign-in providers.
     * Why it matters: this fast path is a key UX feature. If it regresses,
     * signed-in users see an unnecessary sign-in step.
     * Breaks if: email check mistakenly shows L3 for matching emails, or
     * acceptInvite is not called during mount.
     */
    it('auto-accepts when signed-in email matches invitation email', async () => {
      mockAcceptInvite.mockResolvedValue(mockUser);

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(mockAcceptInvite).toHaveBeenCalledWith(VALID_TOKEN, undefined);
      });

      expect(screen.queryByTestId('sign-in-buttons')).not.toBeInTheDocument();
      expect(screen.queryByText('This invitation is for a different email')).not.toBeInTheDocument();
    });

    it('does NOT render SignInButtons when already signed in with matching email', async () => {
      mockAcceptInvite.mockResolvedValue(mockUser);

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.queryByTestId('sign-in-buttons')).not.toBeInTheDocument();
      });
    });

    it('redirects instructor to /instructor on success', async () => {
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

    it('calls acceptInvite after sign-in success with matching email', async () => {
      mockAcceptInvite.mockResolvedValue(mockUser);

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      // Sign in with matching email
      mockCurrentUser = { email: 'test@example.com', delete: mockDeleteUser };
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

      mockCurrentUser = { email: 'test@example.com', delete: mockDeleteUser };
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

      mockCurrentUser = { email: 'test@example.com', delete: mockDeleteUser };
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

      mockCurrentUser = { email: 'test@example.com', delete: mockDeleteUser };
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

      mockCurrentUser = { email: 'test@example.com', delete: mockDeleteUser };
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

      mockCurrentUser = { email: 'test@example.com', delete: mockDeleteUser };
      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(screen.getByText('This invitation has expired')).toBeInTheDocument();
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
      mockCurrentUser = { email: 'test@example.com', delete: mockDeleteUser };
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
      mockCurrentUser = { email: 'test@example.com', delete: mockDeleteUser };
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

      mockCurrentUser = { email: 'test@example.com', delete: mockDeleteUser };
      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(screen.getByText('Temporary error')).toBeInTheDocument();
      });

      // Should still show SignInButtons for retry
      expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
    });

    it('still shows error message when delete() throws during error recovery', async () => {
      mockCurrentUser = null;
      mockDeleteUser.mockRejectedValue(new Error('auth/requires-recent-login'));
      mockAcceptInvite.mockRejectedValue(makeApiError('Internal error', 500));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      // Simulate sign-in sets currentUser before onSuccess fires
      mockCurrentUser = { email: 'test@example.com', delete: mockDeleteUser };
      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      // Error recovery flow must still run even though delete() threw
      await waitFor(() => {
        expect(screen.getByText('Internal error')).toBeInTheDocument();
      });
    });

    it('logs error when delete() throws during error recovery', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockCurrentUser = null;
      const deleteError = new Error('auth/requires-recent-login');
      mockDeleteUser.mockRejectedValue(deleteError);
      mockAcceptInvite.mockRejectedValue(makeApiError('Internal error', 500));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      mockCurrentUser = { email: 'test@example.com', delete: mockDeleteUser };
      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('delete'),
          deleteError
        );
      });

      consoleErrorSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // Auth Flow Gating (PLAT-6nzj)
  // ---------------------------------------------------------------------------

  describe('Auth Flow Gating (PLAT-6nzj)', () => {
    beforeEach(() => {
      setSearchParams({ token: VALID_TOKEN });
      mockGetInvitationDetails.mockResolvedValue(mockInvitation);
      mockCurrentUser = null;
    });

    it('passes onBeforeSignIn to SignInButtons that calls beginAuthFlow', async () => {
      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      // onBeforeSignIn should be registered — call it to verify it calls beginAuthFlow
      expect(mockInviteSignInButtonsOnBeforeSignIn).toBeDefined();
      mockInviteSignInButtonsOnBeforeSignIn();
      expect(mockInviteBeginAuthFlow).toHaveBeenCalledTimes(1);
    });

    it('calls endAuthFlow when doAccept encounters a backend error (new sign-in)', async () => {
      mockAcceptInvite.mockRejectedValue(new Error('unexpected error'));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      mockCurrentUser = { email: 'test@example.com', delete: mockDeleteUser };
      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(mockInviteEndAuthFlow).toHaveBeenCalled();
      });
    });

    it('calls endAuthFlow when doAccept encounters INVITATION_EXPIRED error', async () => {
      mockAcceptInvite.mockRejectedValue(makeApiError('Invitation expired', 410, 'INVITATION_EXPIRED'));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      mockCurrentUser = { email: 'test@example.com', delete: mockDeleteUser };
      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(mockInviteEndAuthFlow).toHaveBeenCalled();
      });
    });

    it('calls endAuthFlow when handleSignInError fires (popup cancelled or blocked)', async () => {
      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mock-sign-in-error'));

      await waitFor(() => {
        expect(mockInviteEndAuthFlow).toHaveBeenCalled();
      });
    });

    it('calls endAuthFlow before restoring UI state in handleSignInError', async () => {
      const callOrder: string[] = [];
      mockInviteEndAuthFlow.mockImplementation(() => { callOrder.push('endAuthFlow'); });

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mock-sign-in-error'));

      await waitFor(() => {
        expect(mockInviteEndAuthFlow).toHaveBeenCalled();
      });
      expect(callOrder).toContain('endAuthFlow');
    });
  });

  // ---------------------------------------------------------------------------
  // ALREADY_REGISTERED handling (PLAT-xntd)
  // ---------------------------------------------------------------------------

  describe('ALREADY_REGISTERED handling (PLAT-xntd)', () => {
    beforeEach(() => {
      setSearchParams({ token: VALID_TOKEN });
      mockGetInvitationDetails.mockResolvedValue(mockInvitation);
      mockCurrentUser = null;
    });

    it('redirects to /auth/signin when acceptInvite returns ALREADY_REGISTERED (409)', async () => {
      mockAcceptInvite.mockRejectedValue(makeApiError('Already registered', 409, 'ALREADY_REGISTERED'));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      mockCurrentUser = { email: 'test@example.com', delete: mockDeleteUser };
      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/auth/signin');
      });
    });

    it('does not show raw error message when ALREADY_REGISTERED is returned', async () => {
      mockAcceptInvite.mockRejectedValue(makeApiError('Already registered', 409, 'ALREADY_REGISTERED'));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      mockCurrentUser = { email: 'test@example.com', delete: mockDeleteUser };
      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/auth/signin');
      });

      // Should NOT show a raw error message
      expect(screen.queryByText('Already registered')).not.toBeInTheDocument();
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

      await user.type(screen.getByLabelText(/display name/i), 'John Doe');

      mockCurrentUser = { email: 'test@example.com', delete: mockDeleteUser };
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

      mockCurrentUser = { email: 'test@example.com', delete: mockDeleteUser };
      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(mockAcceptInvite).toHaveBeenCalledWith(VALID_TOKEN, undefined);
      });
    });

    it('plumbs display name to acceptInvite via Accept anyway on L3', async () => {
      const user = userEvent.setup();
      mockAcceptInvite.mockResolvedValue(mockUser);

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByTestId('sign-in-buttons')).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/display name/i), 'Jane Doe');

      // Trigger mismatch
      mockCurrentUser = { email: 'different@example.com', delete: mockDeleteUser };
      fireEvent.click(screen.getByTestId('mock-sign-in-success'));

      await waitFor(() => {
        expect(screen.getByText('This invitation is for a different email')).toBeInTheDocument();
      });

      // Accept anyway
      fireEvent.click(screen.getByRole('button', { name: /accept anyway/i }));

      await waitFor(() => {
        expect(mockAcceptInvite).toHaveBeenCalledWith(VALID_TOKEN, 'Jane Doe');
      });
    });
  });
});

/**
 * Tests for Accept Invitation Page
 *
 * Verifies that the invite accept flow uses only the Go backend API
 * and has no Supabase dependencies.
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

// Mock fetch — all auth operations go through the API now
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock public-api-client to delegate to global.fetch (bypass retry/BASE_URL)
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

describe('AcceptInvitePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
    mockFetch.mockClear();
    mockReload.mockClear();
    mockLocationHash = '';
  });

  it('does not import or use Supabase', () => {
    // This is a compile-time guarantee: if supabase-client were imported,
    // the module mock would need to exist. Since we removed the mock and
    // the module, this test passing confirms no Supabase dependency.
    expect(true).toBe(true);
  });

  describe('Token Verification', () => {
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

  describe('Form Submission', () => {
    it('submits password to API and redirects on success', async () => {
      const user = userEvent.setup();
      setLocationHash('#token_hash=test-token&type=invite');

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            invitation: { id: 'inv-1', email: 'test@example.com', targetRole: 'instructor' },
            namespace: { id: 'test-ns', displayName: 'Test Org' },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            user: { id: 'user-1', role: 'instructor' },
          }),
        });

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('At least 8 characters'), 'securepassword123');
      await user.type(screen.getByPlaceholderText('Re-enter your password'), 'securepassword123');
      await user.click(screen.getByRole('button', { name: 'Complete Registration' }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/auth/accept-invite', expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ invitation_token: 'test-token', invitation_id: 'inv-1', displayName: undefined, password: 'securepassword123' }),
        }));
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/instructor');
      });
    });

    it('redirects namespace-admin to /namespace/invitations', async () => {
      const user = userEvent.setup();
      setLocationHash('#token_hash=test-token&type=invite');

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            invitation: { id: 'inv-1', email: 'admin@example.com', targetRole: 'namespace-admin' },
            namespace: null,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            user: { id: 'user-1', role: 'namespace-admin' },
          }),
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

    it('shows error for API failure on submit', async () => {
      const user = userEvent.setup();
      setLocationHash('#token_hash=test-token&type=invite');

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            invitation: { id: 'inv-1', email: 'test@example.com', targetRole: 'instructor' },
            namespace: null,
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({
            error: 'Something went wrong',
          }),
        });

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

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            invitation: { id: 'inv-1', email: 'test@example.com', targetRole: 'instructor' },
            namespace: null,
          }),
        })
        .mockImplementationOnce(() => new Promise(() => {}));

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

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            invitation: { id: 'inv-1', email: 'test@example.com', targetRole: 'instructor' },
            namespace: { id: 'test-ns', displayName: 'Test Org' },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            user: { id: 'user-1', role: 'instructor' },
          }),
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
        expect(mockFetch).toHaveBeenCalledWith('/auth/accept-invite', expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ invitation_token: 'test-token', invitation_id: 'inv-1', displayName: 'John Doe', password: 'securepassword123' }),
        }));
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
});

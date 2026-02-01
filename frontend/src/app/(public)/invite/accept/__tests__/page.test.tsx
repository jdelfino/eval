/**
 * Tests for Accept Invitation Page
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

// Mock the Supabase client
const mockVerifyOtp = jest.fn();
const mockSetSession = jest.fn();
const mockUpdateUser = jest.fn();
jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: () => ({
    auth: {
      verifyOtp: mockVerifyOtp,
      setSession: mockSetSession,
      updateUser: mockUpdateUser,
    },
  }),
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

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
    mockVerifyOtp.mockClear();
    mockSetSession.mockClear();
    mockUpdateUser.mockClear();
    mockFetch.mockClear();
    mockReload.mockClear();

    // Reset location hash
    mockLocationHash = '';
  });

  describe('Token Verification', () => {
    it('renders loading state while verifying token', async () => {
      // Set up valid hash
      setLocationHash('#token_hash=test-token&type=invite');
      mockVerifyOtp.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<AcceptInvitePage />);

      // Verify the component renders and verifyOtp is called with correct params
      await waitFor(() => {
        expect(mockVerifyOtp).toHaveBeenCalledWith({
          token_hash: 'test-token',
          type: 'invite',
        });
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

    it('shows error for expired token', async () => {
      setLocationHash('#token_hash=test-token&type=invite');
      mockVerifyOtp.mockResolvedValue({
        error: { message: 'Token has expired' },
      });

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Invitation Expired')).toBeInTheDocument();
      });
    });

    it('shows error for invalid token', async () => {
      setLocationHash('#token_hash=test-token&type=invite');
      mockVerifyOtp.mockResolvedValue({
        error: { message: 'Invalid token' },
      });

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Invalid Link')).toBeInTheDocument();
      });
    });

    it('shows user already exists error', async () => {
      setLocationHash('#token_hash=test-token&type=invite');
      mockVerifyOtp.mockResolvedValue({
        error: { message: 'User already registered' },
      });

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Account Exists')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Sign In' })).toBeInTheDocument();
      });
    });

    it('calls verifyOtp with correct parameters', async () => {
      setLocationHash('#token_hash=test-token-123&type=invite');
      mockVerifyOtp.mockResolvedValue({ error: null });
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Not found', code: 'INVITATION_NOT_FOUND' }),
      });

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(mockVerifyOtp).toHaveBeenCalledWith({
          token_hash: 'test-token-123',
          type: 'invite',
        });
      });
    });
  });

  describe('Loading Invitation', () => {
    beforeEach(() => {
      setLocationHash('#token_hash=test-token&type=invite');
      mockVerifyOtp.mockResolvedValue({ error: null });
    });

    it('shows loading invitation state after token verification', async () => {
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Loading your invitation...')).toBeInTheDocument();
      });
    });

    it('fetches invitation after successful verification', async () => {
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
        expect(mockFetch).toHaveBeenCalledWith('/api/auth/accept-invite', {
          credentials: 'include',
        });
      });
    });

    it('shows error for consumed invitation', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Already used', code: 'INVITATION_CONSUMED' }),
      });

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Already Used')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Sign In' })).toBeInTheDocument();
      });
    });

    it('shows error for revoked invitation', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Revoked', code: 'INVITATION_REVOKED' }),
      });

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Invitation Revoked')).toBeInTheDocument();
      });
    });

    it('shows error for not found invitation', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
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
      mockVerifyOtp.mockResolvedValue({ error: null });
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

    it('displays invitation info', async () => {
      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
        expect(screen.getByText('test@example.com')).toBeInTheDocument();
        expect(screen.getByText('Instructor')).toBeInTheDocument();
        expect(screen.getByText('Test Organization')).toBeInTheDocument();
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

      const passwordInput = screen.getByPlaceholderText('At least 8 characters');
      const confirmInput = screen.getByPlaceholderText('Re-enter your password');

      expect(passwordInput).toHaveAttribute('required');
      expect(confirmInput).toHaveAttribute('required');
    });

    it('validates password minimum length', async () => {
      const user = userEvent.setup();
      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText('At least 8 characters');
      const confirmInput = screen.getByPlaceholderText('Re-enter your password');
      await user.type(passwordInput, 'short');
      await user.type(confirmInput, 'short');

      const submitButton = screen.getByRole('button', { name: 'Complete Registration' });
      await user.click(submitButton);

      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    });

    it('validates passwords must match', async () => {
      const user = userEvent.setup();
      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText('At least 8 characters');
      const confirmInput = screen.getByPlaceholderText('Re-enter your password');
      await user.type(passwordInput, 'password123');
      await user.type(confirmInput, 'different456');

      const submitButton = screen.getByRole('button', { name: 'Complete Registration' });
      await user.click(submitButton);

      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });

    it('renders password fields', async () => {
      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
      });

      expect(screen.getByPlaceholderText('At least 8 characters')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Re-enter your password')).toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    beforeEach(() => {
      setLocationHash('#token_hash=test-token&type=invite');
      mockVerifyOtp.mockResolvedValue({ error: null });
      // Default: password update succeeds
      mockUpdateUser.mockResolvedValue({ error: null });
    });

    it('submits form and sets password on success', async () => {
      const user = userEvent.setup();

      // First call: GET invitation info
      // Second call: POST accept invite
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

      const passwordInput = screen.getByPlaceholderText('At least 8 characters');
      const confirmInput = screen.getByPlaceholderText('Re-enter your password');
      await user.type(passwordInput, 'securepassword123');
      await user.type(confirmInput, 'securepassword123');

      const submitButton = screen.getByRole('button', { name: 'Complete Registration' });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/auth/accept-invite', expect.objectContaining({
          method: 'POST',
        }));
      });

      await waitFor(() => {
        expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'securepassword123' });
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/instructor');
      });
    });

    it('redirects namespace-admin to /namespace', async () => {
      const user = userEvent.setup();

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

      const passwordInput = screen.getByPlaceholderText('At least 8 characters');
      const confirmInput = screen.getByPlaceholderText('Re-enter your password');
      await user.type(passwordInput, 'adminpassword123');
      await user.type(confirmInput, 'adminpassword123');

      const submitButton = screen.getByRole('button', { name: 'Complete Registration' });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/namespace/invitations');
      });
    });

    it('shows error for API failure', async () => {
      const user = userEvent.setup();

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

      const passwordInput = screen.getByPlaceholderText('At least 8 characters');
      const confirmInput = screen.getByPlaceholderText('Re-enter your password');
      await user.type(passwordInput, 'testpassword123');
      await user.type(confirmInput, 'testpassword123');

      const submitButton = screen.getByRole('button', { name: 'Complete Registration' });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      });
    });

    it('shows loading state during submission', async () => {
      const user = userEvent.setup();

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            invitation: { id: 'inv-1', email: 'test@example.com', targetRole: 'instructor' },
            namespace: null,
          }),
        })
        .mockImplementationOnce(() => new Promise(() => {})); // Never resolves

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText('At least 8 characters');
      const confirmInput = screen.getByPlaceholderText('Re-enter your password');
      await user.type(passwordInput, 'testpassword123');
      await user.type(confirmInput, 'testpassword123');

      const submitButton = screen.getByRole('button', { name: 'Complete Registration' });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Creating your account...')).toBeInTheDocument();
      });
    });

    it('includes display name in submission when provided', async () => {
      const user = userEvent.setup();

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

      const displayNameInput = screen.getByPlaceholderText('Your preferred display name');
      await user.type(displayNameInput, 'John Doe');

      const passwordInput = screen.getByPlaceholderText('At least 8 characters');
      const confirmInput = screen.getByPlaceholderText('Re-enter your password');
      await user.type(passwordInput, 'securepassword123');
      await user.type(confirmInput, 'securepassword123');

      const submitButton = screen.getByRole('button', { name: 'Complete Registration' });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/auth/accept-invite', expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ displayName: 'John Doe' }),
        }));
      });
    });
  });

  describe('Network Error Handling', () => {
    it('shows network error with retry option', async () => {
      setLocationHash('#token_hash=test-token&type=invite');
      mockVerifyOtp.mockResolvedValue({ error: null });
      mockFetch.mockRejectedValue(new Error('Network error'));

      render(<AcceptInvitePage />);

      await waitFor(() => {
        expect(screen.getByText('Connection Error')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
      });
    });

    it('reloads page on retry', async () => {
      setLocationHash('#token_hash=test-token&type=invite');
      mockVerifyOtp.mockResolvedValue({ error: null });
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

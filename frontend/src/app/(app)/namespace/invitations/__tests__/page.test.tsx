/**
 * Tests for Namespace Invitations Page
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import InvitationsPage from '../page';
import { useAuth } from '@/contexts/AuthContext';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock AuthContext
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

// Mock ProtectedRoute to just render children
jest.mock('@/components/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock InvitationList component
jest.mock('@/components/InvitationList', () => ({
  __esModule: true,
  default: ({ invitations, loading, onRevoke, onResend, emptyMessage }: {
    invitations: { id: string; email: string; status?: string }[];
    loading: boolean;
    onRevoke: (id: string) => void;
    onResend: (id: string) => void;
    emptyMessage?: string;
  }) => (
    <div data-testid="invitation-list">
      {loading && <div>Loading invitations...</div>}
      {!loading && invitations.length === 0 && <div>{emptyMessage}</div>}
      {!loading && invitations.map((inv) => (
        <div key={inv.id} data-testid={`invitation-${inv.id}`}>
          <span>{inv.email}</span>
          <span data-testid={`status-${inv.id}`}>{inv.status}</span>
          {inv.status === 'pending' && (
            <>
              <button onClick={() => onRevoke(inv.id)}>Revoke</button>
              <button onClick={() => onResend(inv.id)}>Resend</button>
            </>
          )}
        </div>
      ))}
    </div>
  ),
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('InvitationsPage', () => {
  const mockPush = jest.fn();

  const mockUser = {
    id: 'user-1',
    role: 'namespace-admin' as const,
    namespaceId: 'test-namespace',
  };

  const mockPendingInvitation = {
    id: 'inv-1',
    email: 'pending@example.com',
    targetRole: 'instructor',
    namespaceId: 'test-namespace',
    createdBy: 'user-1',
    createdAt: '2024-01-01T00:00:00Z',
    expiresAt: '2024-01-08T00:00:00Z',
    status: 'pending',
  };

  const mockConsumedInvitation = {
    id: 'inv-2',
    email: 'consumed@example.com',
    targetRole: 'instructor',
    namespaceId: 'test-namespace',
    createdBy: 'user-1',
    createdAt: '2024-01-01T00:00:00Z',
    expiresAt: '2024-01-08T00:00:00Z',
    consumedAt: '2024-01-02T00:00:00Z',
    status: 'consumed',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
    (useAuth as jest.Mock).mockReturnValue({ user: mockUser, isLoading: false });

    // Default: successful fetch with empty invitations
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ invitations: [] }),
    });
  });

  describe('Rendering', () => {
    it('renders page title', async () => {
      render(<InvitationsPage />);
      expect(screen.getByRole('heading', { name: /manage invitations/i })).toBeInTheDocument();
    });

    it('renders status filter dropdown', async () => {
      render(<InvitationsPage />);
      await waitFor(() => {
        expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
      });
    });

    it('renders invite button', async () => {
      render(<InvitationsPage />);
      expect(screen.getByRole('button', { name: /invite instructor/i })).toBeInTheDocument();
    });

    it('fetches invitations on mount', async () => {
      render(<InvitationsPage />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/namespace/invitations'),
          expect.objectContaining({ credentials: 'include' })
        );
      });
    });
  });

  describe('Invitations List', () => {
    it('displays invitations after load', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          invitations: [mockPendingInvitation, mockConsumedInvitation],
        }),
      });

      render(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByText('pending@example.com')).toBeInTheDocument();
        expect(screen.getByText('consumed@example.com')).toBeInTheDocument();
      });
    });

    it('shows empty state when no invitations', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ invitations: [] }),
      });

      render(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByText(/no invitations yet/i)).toBeInTheDocument();
      });
    });
  });

  describe('Status Filter', () => {
    it('filters invitations by status when dropdown changes', async () => {
      const user = userEvent.setup();

      render(<InvitationsPage />);

      // Wait for initial fetch
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      // Clear mock and change filter
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ invitations: [mockPendingInvitation] }),
      });

      const statusSelect = screen.getByLabelText(/status/i);
      await user.selectOptions(statusSelect, 'pending');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('status=pending'),
          expect.any(Object)
        );
      });
    });

    it('shows all invitations when "All Statuses" selected', async () => {
      const user = userEvent.setup();

      render(<InvitationsPage />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const statusSelect = screen.getByLabelText(/status/i);

      // Change to pending then back to all
      await user.selectOptions(statusSelect, 'pending');
      mockFetch.mockClear();

      await user.selectOptions(statusSelect, 'all');

      await waitFor(() => {
        // Should not include status param when "all" is selected
        expect(mockFetch).toHaveBeenCalledWith(
          expect.not.stringContaining('status='),
          expect.any(Object)
        );
      });
    });
  });

  describe('Create Invitation Form', () => {
    it('shows form when invite button clicked', async () => {
      const user = userEvent.setup();

      render(<InvitationsPage />);

      const inviteButton = screen.getByRole('button', { name: /invite instructor/i });
      await user.click(inviteButton);

      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/expires in/i)).toBeInTheDocument();
    });

    it('hides form when cancel clicked', async () => {
      const user = userEvent.setup();

      render(<InvitationsPage />);

      // Open form
      const inviteButton = screen.getByRole('button', { name: /invite instructor/i });
      await user.click(inviteButton);

      // Click the top Cancel button (toggles form)
      const cancelButtons = screen.getAllByRole('button', { name: /cancel/i });
      await user.click(cancelButtons[0]); // Top action bar cancel

      expect(screen.queryByLabelText(/email address/i)).not.toBeInTheDocument();
    });

    it('creates invitation on form submit', async () => {
      const user = userEvent.setup();

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ invitations: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ invitation: mockPendingInvitation }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ invitations: [mockPendingInvitation] }),
        });

      render(<InvitationsPage />);

      // Open form
      const inviteButton = screen.getByRole('button', { name: /invite instructor/i });
      await user.click(inviteButton);

      // Fill form
      const emailInput = screen.getByLabelText(/email address/i);
      await user.type(emailInput, 'new@example.com');

      // Submit
      const submitButton = screen.getByRole('button', { name: /send invitation/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/namespace/invitations',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ email: 'new@example.com', expiresInDays: 7 }),
          })
        );
      });
    });

    it('shows error for invalid email', async () => {
      const user = userEvent.setup();

      render(<InvitationsPage />);

      // Open form
      const inviteButton = screen.getByRole('button', { name: /invite instructor/i });
      await user.click(inviteButton);

      // Fill invalid email
      const emailInput = screen.getByLabelText(/email address/i);
      await user.type(emailInput, 'invalid-email');

      // Submit the form
      const form = emailInput.closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText(/valid email address/i)).toBeInTheDocument();
      });
    });

    it('shows success message after creating invitation', async () => {
      const user = userEvent.setup();

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ invitations: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ invitation: mockPendingInvitation }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ invitations: [mockPendingInvitation] }),
        });

      render(<InvitationsPage />);

      // Open form
      const inviteButton = screen.getByRole('button', { name: /invite instructor/i });
      await user.click(inviteButton);

      // Fill form
      const emailInput = screen.getByLabelText(/email address/i);
      await user.type(emailInput, 'new@example.com');

      // Submit
      const submitButton = screen.getByRole('button', { name: /send invitation/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/invitation sent/i)).toBeInTheDocument();
      });
    });

    it('shows API error on failure', async () => {
      const user = userEvent.setup();

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ invitations: [] }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ error: 'Duplicate invitation' }),
        });

      render(<InvitationsPage />);

      // Open form
      const inviteButton = screen.getByRole('button', { name: /invite instructor/i });
      await user.click(inviteButton);

      // Fill form
      const emailInput = screen.getByLabelText(/email address/i);
      await user.type(emailInput, 'existing@example.com');

      // Submit
      const submitButton = screen.getByRole('button', { name: /send invitation/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/duplicate invitation/i)).toBeInTheDocument();
      });
    });
  });

  describe('Invitation Actions', () => {
    it('calls revoke handler', async () => {
      const user = userEvent.setup();

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ invitations: [mockPendingInvitation] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ invitation: { ...mockPendingInvitation, revokedAt: '2024-01-03T00:00:00Z' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ invitations: [] }),
        });

      render(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByText('pending@example.com')).toBeInTheDocument();
      });

      const revokeButton = screen.getByRole('button', { name: /revoke/i });
      await user.click(revokeButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/namespace/invitations/inv-1',
          expect.objectContaining({ method: 'DELETE' })
        );
      });
    });

    it('calls resend handler', async () => {
      const user = userEvent.setup();

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ invitations: [mockPendingInvitation] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ invitation: mockPendingInvitation }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ invitations: [mockPendingInvitation] }),
        });

      render(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByText('pending@example.com')).toBeInTheDocument();
      });

      const resendButton = screen.getByRole('button', { name: /resend/i });
      await user.click(resendButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/namespace/invitations/inv-1/resend',
          expect.objectContaining({ method: 'POST' })
        );
      });
    });
  });

  describe('Error States', () => {
    it('displays fetch error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Failed to load invitations' }),
      });

      render(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByText(/failed to load invitations/i)).toBeInTheDocument();
      });
    });

    it('allows dismissing error', async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Some error' }),
      });

      render(<InvitationsPage />);

      await waitFor(() => {
        expect(screen.getByText(/some error/i)).toBeInTheDocument();
      });

      // Find and click dismiss button (Alert component)
      const dismissButton = screen.getByRole('button', { name: /dismiss/i });
      await user.click(dismissButton);

      expect(screen.queryByText(/some error/i)).not.toBeInTheDocument();
    });
  });

  describe('Auth Loading', () => {
    it('shows loading when auth is loading', () => {
      (useAuth as jest.Mock).mockReturnValue({ user: null, isLoading: true });

      render(<InvitationsPage />);

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });
});

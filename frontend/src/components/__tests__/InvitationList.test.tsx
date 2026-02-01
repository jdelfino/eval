/**
 * Unit tests for InvitationList component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InvitationList, Invitation, NamespaceOption } from '../InvitationList';

// Mock invitation data - using dates far in the future to avoid test timing issues
const mockPendingInvitation: Invitation = {
  id: 'inv-1',
  email: 'pending@example.com',
  namespaceId: 'ns-1',
  targetRole: 'instructor',
  createdAt: '2026-01-15T10:00:00Z',
  expiresAt: '2027-02-15T10:00:00Z', // Far future - always pending
};

const mockConsumedInvitation: Invitation = {
  id: 'inv-2',
  email: 'consumed@example.com',
  namespaceId: 'ns-1',
  targetRole: 'namespace-admin',
  createdAt: '2026-01-10T10:00:00Z',
  expiresAt: '2027-02-10T10:00:00Z',
  consumedAt: '2026-01-12T10:00:00Z',
  consumedBy: 'user-1',
};

const mockRevokedInvitation: Invitation = {
  id: 'inv-3',
  email: 'revoked@example.com',
  namespaceId: 'ns-2',
  targetRole: 'instructor',
  createdAt: '2026-01-05T10:00:00Z',
  expiresAt: '2027-02-05T10:00:00Z',
  revokedAt: '2026-01-08T10:00:00Z',
};

const mockExpiredInvitation: Invitation = {
  id: 'inv-4',
  email: 'expired@example.com',
  namespaceId: 'ns-1',
  targetRole: 'instructor',
  createdAt: '2024-12-01T10:00:00Z',
  expiresAt: '2024-12-15T10:00:00Z', // Already expired
};

const mockNamespaces: NamespaceOption[] = [
  { id: 'ns-1', displayName: 'Test University' },
  { id: 'ns-2', displayName: 'Demo College' },
];

describe('InvitationList', () => {
  const defaultProps = {
    invitations: [] as Invitation[],
    loading: false,
    onRevoke: jest.fn(),
    onResend: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering states', () => {
    it('should render loading state when loading with no invitations', () => {
      render(<InvitationList {...defaultProps} loading={true} />);

      expect(screen.getByText('Loading invitations...')).toBeInTheDocument();
    });

    it('should render empty state when no invitations', () => {
      render(<InvitationList {...defaultProps} />);

      expect(screen.getByText('No invitations found')).toBeInTheDocument();
    });

    it('should render custom empty message', () => {
      render(
        <InvitationList
          {...defaultProps}
          emptyMessage="No pending invitations. Invite someone!"
        />
      );

      expect(
        screen.getByText('No pending invitations. Invite someone!')
      ).toBeInTheDocument();
    });

    it('should render invitations in a table', () => {
      render(
        <InvitationList
          {...defaultProps}
          invitations={[mockPendingInvitation]}
        />
      );

      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getByText('pending@example.com')).toBeInTheDocument();
    });
  });

  describe('table columns', () => {
    it('should show basic columns by default', () => {
      render(
        <InvitationList
          {...defaultProps}
          invitations={[mockPendingInvitation]}
        />
      );

      expect(screen.getByText('Email')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Created')).toBeInTheDocument();
      expect(screen.getByText('Expires')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });

    it('should not show namespace column by default', () => {
      render(
        <InvitationList
          {...defaultProps}
          invitations={[mockPendingInvitation]}
        />
      );

      expect(screen.queryByText('Namespace')).not.toBeInTheDocument();
    });

    it('should not show role column by default', () => {
      render(
        <InvitationList
          {...defaultProps}
          invitations={[mockPendingInvitation]}
        />
      );

      expect(screen.queryByText('Role')).not.toBeInTheDocument();
    });

    it('should show namespace column when showNamespace is true', () => {
      render(
        <InvitationList
          {...defaultProps}
          invitations={[mockPendingInvitation]}
          showNamespace
          namespaces={mockNamespaces}
        />
      );

      expect(screen.getByText('Namespace')).toBeInTheDocument();
      expect(screen.getByText('Test University')).toBeInTheDocument();
    });

    it('should show role column when showRole is true', () => {
      render(
        <InvitationList
          {...defaultProps}
          invitations={[mockPendingInvitation]}
          showRole
        />
      );

      expect(screen.getByText('Role')).toBeInTheDocument();
      expect(screen.getByText('Instructor')).toBeInTheDocument();
    });

    it('should show namespace-admin as Namespace Admin', () => {
      render(
        <InvitationList
          {...defaultProps}
          invitations={[mockConsumedInvitation]}
          showRole
        />
      );

      expect(screen.getByText('Namespace Admin')).toBeInTheDocument();
    });

    it('should fallback to namespace ID if namespace not found', () => {
      const unknownNamespaceInvitation = {
        ...mockPendingInvitation,
        namespaceId: 'unknown-ns',
      };

      render(
        <InvitationList
          {...defaultProps}
          invitations={[unknownNamespaceInvitation]}
          showNamespace
          namespaces={mockNamespaces}
        />
      );

      expect(screen.getByText('unknown-ns')).toBeInTheDocument();
    });
  });

  describe('status display', () => {
    it('should show Pending status for pending invitations', () => {
      render(
        <InvitationList
          {...defaultProps}
          invitations={[mockPendingInvitation]}
        />
      );

      expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    it('should show Accepted status for consumed invitations', () => {
      render(
        <InvitationList
          {...defaultProps}
          invitations={[mockConsumedInvitation]}
        />
      );

      expect(screen.getByText('Accepted')).toBeInTheDocument();
    });

    it('should show Revoked status for revoked invitations', () => {
      render(
        <InvitationList
          {...defaultProps}
          invitations={[mockRevokedInvitation]}
        />
      );

      expect(screen.getByText('Revoked')).toBeInTheDocument();
    });

    it('should show Expired status for expired invitations', () => {
      render(
        <InvitationList
          {...defaultProps}
          invitations={[mockExpiredInvitation]}
        />
      );

      expect(screen.getByText('Expired')).toBeInTheDocument();
    });

    it('should use status from invitation if provided', () => {
      const invitationWithStatus = {
        ...mockPendingInvitation,
        status: 'consumed' as const,
      };

      render(
        <InvitationList
          {...defaultProps}
          invitations={[invitationWithStatus]}
        />
      );

      expect(screen.getByText('Accepted')).toBeInTheDocument();
    });
  });

  describe('actions for pending invitations', () => {
    it('should show Resend and Revoke buttons for pending invitations', () => {
      render(
        <InvitationList
          {...defaultProps}
          invitations={[mockPendingInvitation]}
        />
      );

      expect(screen.getByText('Resend')).toBeInTheDocument();
      expect(screen.getByText('Revoke')).toBeInTheDocument();
    });

    it('should call onResend when Resend is clicked', async () => {
      const onResend = jest.fn().mockResolvedValue(undefined);

      render(
        <InvitationList
          {...defaultProps}
          invitations={[mockPendingInvitation]}
          onResend={onResend}
        />
      );

      fireEvent.click(screen.getByText('Resend'));

      await waitFor(() => {
        expect(onResend).toHaveBeenCalledWith('inv-1');
      });
    });

    it('should show confirmation before revoking', () => {
      render(
        <InvitationList
          {...defaultProps}
          invitations={[mockPendingInvitation]}
        />
      );

      fireEvent.click(screen.getByText('Revoke'));

      expect(screen.getByText('Confirm')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('should call onRevoke when Confirm is clicked', async () => {
      const onRevoke = jest.fn().mockResolvedValue(undefined);

      render(
        <InvitationList
          {...defaultProps}
          invitations={[mockPendingInvitation]}
          onRevoke={onRevoke}
        />
      );

      fireEvent.click(screen.getByText('Revoke'));
      fireEvent.click(screen.getByText('Confirm'));

      await waitFor(() => {
        expect(onRevoke).toHaveBeenCalledWith('inv-1');
      });
    });

    it('should cancel revocation when Cancel is clicked', () => {
      render(
        <InvitationList
          {...defaultProps}
          invitations={[mockPendingInvitation]}
        />
      );

      fireEvent.click(screen.getByText('Revoke'));
      expect(screen.getByText('Confirm')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Cancel'));

      expect(screen.queryByText('Confirm')).not.toBeInTheDocument();
      expect(screen.getByText('Revoke')).toBeInTheDocument();
    });
  });

  describe('actions for expired invitations', () => {
    it('should show only Resend button for expired invitations', () => {
      render(
        <InvitationList
          {...defaultProps}
          invitations={[mockExpiredInvitation]}
        />
      );

      expect(screen.getByText('Resend')).toBeInTheDocument();
      expect(screen.queryByText('Revoke')).not.toBeInTheDocument();
    });
  });

  describe('actions for consumed/revoked invitations', () => {
    it('should not show any actions for consumed invitations', () => {
      render(
        <InvitationList
          {...defaultProps}
          invitations={[mockConsumedInvitation]}
        />
      );

      expect(screen.queryByText('Resend')).not.toBeInTheDocument();
      expect(screen.queryByText('Revoke')).not.toBeInTheDocument();
    });

    it('should not show any actions for revoked invitations', () => {
      render(
        <InvitationList
          {...defaultProps}
          invitations={[mockRevokedInvitation]}
        />
      );

      expect(screen.queryByText('Resend')).not.toBeInTheDocument();
      expect(screen.queryByText('Revoke')).not.toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('should show error message when resend fails', async () => {
      const onResend = jest.fn().mockRejectedValue(new Error('Network error'));

      render(
        <InvitationList
          {...defaultProps}
          invitations={[mockPendingInvitation]}
          onResend={onResend}
        />
      );

      fireEvent.click(screen.getByText('Resend'));

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('should show error message when revoke fails', async () => {
      const onRevoke = jest.fn().mockRejectedValue(new Error('Permission denied'));

      render(
        <InvitationList
          {...defaultProps}
          invitations={[mockPendingInvitation]}
          onRevoke={onRevoke}
        />
      );

      fireEvent.click(screen.getByText('Revoke'));
      fireEvent.click(screen.getByText('Confirm'));

      await waitFor(() => {
        expect(screen.getByText('Permission denied')).toBeInTheDocument();
      });
    });

    it('should dismiss error when clicking the dismiss button', async () => {
      const onResend = jest.fn().mockRejectedValue(new Error('Network error'));

      render(
        <InvitationList
          {...defaultProps}
          invitations={[mockPendingInvitation]}
          onResend={onResend}
        />
      );

      fireEvent.click(screen.getByText('Resend'));

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText('Dismiss error'));

      expect(screen.queryByText('Network error')).not.toBeInTheDocument();
    });
  });

  describe('loading states for actions', () => {
    it('should show loading text when resending', async () => {
      const onResend = jest.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      render(
        <InvitationList
          {...defaultProps}
          invitations={[mockPendingInvitation]}
          onResend={onResend}
        />
      );

      fireEvent.click(screen.getByText('Resend'));

      expect(screen.getByText('Sending...')).toBeInTheDocument();
    });

    it('should show loading text when revoking', async () => {
      const onRevoke = jest.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      render(
        <InvitationList
          {...defaultProps}
          invitations={[mockPendingInvitation]}
          onRevoke={onRevoke}
        />
      );

      fireEvent.click(screen.getByText('Revoke'));
      fireEvent.click(screen.getByText('Confirm'));

      expect(screen.getByText('Revoking...')).toBeInTheDocument();
    });
  });

  describe('multiple invitations', () => {
    it('should render multiple invitations', () => {
      render(
        <InvitationList
          {...defaultProps}
          invitations={[
            mockPendingInvitation,
            mockConsumedInvitation,
            mockRevokedInvitation,
            mockExpiredInvitation,
          ]}
        />
      );

      expect(screen.getByText('pending@example.com')).toBeInTheDocument();
      expect(screen.getByText('consumed@example.com')).toBeInTheDocument();
      expect(screen.getByText('revoked@example.com')).toBeInTheDocument();
      expect(screen.getByText('expired@example.com')).toBeInTheDocument();
    });

    it('should show both namespace and role columns when both are enabled', () => {
      // Use invitations from different namespaces to test namespace resolution
      render(
        <InvitationList
          {...defaultProps}
          invitations={[mockPendingInvitation, mockRevokedInvitation]}
          showNamespace
          showRole
          namespaces={mockNamespaces}
        />
      );

      expect(screen.getByText('Namespace')).toBeInTheDocument();
      expect(screen.getByText('Role')).toBeInTheDocument();
      expect(screen.getByText('Test University')).toBeInTheDocument(); // ns-1
      expect(screen.getByText('Demo College')).toBeInTheDocument(); // ns-2
      expect(screen.getAllByText('Instructor')).toHaveLength(2); // Both are instructors
    });
  });
});

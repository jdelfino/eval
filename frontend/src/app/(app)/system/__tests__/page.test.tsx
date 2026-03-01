/**
 * Tests for System Admin Page with Invitations
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SystemAdminPage from '../page';
import * as systemApi from '@/lib/api/system';

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
const mockUser = {
  id: 'admin-1',
  role: 'system-admin' as const,
  namespace_id: null,
  permissions: ['system.admin', 'user.changeRole', 'content.manage', 'session.manage', 'session.join'],
};

const mockSignOut = jest.fn();
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    isLoading: false,
    signOut: mockSignOut,
  }),
}));

// Mock useNamespaces hook
const mockFetchNamespaces = jest.fn();
const mockCreateNamespace = jest.fn();
const mockUpdateNamespace = jest.fn();
const mockDeleteNamespace = jest.fn();

jest.mock('@/hooks/useNamespaces', () => ({
  useNamespaces: () => ({
    namespaces: [
      { id: 'ns-1', display_name: 'Test Org 1', active: true, userCount: 10 },
      { id: 'ns-2', display_name: 'Test Org 2', active: true, userCount: 5 },
    ],
    loading: false,
    error: null,
    fetchNamespaces: mockFetchNamespaces,
    createNamespace: mockCreateNamespace,
    updateNamespace: mockUpdateNamespace,
    deleteNamespace: mockDeleteNamespace,
  }),
}));

// Mock system API module
const mockListSystemInvitations = jest.fn();
const mockCreateSystemInvitation = jest.fn();
const mockRevokeSystemInvitation = jest.fn();
const mockResendSystemInvitation = jest.fn();

jest.mock('@/lib/api/system', () => ({
  listSystemInvitations: jest.fn(),
  createSystemInvitation: jest.fn(),
  revokeSystemInvitation: jest.fn(),
  resendSystemInvitation: jest.fn(),
}));

describe('SystemAdminPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
    mockSearchParams.delete('tab');
    (systemApi.listSystemInvitations as jest.Mock).mockClear();
    (systemApi.createSystemInvitation as jest.Mock).mockClear();
    (systemApi.revokeSystemInvitation as jest.Mock).mockClear();
    (systemApi.resendSystemInvitation as jest.Mock).mockClear();
  });

  describe('Tab Navigation', () => {
    it('renders namespaces tab by default', () => {
      render(<SystemAdminPage />);

      expect(screen.getByRole('tab', { name: 'Namespaces' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Invitations' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Namespaces' })).toBeInTheDocument();
    });

    it('renders invitations tab from URL param', () => {
      mockSearchParams.set('tab', 'invitations');
      (systemApi.listSystemInvitations as jest.Mock).mockResolvedValue([]);

      render(<SystemAdminPage />);

      expect(screen.getByRole('heading', { name: 'Invitations' })).toBeInTheDocument();
    });

    it('switches to invitations tab on click', async () => {
      const user = userEvent.setup();
      (systemApi.listSystemInvitations as jest.Mock).mockResolvedValue([]);

      render(<SystemAdminPage />);

      await user.click(screen.getByRole('tab', { name: 'Invitations' }));

      expect(screen.getByRole('heading', { name: 'Invitations' })).toBeInTheDocument();
      expect(mockPush).toHaveBeenCalledWith('/system?tab=invitations', { scroll: false });
    });

    it('switches back to namespaces tab', async () => {
      const user = userEvent.setup();
      mockSearchParams.set('tab', 'invitations');
      (systemApi.listSystemInvitations as jest.Mock).mockResolvedValue([]);

      render(<SystemAdminPage />);

      await user.click(screen.getByRole('tab', { name: 'Namespaces' }));

      expect(screen.getByRole('heading', { name: 'Namespaces' })).toBeInTheDocument();
      expect(mockPush).toHaveBeenCalledWith('/system?tab=namespaces', { scroll: false });
    });
  });

  describe('Invitations Tab', () => {
    beforeEach(() => {
      mockSearchParams.set('tab', 'invitations');
    });

    it('loads and displays invitations', async () => {
      (systemApi.listSystemInvitations as jest.Mock).mockResolvedValue([
        {
          id: 'inv-1',
          email: 'test@example.com',
          namespace_id: 'ns-1',
          targetRole: 'instructor',
          created_at: '2024-01-01T00:00:00Z',
          expires_at: '2024-01-08T00:00:00Z',
        },
      ]);

      render(<SystemAdminPage />);

      await waitFor(() => {
        expect(screen.getByText('test@example.com')).toBeInTheDocument();
      });
    });

    it('shows create invitation button', () => {
      (systemApi.listSystemInvitations as jest.Mock).mockResolvedValue([]);

      render(<SystemAdminPage />);

      expect(screen.getByRole('button', { name: 'Create Invitation' })).toBeInTheDocument();
    });

    it('shows create invitation form when button clicked', async () => {
      const user = userEvent.setup();
      (systemApi.listSystemInvitations as jest.Mock).mockResolvedValue([]);

      render(<SystemAdminPage />);

      await user.click(screen.getByRole('button', { name: 'Create Invitation' }));

      // Check for unique form elements
      expect(screen.getByText('Create New Invitation')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('user@example.com')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Send Invitation' })).toBeInTheDocument();
    });

    it('filters invitations by namespace', async () => {
      const user = userEvent.setup();
      (systemApi.listSystemInvitations as jest.Mock).mockResolvedValue([]);

      render(<SystemAdminPage />);

      await waitFor(() => {
        expect(screen.getByLabelText('Namespace')).toBeInTheDocument();
      });

      const select = screen.getByLabelText('Namespace');
      await user.selectOptions(select, 'ns-1');

      await waitFor(() => {
        expect(systemApi.listSystemInvitations).toHaveBeenCalledWith(
          expect.objectContaining({ namespace_id: 'ns-1' }),
        );
      });
    });

    it('filters invitations by role', async () => {
      const user = userEvent.setup();
      (systemApi.listSystemInvitations as jest.Mock).mockResolvedValue([]);

      render(<SystemAdminPage />);

      await waitFor(() => {
        expect(screen.getByLabelText('Role')).toBeInTheDocument();
      });

      const select = screen.getByLabelText('Role');
      await user.selectOptions(select, 'namespace-admin');

      await waitFor(() => {
        expect(systemApi.listSystemInvitations).toHaveBeenCalledWith(
          expect.objectContaining({ targetRole: 'namespace-admin' }),
        );
      });
    });

    it('filters invitations by status', async () => {
      const user = userEvent.setup();
      (systemApi.listSystemInvitations as jest.Mock).mockResolvedValue([]);

      render(<SystemAdminPage />);

      await waitFor(() => {
        expect(screen.getByLabelText('Status')).toBeInTheDocument();
      });

      const select = screen.getByLabelText('Status');
      await user.selectOptions(select, 'pending');

      await waitFor(() => {
        expect(systemApi.listSystemInvitations).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'pending' }),
        );
      });
    });

    it('shows error when loading fails', async () => {
      (systemApi.listSystemInvitations as jest.Mock).mockRejectedValue(new Error('Network error'));

      render(<SystemAdminPage />);

      await waitFor(() => {
        expect(screen.getByText(/Failed to load invitations/)).toBeInTheDocument();
      });
    });
  });

  describe('Create Invitation', () => {
    beforeEach(() => {
      mockSearchParams.set('tab', 'invitations');
      (systemApi.listSystemInvitations as jest.Mock).mockResolvedValue([]);
      (systemApi.createSystemInvitation as jest.Mock).mockResolvedValue({ id: 'inv-new' });
    });

    it('creates namespace-admin invitation', async () => {
      const user = userEvent.setup();

      render(<SystemAdminPage />);

      // Open form
      await user.click(screen.getByRole('button', { name: 'Create Invitation' }));

      // Fill form - use placeholder and specific element IDs
      const emailInput = screen.getByPlaceholderText('user@example.com');
      const namespaceSelect = document.getElementById('invite-namespace') as HTMLSelectElement;
      const roleSelect = document.getElementById('invite-role') as HTMLSelectElement;

      await user.type(emailInput, 'new@example.com');
      await user.selectOptions(namespaceSelect, 'ns-1');
      await user.selectOptions(roleSelect, 'namespace-admin');

      // Submit
      await user.click(screen.getByRole('button', { name: 'Send Invitation' }));

      await waitFor(() => {
        expect(systemApi.createSystemInvitation).toHaveBeenCalledWith(
          'new@example.com',
          'ns-1',
          'namespace-admin',
        );
      });
    });

    it('creates instructor invitation', async () => {
      const user = userEvent.setup();

      render(<SystemAdminPage />);

      await user.click(screen.getByRole('button', { name: 'Create Invitation' }));

      const emailInput = screen.getByPlaceholderText('user@example.com');
      const namespaceSelect = document.getElementById('invite-namespace') as HTMLSelectElement;

      await user.type(emailInput, 'instructor@example.com');
      await user.selectOptions(namespaceSelect, 'ns-2');
      // Role defaults to instructor

      await user.click(screen.getByRole('button', { name: 'Send Invitation' }));

      await waitFor(() => {
        expect(systemApi.createSystemInvitation).toHaveBeenCalledWith(
          'instructor@example.com',
          'ns-2',
          'instructor',
        );
      });
    });
  });

  describe('Statistics', () => {
    it('displays pending invitations count', async () => {
      mockSearchParams.set('tab', 'invitations');

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      (systemApi.listSystemInvitations as jest.Mock).mockResolvedValue([
        {
          id: 'inv-1',
          email: 'test1@example.com',
          namespace_id: 'ns-1',
          targetRole: 'instructor',
          created_at: '2024-01-01T00:00:00Z',
          expires_at: futureDate.toISOString(),
        },
        {
          id: 'inv-2',
          email: 'test2@example.com',
          namespace_id: 'ns-1',
          targetRole: 'instructor',
          created_at: '2024-01-01T00:00:00Z',
          expires_at: futureDate.toISOString(),
        },
      ]);

      render(<SystemAdminPage />);

      // Wait for invitations to load by checking for an email in the list
      await waitFor(() => {
        expect(screen.getByText('test1@example.com')).toBeInTheDocument();
      });

      // Now check the stats - find the pending invitations stat container
      const pendingLabel = screen.getByText('Pending Invitations');
      const statContainer = pendingLabel.parentElement;
      expect(statContainer).toHaveTextContent('2');
    });
  });
});

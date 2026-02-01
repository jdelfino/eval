/**
 * Tests for System Admin Page with Invitations
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SystemAdminPage from '../page';

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
  namespaceId: null,
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
      { id: 'ns-1', displayName: 'Test Org 1', active: true, userCount: 10 },
      { id: 'ns-2', displayName: 'Test Org 2', active: true, userCount: 5 },
    ],
    loading: false,
    error: null,
    fetchNamespaces: mockFetchNamespaces,
    createNamespace: mockCreateNamespace,
    updateNamespace: mockUpdateNamespace,
    deleteNamespace: mockDeleteNamespace,
  }),
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('SystemAdminPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
    mockSearchParams.delete('tab');
    mockFetch.mockClear();
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
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ invitations: [] }),
      });

      render(<SystemAdminPage />);

      expect(screen.getByRole('heading', { name: 'Invitations' })).toBeInTheDocument();
    });

    it('switches to invitations tab on click', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ invitations: [] }),
      });

      render(<SystemAdminPage />);

      await user.click(screen.getByRole('tab', { name: 'Invitations' }));

      expect(screen.getByRole('heading', { name: 'Invitations' })).toBeInTheDocument();
      expect(mockPush).toHaveBeenCalledWith('/system?tab=invitations', { scroll: false });
    });

    it('switches back to namespaces tab', async () => {
      const user = userEvent.setup();
      mockSearchParams.set('tab', 'invitations');
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ invitations: [] }),
      });

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
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          invitations: [
            {
              id: 'inv-1',
              email: 'test@example.com',
              namespaceId: 'ns-1',
              targetRole: 'instructor',
              createdAt: '2024-01-01T00:00:00Z',
              expiresAt: '2024-01-08T00:00:00Z',
            },
          ],
        }),
      });

      render(<SystemAdminPage />);

      await waitFor(() => {
        expect(screen.getByText('test@example.com')).toBeInTheDocument();
      });
    });

    it('shows create invitation button', () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ invitations: [] }),
      });

      render(<SystemAdminPage />);

      expect(screen.getByRole('button', { name: 'Create Invitation' })).toBeInTheDocument();
    });

    it('shows create invitation form when button clicked', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ invitations: [] }),
      });

      render(<SystemAdminPage />);

      await user.click(screen.getByRole('button', { name: 'Create Invitation' }));

      // Check for unique form elements
      expect(screen.getByText('Create New Invitation')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('user@example.com')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Send Invitation' })).toBeInTheDocument();
    });

    it('filters invitations by namespace', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ invitations: [] }),
      });

      render(<SystemAdminPage />);

      await waitFor(() => {
        expect(screen.getByLabelText('Namespace')).toBeInTheDocument();
      });

      const select = screen.getByLabelText('Namespace');
      await user.selectOptions(select, 'ns-1');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('namespaceId=ns-1'),
          expect.any(Object)
        );
      });
    });

    it('filters invitations by role', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ invitations: [] }),
      });

      render(<SystemAdminPage />);

      await waitFor(() => {
        expect(screen.getByLabelText('Role')).toBeInTheDocument();
      });

      const select = screen.getByLabelText('Role');
      await user.selectOptions(select, 'namespace-admin');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('targetRole=namespace-admin'),
          expect.any(Object)
        );
      });
    });

    it('filters invitations by status', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ invitations: [] }),
      });

      render(<SystemAdminPage />);

      await waitFor(() => {
        expect(screen.getByLabelText('Status')).toBeInTheDocument();
      });

      const select = screen.getByLabelText('Status');
      await user.selectOptions(select, 'pending');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('status=pending'),
          expect.any(Object)
        );
      });
    });

    it('shows error when loading fails', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      render(<SystemAdminPage />);

      await waitFor(() => {
        expect(screen.getByText(/Failed to load invitations/)).toBeInTheDocument();
      });
    });
  });

  describe('Create Invitation', () => {
    beforeEach(() => {
      mockSearchParams.set('tab', 'invitations');
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ invitations: [] }),
      });
    });

    it('creates namespace-admin invitation', async () => {
      const user = userEvent.setup();

      // First call: list invitations, Second call: create invitation, Third call: refresh list
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ invitations: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: () => Promise.resolve({ invitation: { id: 'inv-new' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ invitations: [] }),
        });

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
        expect(mockFetch).toHaveBeenCalledWith('/api/system/invitations', expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: 'new@example.com',
            namespaceId: 'ns-1',
            targetRole: 'namespace-admin',
          }),
        }));
      });
    });

    it('creates instructor invitation', async () => {
      const user = userEvent.setup();

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ invitations: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: () => Promise.resolve({ invitation: { id: 'inv-new' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ invitations: [] }),
        });

      render(<SystemAdminPage />);

      await user.click(screen.getByRole('button', { name: 'Create Invitation' }));

      const emailInput = screen.getByPlaceholderText('user@example.com');
      const namespaceSelect = document.getElementById('invite-namespace') as HTMLSelectElement;

      await user.type(emailInput, 'instructor@example.com');
      await user.selectOptions(namespaceSelect, 'ns-2');
      // Role defaults to instructor

      await user.click(screen.getByRole('button', { name: 'Send Invitation' }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/system/invitations', expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: 'instructor@example.com',
            namespaceId: 'ns-2',
            targetRole: 'instructor',
          }),
        }));
      });
    });
  });

  describe('Statistics', () => {
    it('displays pending invitations count', async () => {
      mockSearchParams.set('tab', 'invitations');

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          invitations: [
            {
              id: 'inv-1',
              email: 'test1@example.com',
              namespaceId: 'ns-1',
              targetRole: 'instructor',
              createdAt: '2024-01-01T00:00:00Z',
              expiresAt: futureDate.toISOString(),
            },
            {
              id: 'inv-2',
              email: 'test2@example.com',
              namespaceId: 'ns-1',
              targetRole: 'instructor',
              createdAt: '2024-01-01T00:00:00Z',
              expiresAt: futureDate.toISOString(),
            },
          ],
        }),
      });

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

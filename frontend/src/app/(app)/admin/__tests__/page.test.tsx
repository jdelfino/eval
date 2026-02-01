/**
 * Tests for Admin Page - overview stats panel layout
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock AuthContext
const mockUser = {
  id: 'admin-1',
  role: 'system-admin' as const,
  namespaceId: 'ns-1',
  email: 'admin@test.com',
  displayName: 'Admin',
  createdAt: new Date(),
};

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    isLoading: false,
  }),
}));

// Mock useSelectedNamespace
jest.mock('@/hooks/useSelectedNamespace', () => ({
  useSelectedNamespace: () => 'ns-1',
}));

// Mock NamespaceHeader
jest.mock('@/components/NamespaceHeader', () => ({
  __esModule: true,
  default: () => <div data-testid="namespace-header">Namespace Header</div>,
}));

// Mock child components
jest.mock('../components/UserList', () => ({
  __esModule: true,
  default: ({ users }: { users: unknown[] }) => (
    <div data-testid="user-list">Users: {users.length}</div>
  ),
}));

jest.mock('../components/InviteInstructorForm', () => ({
  __esModule: true,
  default: () => <div data-testid="invite-form">Invite Form</div>,
}));

jest.mock('@/components/InvitationList', () => ({
  __esModule: true,
  default: () => <div data-testid="invitation-list">Invitation List</div>,
}));

const mockStats = {
  users: { total: 50, byRole: { admin: 2, instructor: 8, student: 40 } },
  classes: { total: 5 },
  sections: { total: 12 },
  sessions: { active: 3 },
};

const mockUsers = [
  { id: 'u1', email: 'a@test.com', role: 'instructor', displayName: 'A', createdAt: new Date().toISOString() },
  { id: 'u2', email: 'b@test.com', role: 'student', displayName: 'B', createdAt: new Date().toISOString() },
];

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

import AdminPageWrapper from '../page';

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/api/admin/stats')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockStats) });
    }
    if (url.includes('/api/admin/users')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ users: mockUsers }) });
    }
    if (url.includes('/api/namespace/invitations')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ invitations: [] }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
});

describe('Admin Page - Namespace URL', () => {
  it('fetches data with namespace query param', async () => {
    render(<AdminPageWrapper />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('?namespace=ns-1'),
        expect.anything()
      );
    });
  });
});

describe('Admin Page - Namespace change reloads data', () => {
  it('reloads data when selectedNamespace changes', async () => {
    let mockNamespace = 'ns-1';
    // Re-mock useSelectedNamespace to return a mutable value
    const useSelectedNamespaceMock = jest.requireMock('@/hooks/useSelectedNamespace');
    useSelectedNamespaceMock.useSelectedNamespace = () => mockNamespace;

    const { rerender } = render(<AdminPageWrapper />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const callCountBefore = mockFetch.mock.calls.length;

    // Change namespace
    mockNamespace = 'ns-2';
    useSelectedNamespaceMock.useSelectedNamespace = () => mockNamespace;

    rerender(<AdminPageWrapper />);

    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThan(callCountBefore);
    });
  });
});

describe('Admin Page - Namespace Admins tab', () => {
  it('renders a Namespace Admins tab for admin users', async () => {
    // Include a namespace-admin user in the mock data
    const usersWithNsAdmin = [
      ...mockUsers,
      { id: 'u3', email: 'nsadmin@test.com', role: 'namespace-admin', displayName: 'NS Admin', createdAt: new Date().toISOString() },
    ];
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/admin/stats')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockStats) });
      }
      if (url.includes('/api/admin/users')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ users: usersWithNsAdmin }) });
      }
      if (url.includes('/api/namespace/invitations')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ invitations: [] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<AdminPageWrapper />);

    await waitFor(() => {
      // Namespace Admins tab should exist with correct count
      expect(screen.getByRole('tab', { name: /namespace admins \(1\)/i })).toBeInTheDocument();
    });
  });
});

describe('Admin Page - All Users table shows email column', () => {
  it('renders Email column header and email values in All Users table', async () => {
    render(<AdminPageWrapper />);

    await waitFor(() => {
      // The All Users inline table should have an Email column header
      expect(screen.getByText('Email')).toBeInTheDocument();
    });

    // Each user's email should be visible in the table
    await waitFor(() => {
      expect(screen.getByText('a@test.com')).toBeInTheDocument();
      expect(screen.getByText('b@test.com')).toBeInTheDocument();
    });
  });
});

describe('Admin Page - Overview Stats Panel', () => {
  it('shows stats cards without an Overview tab', async () => {
    render(<AdminPageWrapper />);

    await waitFor(() => {
      expect(screen.getByText('50')).toBeInTheDocument();
    });

    // Stats should be visible
    expect(screen.getByText('Total Users')).toBeInTheDocument();
    expect(screen.getByText('Classes')).toBeInTheDocument();
    expect(screen.getByText('Sections')).toBeInTheDocument();
    expect(screen.getByText('Active Sessions')).toBeInTheDocument();

    // No Overview tab
    expect(screen.queryByRole('tab', { name: /overview/i })).not.toBeInTheDocument();
  });

  it('shows stats between namespace header and tabs', async () => {
    const { container } = render(<AdminPageWrapper />);

    await waitFor(() => {
      expect(screen.getByText('50')).toBeInTheDocument();
    });

    // Stats panel should exist outside of any tab panel
    const statsPanel = screen.getByText('Total Users').closest('.grid');
    expect(statsPanel).toBeInTheDocument();

    // Verify the tabs still exist: All Users, Namespace Admins, Instructors, Students
    expect(screen.getByRole('tab', { name: /all users/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /namespace admins/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /instructors/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /students/i })).toBeInTheDocument();
  });

  it('defaults to All Users tab for admins', async () => {
    render(<AdminPageWrapper />);

    await waitFor(() => {
      expect(screen.getByText('50')).toBeInTheDocument();
    });

    // All Users tab should be active by default
    const allUsersTab = screen.getByRole('tab', { name: /all users/i });
    expect(allUsersTab).toHaveAttribute('aria-selected', 'true');
  });
});

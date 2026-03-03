/**
 * @jest-environment jsdom
 */
import React, { act } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import NamespaceHeader from '../NamespaceHeader';
import { useAuth } from '@/contexts/AuthContext';
import * as systemApi from '@/lib/api/system';

// Mock the AuthContext
jest.mock('@/contexts/AuthContext');
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

// Mock the system API module
jest.mock('@/lib/api/system');
const mockGetSystemNamespace = systemApi.getSystemNamespace as jest.MockedFunction<typeof systemApi.getSystemNamespace>;
const mockListSystemNamespaces = systemApi.listSystemNamespaces as jest.MockedFunction<typeof systemApi.listSystemNamespaces>;

function mockAuthUser(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: 'user1',
      external_id: null,
      email: 'user1@example.com',
      role: 'instructor' as const,
      namespace_id: 'stanford',
      display_name: 'User One',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      ...overrides,
    },
    isAuthenticated: true,
    isLoading: false,
    signOut: jest.fn(),
    refreshUser: jest.fn(),
    setUserProfile: jest.fn(),
    beginAuthFlow: jest.fn(),
  };
}

describe('NamespaceHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  describe('For non-system-admin users', () => {
    it('displays namespace name for instructor', async () => {
      mockUseAuth.mockReturnValue(mockAuthUser({
        id: 'user1',
        email: 'instructor1@example.com',
        role: 'instructor',
        namespace_id: 'stanford',
        display_name: 'Instructor One',
      }));

      mockGetSystemNamespace.mockResolvedValueOnce({
        id: 'stanford',
        displayName: 'Stanford University',
        active: true,
      });

      await act(async () => {
        render(<NamespaceHeader />);
      });

      await waitFor(() => {
        expect(screen.getByText('Stanford University')).toBeInTheDocument();
      });
    });

    it('displays namespace name for namespace-admin', async () => {
      mockUseAuth.mockReturnValue(mockAuthUser({
        id: 'admin1',
        email: 'admin@example.com',
        role: 'namespace-admin',
        namespace_id: 'mit',
        display_name: 'Admin One',
      }));

      mockGetSystemNamespace.mockResolvedValueOnce({
        id: 'mit',
        displayName: 'MIT',
        active: true,
      });

      await act(async () => {
        render(<NamespaceHeader />);
      });

      await waitFor(() => {
        expect(screen.getByText('MIT')).toBeInTheDocument();
      });
    });

    it('displays namespace name for student', async () => {
      mockUseAuth.mockReturnValue(mockAuthUser({
        id: 'student1',
        email: 'student1@example.com',
        role: 'student',
        namespace_id: 'stanford',
        display_name: 'Student One',
      }));

      mockGetSystemNamespace.mockResolvedValueOnce({
        id: 'stanford',
        displayName: 'Stanford University',
        active: true,
      });

      await act(async () => {
        render(<NamespaceHeader />);
      });

      await waitFor(() => {
        expect(screen.getByText('Stanford University')).toBeInTheDocument();
      });
    });

    it('falls back to namespace_id if displayName is not available', async () => {
      mockUseAuth.mockReturnValue(mockAuthUser({
        namespace_id: 'testns',
      }));

      // Mock API to fail
      mockGetSystemNamespace.mockRejectedValueOnce(new Error('API error'));

      await act(async () => {
        render(<NamespaceHeader />);
      });

      await waitFor(() => {
        expect(screen.getByText('testns')).toBeInTheDocument();
      });
    });

    it('does not show dropdown for non-system-admin users', async () => {
      mockUseAuth.mockReturnValue(mockAuthUser());

      mockGetSystemNamespace.mockResolvedValueOnce({
        id: 'stanford',
        displayName: 'Stanford University',
        active: true,
      });

      await act(async () => {
        render(<NamespaceHeader />);
      });

      await waitFor(() => {
        expect(screen.queryByLabelText('Namespace:')).not.toBeInTheDocument();
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      });
    });
  });

  describe('For system-admin users', () => {
    it('displays namespace dropdown for system-admin', async () => {
      mockUseAuth.mockReturnValue(mockAuthUser({
        id: 'sysadmin1',
        email: 'sysadmin@example.com',
        role: 'system-admin',
        namespace_id: 'default',
        display_name: 'System Admin',
      }));

      mockListSystemNamespaces.mockResolvedValueOnce([
        {
          id: 'default',
          displayName: 'Default',
          active: true,
          userCount: 5,
        },
        {
          id: 'stanford',
          displayName: 'Stanford University',
          active: true,
          userCount: 10,
        },
        {
          id: 'mit',
          displayName: 'MIT',
          active: true,
          userCount: 8,
        },
      ]);

      await act(async () => {
        render(<NamespaceHeader />);
      });

      await waitFor(() => {
        expect(screen.getByLabelText('Namespace:')).toBeInTheDocument();
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select).toBeInTheDocument();

        // Check that all namespaces are in the dropdown
        expect(screen.getByText(/Default \(5 users\)/)).toBeInTheDocument();
        expect(screen.getByText(/Stanford University \(10 users\)/)).toBeInTheDocument();
        expect(screen.getByText(/MIT \(8 users\)/)).toBeInTheDocument();
      });
    });

    it('loads selected namespace from localStorage', async () => {
      localStorage.setItem('selectedNamespaceId', 'stanford');

      mockUseAuth.mockReturnValue(mockAuthUser({
        id: 'sysadmin1',
        email: 'sysadmin@example.com',
        role: 'system-admin',
        namespace_id: 'default',
        display_name: 'System Admin',
      }));

      mockListSystemNamespaces.mockResolvedValueOnce([
        {
          id: 'default',
          displayName: 'Default',
          active: true,
          userCount: 5,
        },
        {
          id: 'stanford',
          displayName: 'Stanford University',
          active: true,
          userCount: 10,
        },
      ]);

      await act(async () => {
        render(<NamespaceHeader />);
      });

      await waitFor(() => {
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select.value).toBe('stanford');
      });
    });
  });

  describe('Edge cases', () => {
    it('returns null when user is not authenticated', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        signOut: jest.fn(),
        refreshUser: jest.fn(),
        setUserProfile: jest.fn(),
        beginAuthFlow: jest.fn(),
      });

      const { container } = render(<NamespaceHeader />);
      expect(container.firstChild).toBeNull();
    });

    it('returns null when user has no namespace_id', async () => {
      mockUseAuth.mockReturnValue(mockAuthUser({
        namespace_id: null,
      }));

      const { container } = render(<NamespaceHeader />);
      expect(container.firstChild).toBeNull();
    });

    it('handles fetch errors gracefully', async () => {
      mockUseAuth.mockReturnValue(mockAuthUser({
        namespace_id: 'stanford',
      }));

      // Mock API to throw error
      mockGetSystemNamespace.mockRejectedValueOnce(new Error('Network error'));

      await act(async () => {
        render(<NamespaceHeader />);
      });

      // Should still render something (fallback to namespace_id)
      await waitFor(() => {
        expect(screen.getByText('stanford')).toBeInTheDocument();
      });
    });
  });
});

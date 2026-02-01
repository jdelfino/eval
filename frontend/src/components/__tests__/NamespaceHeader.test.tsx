/**
 * @jest-environment jsdom
 */
import React, { act } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import NamespaceHeader from '../NamespaceHeader';
import { useAuth } from '@/contexts/AuthContext';

// Mock the AuthContext
jest.mock('@/contexts/AuthContext');
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

// Mock fetch
global.fetch = jest.fn();

function mockAuthUser(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      ID: 'user1',
      ExternalID: null,
      Email: 'user1@example.com',
      Role: 'instructor' as const,
      NamespaceID: 'stanford',
      DisplayName: 'User One',
      CreatedAt: '2024-01-01T00:00:00Z',
      UpdatedAt: '2024-01-01T00:00:00Z',
      ...overrides,
    },
    isAuthenticated: true,
    isLoading: false,
    signIn: jest.fn(),
    signOut: jest.fn(),
    refreshUser: jest.fn(),
  };
}

describe('NamespaceHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    (global.fetch as jest.Mock).mockClear();
  });

  describe('For non-system-admin users', () => {
    it('displays namespace name for instructor', async () => {
      mockUseAuth.mockReturnValue(mockAuthUser({
        ID: 'user1',
        Email: 'instructor1@example.com',
        Role: 'instructor',
        NamespaceID: 'stanford',
        DisplayName: 'Instructor One',
      }));

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          namespace: {
            id: 'stanford',
            displayName: 'Stanford University',
            active: true,
          },
        }),
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
        ID: 'admin1',
        Email: 'admin@example.com',
        Role: 'namespace-admin',
        NamespaceID: 'mit',
        DisplayName: 'Admin One',
      }));

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          namespace: {
            id: 'mit',
            displayName: 'MIT',
            active: true,
          },
        }),
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
        ID: 'student1',
        Email: 'student1@example.com',
        Role: 'student',
        NamespaceID: 'stanford',
        DisplayName: 'Student One',
      }));

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          namespace: {
            id: 'stanford',
            displayName: 'Stanford University',
            active: true,
          },
        }),
      });

      await act(async () => {
        render(<NamespaceHeader />);
      });

      await waitFor(() => {
        expect(screen.getByText('Stanford University')).toBeInTheDocument();
      });
    });

    it('falls back to namespaceId if displayName is not available', async () => {
      mockUseAuth.mockReturnValue(mockAuthUser({
        NamespaceID: 'testns',
      }));

      // Mock fetch to fail
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
      });

      await act(async () => {
        render(<NamespaceHeader />);
      });

      await waitFor(() => {
        expect(screen.getByText('testns')).toBeInTheDocument();
      });
    });

    it('does not show dropdown for non-system-admin users', async () => {
      mockUseAuth.mockReturnValue(mockAuthUser());

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          namespace: {
            id: 'stanford',
            displayName: 'Stanford University',
            active: true,
          },
        }),
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
        ID: 'sysadmin1',
        Email: 'sysadmin@example.com',
        Role: 'system-admin',
        NamespaceID: 'default',
        DisplayName: 'System Admin',
      }));

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          namespaces: [
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
          ],
        }),
      });

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
        ID: 'sysadmin1',
        Email: 'sysadmin@example.com',
        Role: 'system-admin',
        NamespaceID: 'default',
        DisplayName: 'System Admin',
      }));

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          namespaces: [
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
          ],
        }),
      });

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
        signIn: jest.fn(),
        signOut: jest.fn(),
        refreshUser: jest.fn(),
      });

      const { container } = render(<NamespaceHeader />);
      expect(container.firstChild).toBeNull();
    });

    it('returns null when user has no namespaceId', async () => {
      mockUseAuth.mockReturnValue(mockAuthUser({
        NamespaceID: null,
      }));

      const { container } = render(<NamespaceHeader />);
      expect(container.firstChild).toBeNull();
    });

    it('handles fetch errors gracefully', async () => {
      mockUseAuth.mockReturnValue(mockAuthUser({
        NamespaceID: 'stanford',
      }));

      // Mock fetch to throw error
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      await act(async () => {
        render(<NamespaceHeader />);
      });

      // Should still render something (fallback to namespaceId)
      await waitFor(() => {
        expect(screen.getByText('stanford')).toBeInTheDocument();
      });
    });
  });
});

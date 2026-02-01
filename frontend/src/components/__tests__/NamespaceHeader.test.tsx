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

describe('NamespaceHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    (global.fetch as jest.Mock).mockClear();
  });

  describe('For non-system-admin users', () => {
    it('displays namespace name for instructor', async () => {
      // Mock user as instructor
      mockUseAuth.mockReturnValue({
        user: {
          id: 'user1',
          email: 'instructor1@example.com',
          role: 'instructor',
          namespaceId: 'stanford',
          displayName: 'Instructor One',
          createdAt: '2024-01-01T00:00:00Z',
        },
        sessionId: 'session1',
        isAuthenticated: true,
        isLoading: false,
        signIn: jest.fn(),
        signOut: jest.fn(),
        refreshUser: jest.fn(),
        mfaPending: false,
        pendingEmail: null,
        sendMfaCode: jest.fn(),
        verifyMfaCode: jest.fn(),
        cancelMfa: jest.fn(),
      });

      // Mock fetch for namespace details
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
      mockUseAuth.mockReturnValue({
        user: {
          id: 'admin1',
          email: 'admin@example.com',
          role: 'namespace-admin',
          namespaceId: 'mit',
          displayName: 'Admin One',
          createdAt: '2024-01-01T00:00:00Z',
        },
        sessionId: 'session1',
        isAuthenticated: true,
        isLoading: false,
        signIn: jest.fn(),
        signOut: jest.fn(),
        refreshUser: jest.fn(),
        mfaPending: false,
        pendingEmail: null,
        sendMfaCode: jest.fn(),
        verifyMfaCode: jest.fn(),
        cancelMfa: jest.fn(),
      });

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
      mockUseAuth.mockReturnValue({
        user: {
          id: 'student1',
          email: 'student1@example.com',
          role: 'student',
          namespaceId: 'stanford',
          displayName: 'Student One',
          createdAt: '2024-01-01T00:00:00Z',
        },
        sessionId: 'session1',
        isAuthenticated: true,
        isLoading: false,
        signIn: jest.fn(),
        signOut: jest.fn(),
        refreshUser: jest.fn(),
        mfaPending: false,
        pendingEmail: null,
        sendMfaCode: jest.fn(),
        verifyMfaCode: jest.fn(),
        cancelMfa: jest.fn(),
      });

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
      mockUseAuth.mockReturnValue({
        user: {
          id: 'user1',
          email: 'user1@example.com',
          role: 'instructor',
          namespaceId: 'testns',
          displayName: 'User One',
          createdAt: '2024-01-01T00:00:00Z',
        },
        sessionId: 'session1',
        isAuthenticated: true,
        isLoading: false,
        signIn: jest.fn(),
        signOut: jest.fn(),
        refreshUser: jest.fn(),
        mfaPending: false,
        pendingEmail: null,
        sendMfaCode: jest.fn(),
        verifyMfaCode: jest.fn(),
        cancelMfa: jest.fn(),
      });

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
      mockUseAuth.mockReturnValue({
        user: {
          id: 'user1',
          email: 'user1@example.com',
          role: 'instructor',
          namespaceId: 'stanford',
          displayName: 'User One',
          createdAt: '2024-01-01T00:00:00Z',
        },
        sessionId: 'session1',
        isAuthenticated: true,
        isLoading: false,
        signIn: jest.fn(),
        signOut: jest.fn(),
        refreshUser: jest.fn(),
        mfaPending: false,
        pendingEmail: null,
        sendMfaCode: jest.fn(),
        verifyMfaCode: jest.fn(),
        cancelMfa: jest.fn(),
      });

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
      mockUseAuth.mockReturnValue({
        user: {
          id: 'sysadmin1',
          email: 'sysadmin@example.com',
          role: 'system-admin',
          namespaceId: 'default',
          displayName: 'System Admin',
          createdAt: '2024-01-01T00:00:00Z',
        },
        sessionId: 'session1',
        isAuthenticated: true,
        isLoading: false,
        signIn: jest.fn(),
        signOut: jest.fn(),
        refreshUser: jest.fn(),
        mfaPending: false,
        pendingEmail: null,
        sendMfaCode: jest.fn(),
        verifyMfaCode: jest.fn(),
        cancelMfa: jest.fn(),
      });

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

      mockUseAuth.mockReturnValue({
        user: {
          id: 'sysadmin1',
          email: 'sysadmin@example.com',
          role: 'system-admin',
          namespaceId: 'default',
          displayName: 'System Admin',
          createdAt: '2024-01-01T00:00:00Z',
        },
        sessionId: 'session1',
        isAuthenticated: true,
        isLoading: false,
        signIn: jest.fn(),
        signOut: jest.fn(),
        refreshUser: jest.fn(),
        mfaPending: false,
        pendingEmail: null,
        sendMfaCode: jest.fn(),
        verifyMfaCode: jest.fn(),
        cancelMfa: jest.fn(),
      });

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
        sessionId: null,
        isAuthenticated: false,
        isLoading: false,
        signIn: jest.fn(),
        signOut: jest.fn(),
        refreshUser: jest.fn(),
        mfaPending: false,
        pendingEmail: null,
        sendMfaCode: jest.fn(),
        verifyMfaCode: jest.fn(),
        cancelMfa: jest.fn(),
      });

      const { container } = render(<NamespaceHeader />);
      expect(container.firstChild).toBeNull();
    });

    it('returns null when user has no namespaceId', async () => {
      mockUseAuth.mockReturnValue({
        user: {
          id: 'user1',
          email: 'user1@example.com',
          role: 'instructor',
          namespaceId: null,
          displayName: 'User One',
          createdAt: '2024-01-01T00:00:00Z',
        },
        sessionId: 'session1',
        isAuthenticated: true,
        isLoading: false,
        signIn: jest.fn(),
        signOut: jest.fn(),
        refreshUser: jest.fn(),
        mfaPending: false,
        pendingEmail: null,
        sendMfaCode: jest.fn(),
        verifyMfaCode: jest.fn(),
        cancelMfa: jest.fn(),
      });

      const { container } = render(<NamespaceHeader />);
      expect(container.firstChild).toBeNull();
    });

    it('handles fetch errors gracefully', async () => {
      mockUseAuth.mockReturnValue({
        user: {
          id: 'user1',
          email: 'user1@example.com',
          role: 'instructor',
          namespaceId: 'stanford',
          displayName: 'User One',
          createdAt: '2024-01-01T00:00:00Z',
        },
        sessionId: 'session1',
        isAuthenticated: true,
        isLoading: false,
        signIn: jest.fn(),
        signOut: jest.fn(),
        refreshUser: jest.fn(),
        mfaPending: false,
        pendingEmail: null,
        sendMfaCode: jest.fn(),
        verifyMfaCode: jest.fn(),
        cancelMfa: jest.fn(),
      });

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

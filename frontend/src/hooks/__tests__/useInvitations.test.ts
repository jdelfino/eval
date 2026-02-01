/**
 * Tests for useInvitations hook
 * @jest-environment jsdom
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useInvitations } from '../useInvitations';

// Mock fetch
global.fetch = jest.fn();

describe('useInvitations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockInvitation = {
    id: 'inv-1',
    email: 'instructor@example.com',
    targetRole: 'instructor',
    namespaceId: 'test-namespace',
    createdBy: 'admin-1',
    createdAt: '2024-01-01T00:00:00Z',
    expiresAt: '2024-01-08T00:00:00Z',
    status: 'pending',
  };

  const mockConsumedInvitation = {
    ...mockInvitation,
    id: 'inv-2',
    email: 'consumed@example.com',
    consumedAt: '2024-01-02T00:00:00Z',
    status: 'consumed',
  };

  const mockRevokedInvitation = {
    ...mockInvitation,
    id: 'inv-3',
    email: 'revoked@example.com',
    revokedAt: '2024-01-03T00:00:00Z',
    status: 'revoked',
  };

  describe('fetchInvitations', () => {
    it('fetches invitations successfully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invitations: [mockInvitation, mockConsumedInvitation] }),
      });

      const { result } = renderHook(() => useInvitations());

      await act(async () => {
        await result.current.fetchInvitations();
      });

      expect(result.current.invitations).toHaveLength(2);
      expect(result.current.invitations[0].email).toBe('instructor@example.com');
      expect(result.current.error).toBeNull();
      expect(global.fetch).toHaveBeenCalledWith('/api/namespace/invitations?');
    });

    it('fetches invitations with status filter', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invitations: [mockInvitation] }),
      });

      const { result } = renderHook(() => useInvitations());

      await act(async () => {
        await result.current.fetchInvitations({ status: 'pending' });
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/namespace/invitations?status=pending');
    });

    it('fetches invitations with email filter', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invitations: [mockInvitation] }),
      });

      const { result } = renderHook(() => useInvitations());

      await act(async () => {
        await result.current.fetchInvitations({ email: 'test@' });
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/namespace/invitations?email=test%40');
    });

    it('sets error when fetch fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Failed to load invitations' }),
      });

      const { result } = renderHook(() => useInvitations());

      await act(async () => {
        try {
          await result.current.fetchInvitations();
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.error).toBe('Failed to load invitations');
    });

    it('sets loading state during fetch', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ ok: true, json: async () => ({ invitations: [] }) }), 100)
          )
      );

      const { result } = renderHook(() => useInvitations());

      act(() => {
        result.current.fetchInvitations();
      });

      await waitFor(() => expect(result.current.loading).toBe(true));
      await waitFor(() => expect(result.current.loading).toBe(false));
    });
  });

  describe('createInvitation', () => {
    it('creates invitation successfully', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ invitation: mockInvitation }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ invitations: [mockInvitation] }),
        });

      const { result } = renderHook(() => useInvitations());

      let invitation;
      await act(async () => {
        invitation = await result.current.createInvitation('instructor@example.com');
      });

      expect(invitation).toEqual(mockInvitation);
      expect(global.fetch).toHaveBeenCalledWith('/api/namespace/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'instructor@example.com' }),
      });
    });

    it('creates invitation with custom expiry', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ invitation: mockInvitation }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ invitations: [mockInvitation] }),
        });

      const { result } = renderHook(() => useInvitations());

      await act(async () => {
        await result.current.createInvitation('instructor@example.com', 14);
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/namespace/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'instructor@example.com', expiresInDays: 14 }),
      });
    });

    it('sets error for invalid email', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Invalid email format', code: 'INVALID_EMAIL' }),
      });

      const { result } = renderHook(() => useInvitations());

      await act(async () => {
        try {
          await result.current.createInvitation('invalid-email');
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.error).toBe('Invalid email format');
    });

    it('sets error for duplicate invitation', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: 'An invitation has already been sent to this email', code: 'DUPLICATE_INVITATION' }),
      });

      const { result } = renderHook(() => useInvitations());

      await act(async () => {
        try {
          await result.current.createInvitation('existing@example.com');
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.error).toBe('An invitation has already been sent to this email');
    });

    it('refreshes invitations after create', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ invitation: mockInvitation }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ invitations: [mockInvitation] }),
        });

      const { result } = renderHook(() => useInvitations());

      await act(async () => {
        await result.current.createInvitation('instructor@example.com');
      });

      // Second call should be the refresh
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/namespace/invitations?');
    });
  });

  describe('revokeInvitation', () => {
    it('revokes invitation successfully', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ invitation: mockRevokedInvitation }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ invitations: [mockRevokedInvitation] }),
        });

      const { result } = renderHook(() => useInvitations());

      let invitation;
      await act(async () => {
        invitation = await result.current.revokeInvitation('inv-3');
      });

      expect(invitation).toEqual(mockRevokedInvitation);
      expect(global.fetch).toHaveBeenCalledWith('/api/namespace/invitations/inv-3', {
        method: 'DELETE',
      });
    });

    it('sets error when revoking consumed invitation', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Cannot revoke a consumed invitation', code: 'INVITATION_CONSUMED' }),
      });

      const { result } = renderHook(() => useInvitations());

      await act(async () => {
        try {
          await result.current.revokeInvitation('inv-2');
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.error).toBe('Cannot revoke a consumed invitation');
    });

    it('refreshes invitations after revoke', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ invitation: mockRevokedInvitation }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ invitations: [] }),
        });

      const { result } = renderHook(() => useInvitations());

      await act(async () => {
        await result.current.revokeInvitation('inv-3');
      });

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('resendInvitation', () => {
    it('resends invitation successfully', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ invitation: mockInvitation }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ invitations: [mockInvitation] }),
        });

      const { result } = renderHook(() => useInvitations());

      let invitation;
      await act(async () => {
        invitation = await result.current.resendInvitation('inv-1');
      });

      expect(invitation).toEqual(mockInvitation);
      expect(global.fetch).toHaveBeenCalledWith('/api/namespace/invitations/inv-1/resend', {
        method: 'POST',
      });
    });

    it('sets error when resending consumed invitation', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Cannot resend a consumed invitation', code: 'INVITATION_CONSUMED' }),
      });

      const { result } = renderHook(() => useInvitations());

      await act(async () => {
        try {
          await result.current.resendInvitation('inv-2');
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.error).toBe('Cannot resend a consumed invitation');
    });

    it('sets error when resending revoked invitation', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Cannot resend a revoked invitation', code: 'INVITATION_REVOKED' }),
      });

      const { result } = renderHook(() => useInvitations());

      await act(async () => {
        try {
          await result.current.resendInvitation('inv-3');
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.error).toBe('Cannot resend a revoked invitation');
    });

    it('handles email sending failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ error: 'Failed to send invitation email', code: 'EMAIL_SEND_FAILED' }),
      });

      const { result } = renderHook(() => useInvitations());

      await act(async () => {
        try {
          await result.current.resendInvitation('inv-1');
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.error).toBe('Failed to send invitation email');
    });
  });

  describe('filter state', () => {
    it('initializes with all filter', () => {
      const { result } = renderHook(() => useInvitations());
      expect(result.current.filter).toBe('all');
    });

    it('allows setting filter', () => {
      const { result } = renderHook(() => useInvitations());

      act(() => {
        result.current.setFilter('pending');
      });

      expect(result.current.filter).toBe('pending');
    });

    it('supports all filter values', () => {
      const { result } = renderHook(() => useInvitations());
      const filters = ['all', 'pending', 'consumed', 'revoked', 'expired'] as const;

      filters.forEach((filter) => {
        act(() => {
          result.current.setFilter(filter);
        });
        expect(result.current.filter).toBe(filter);
      });
    });
  });

  describe('clearError', () => {
    it('clears error state', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Some error' }),
      });

      const { result } = renderHook(() => useInvitations());

      await act(async () => {
        try {
          await result.current.fetchInvitations();
        } catch {
          // Expected
        }
      });

      expect(result.current.error).toBe('Some error');

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });
});

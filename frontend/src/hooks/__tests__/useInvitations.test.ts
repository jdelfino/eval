/**
 * Tests for useInvitations hook
 * @jest-environment jsdom
 */

import { renderHook, act, waitFor } from '@testing-library/react';

const mockListInvitations = jest.fn();
const mockCreateInvitation = jest.fn();
const mockRevokeInvitation = jest.fn();
const mockResendInvitation = jest.fn();

// Mock lib/api/invitations
jest.mock('@/lib/api/invitations', () => ({
  listInvitations: (...args: unknown[]) => mockListInvitations(...args),
  createInvitation: (...args: unknown[]) => mockCreateInvitation(...args),
  revokeInvitation: (...args: unknown[]) => mockRevokeInvitation(...args),
  resendInvitation: (...args: unknown[]) => mockResendInvitation(...args),
}));

import { useInvitations } from '../useInvitations';
import type { SerializedInvitation } from '@/lib/api/invitations';

describe('useInvitations', () => {
  const TEST_NAMESPACE = 'test-namespace';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockInvitation: SerializedInvitation = {
    id: 'inv-1',
    email: 'instructor@example.com',
    target_role: 'instructor',
    namespace_id: TEST_NAMESPACE,
    created_by: 'admin-1',
    created_at: '2024-01-01T00:00:00Z',
    expires_at: '2024-01-08T00:00:00Z',
    status: 'pending',
  };

  const mockConsumedInvitation: SerializedInvitation = {
    ...mockInvitation,
    id: 'inv-2',
    email: 'consumed@example.com',
    consumed_at: '2024-01-02T00:00:00Z',
    status: 'consumed',
  };

  const mockRevokedInvitation: SerializedInvitation = {
    ...mockInvitation,
    id: 'inv-3',
    email: 'revoked@example.com',
    revoked_at: '2024-01-03T00:00:00Z',
    status: 'revoked',
  };

  describe('fetchInvitations', () => {
    it('fetches invitations successfully', async () => {
      mockListInvitations.mockResolvedValueOnce([mockInvitation, mockConsumedInvitation]);

      const { result } = renderHook(() => useInvitations(TEST_NAMESPACE));

      await act(async () => {
        await result.current.fetchInvitations();
      });

      expect(result.current.invitations).toHaveLength(2);
      expect(result.current.invitations[0].email).toBe('instructor@example.com');
      expect(result.current.error).toBeNull();
      expect(mockListInvitations).toHaveBeenCalledWith(TEST_NAMESPACE, undefined);
    });

    it('fetches invitations with status filter', async () => {
      mockListInvitations.mockResolvedValueOnce([mockInvitation]);

      const { result } = renderHook(() => useInvitations(TEST_NAMESPACE));

      await act(async () => {
        await result.current.fetchInvitations({ status: 'pending' });
      });

      expect(mockListInvitations).toHaveBeenCalledWith(TEST_NAMESPACE, { status: 'pending' });
    });

    it('fetches invitations with email filter', async () => {
      mockListInvitations.mockResolvedValueOnce([mockInvitation]);

      const { result } = renderHook(() => useInvitations(TEST_NAMESPACE));

      await act(async () => {
        await result.current.fetchInvitations({ email: 'test@' });
      });

      expect(mockListInvitations).toHaveBeenCalledWith(TEST_NAMESPACE, { email: 'test@' });
    });

    it('sets error when fetch fails', async () => {
      mockListInvitations.mockRejectedValueOnce(new Error('Failed to load invitations'));

      const { result } = renderHook(() => useInvitations(TEST_NAMESPACE));

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
      mockListInvitations.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 100))
      );

      const { result } = renderHook(() => useInvitations(TEST_NAMESPACE));

      act(() => {
        result.current.fetchInvitations();
      });

      await waitFor(() => expect(result.current.loading).toBe(true));
      await waitFor(() => expect(result.current.loading).toBe(false));
    });
  });

  describe('createInvitation', () => {
    it('creates invitation successfully', async () => {
      mockCreateInvitation.mockResolvedValueOnce(mockInvitation);
      mockListInvitations.mockResolvedValueOnce([mockInvitation]);

      const { result } = renderHook(() => useInvitations(TEST_NAMESPACE));

      let invitation;
      await act(async () => {
        invitation = await result.current.createInvitation('instructor@example.com', 'instructor');
      });

      expect(invitation).toEqual(mockInvitation);
      expect(mockCreateInvitation).toHaveBeenCalledWith(TEST_NAMESPACE, 'instructor@example.com', 'instructor', undefined);
    });

    it('creates invitation with custom expiry', async () => {
      mockCreateInvitation.mockResolvedValueOnce(mockInvitation);
      mockListInvitations.mockResolvedValueOnce([mockInvitation]);

      const { result } = renderHook(() => useInvitations(TEST_NAMESPACE));

      await act(async () => {
        await result.current.createInvitation('instructor@example.com', 'namespace-admin', 14);
      });

      expect(mockCreateInvitation).toHaveBeenCalledWith(TEST_NAMESPACE, 'instructor@example.com', 'namespace-admin', 14);
    });

    it('sets error for invalid email', async () => {
      mockCreateInvitation.mockRejectedValueOnce(new Error('Invalid email format'));

      const { result } = renderHook(() => useInvitations(TEST_NAMESPACE));

      await act(async () => {
        try {
          await result.current.createInvitation('invalid-email', 'instructor');
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.error).toBe('Invalid email format');
    });

    it('sets error for duplicate invitation', async () => {
      mockCreateInvitation.mockRejectedValueOnce(new Error('An invitation has already been sent to this email'));

      const { result } = renderHook(() => useInvitations(TEST_NAMESPACE));

      await act(async () => {
        try {
          await result.current.createInvitation('existing@example.com', 'instructor');
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.error).toBe('An invitation has already been sent to this email');
    });

    it('refreshes invitations after create', async () => {
      mockCreateInvitation.mockResolvedValueOnce(mockInvitation);
      mockListInvitations.mockResolvedValueOnce([mockInvitation]);

      const { result } = renderHook(() => useInvitations(TEST_NAMESPACE));

      await act(async () => {
        await result.current.createInvitation('instructor@example.com', 'instructor');
      });

      expect(mockCreateInvitation).toHaveBeenCalledTimes(1);
      expect(mockListInvitations).toHaveBeenCalledTimes(1);
    });
  });

  describe('revokeInvitation', () => {
    it('revokes invitation successfully', async () => {
      mockRevokeInvitation.mockResolvedValueOnce(undefined);
      mockListInvitations.mockResolvedValueOnce([mockRevokedInvitation]);

      const { result } = renderHook(() => useInvitations(TEST_NAMESPACE));

      let invitation;
      await act(async () => {
        invitation = await result.current.revokeInvitation('inv-3');
      });

      // apiDelete returns void; revokeInvitation returns a stub with id and revoked_at
      expect(invitation).toMatchObject({ id: 'inv-3' });
      expect(mockRevokeInvitation).toHaveBeenCalledWith(TEST_NAMESPACE, 'inv-3');
    });

    it('sets error when revoking consumed invitation', async () => {
      mockRevokeInvitation.mockRejectedValueOnce(new Error('Cannot revoke a consumed invitation'));

      const { result } = renderHook(() => useInvitations(TEST_NAMESPACE));

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
      mockRevokeInvitation.mockResolvedValueOnce(undefined);
      mockListInvitations.mockResolvedValueOnce([]);

      const { result } = renderHook(() => useInvitations(TEST_NAMESPACE));

      await act(async () => {
        await result.current.revokeInvitation('inv-3');
      });

      expect(mockRevokeInvitation).toHaveBeenCalledTimes(1);
      expect(mockListInvitations).toHaveBeenCalledTimes(1);
    });
  });

  describe('resendInvitation', () => {
    it('resends invitation successfully', async () => {
      mockResendInvitation.mockResolvedValueOnce(mockInvitation);
      mockListInvitations.mockResolvedValueOnce([mockInvitation]);

      const { result } = renderHook(() => useInvitations(TEST_NAMESPACE));

      let invitation;
      await act(async () => {
        invitation = await result.current.resendInvitation('inv-1');
      });

      expect(invitation).toEqual(mockInvitation);
      expect(mockResendInvitation).toHaveBeenCalledWith(TEST_NAMESPACE, 'inv-1');
    });

    it('sets error when resending consumed invitation', async () => {
      mockResendInvitation.mockRejectedValueOnce(new Error('Cannot resend a consumed invitation'));

      const { result } = renderHook(() => useInvitations(TEST_NAMESPACE));

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
      mockResendInvitation.mockRejectedValueOnce(new Error('Cannot resend a revoked invitation'));

      const { result } = renderHook(() => useInvitations(TEST_NAMESPACE));

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
      mockResendInvitation.mockRejectedValueOnce(new Error('Failed to send invitation email'));

      const { result } = renderHook(() => useInvitations(TEST_NAMESPACE));

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
      const { result } = renderHook(() => useInvitations(TEST_NAMESPACE));
      expect(result.current.filter).toBe('all');
    });

    it('allows setting filter', () => {
      const { result } = renderHook(() => useInvitations(TEST_NAMESPACE));

      act(() => {
        result.current.setFilter('pending');
      });

      expect(result.current.filter).toBe('pending');
    });

    it('supports all filter values', () => {
      const { result } = renderHook(() => useInvitations(TEST_NAMESPACE));
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
      mockListInvitations.mockRejectedValueOnce(new Error('Some error'));

      const { result } = renderHook(() => useInvitations(TEST_NAMESPACE));

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

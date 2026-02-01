/**
 * Tests for useInvitations hook
 * @jest-environment jsdom
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useInvitations } from '../useInvitations';

// Mock api-client
jest.mock('@/lib/api-client', () => ({
  apiGet: jest.fn(),
  apiPost: jest.fn(),
  apiDelete: jest.fn(),
}));

import { apiGet, apiPost, apiDelete } from '@/lib/api-client';

const mockApiGet = apiGet as jest.MockedFunction<typeof apiGet>;
const mockApiPost = apiPost as jest.MockedFunction<typeof apiPost>;
const mockApiDelete = apiDelete as jest.MockedFunction<typeof apiDelete>;

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
      mockApiGet.mockResolvedValueOnce({ invitations: [mockInvitation, mockConsumedInvitation] });

      const { result } = renderHook(() => useInvitations());

      await act(async () => {
        await result.current.fetchInvitations();
      });

      expect(result.current.invitations).toHaveLength(2);
      expect(result.current.invitations[0].email).toBe('instructor@example.com');
      expect(result.current.error).toBeNull();
      expect(mockApiGet).toHaveBeenCalledWith('/invitations?');
    });

    it('fetches invitations with status filter', async () => {
      mockApiGet.mockResolvedValueOnce({ invitations: [mockInvitation] });

      const { result } = renderHook(() => useInvitations());

      await act(async () => {
        await result.current.fetchInvitations({ status: 'pending' });
      });

      expect(mockApiGet).toHaveBeenCalledWith('/invitations?status=pending');
    });

    it('fetches invitations with email filter', async () => {
      mockApiGet.mockResolvedValueOnce({ invitations: [mockInvitation] });

      const { result } = renderHook(() => useInvitations());

      await act(async () => {
        await result.current.fetchInvitations({ email: 'test@' });
      });

      expect(mockApiGet).toHaveBeenCalledWith('/invitations?email=test%40');
    });

    it('sets error when fetch fails', async () => {
      mockApiGet.mockRejectedValueOnce(new Error('Failed to load invitations'));

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
      mockApiGet.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve({ invitations: [] }), 100))
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
      mockApiPost.mockResolvedValueOnce({ invitation: mockInvitation });
      mockApiGet.mockResolvedValueOnce({ invitations: [mockInvitation] });

      const { result } = renderHook(() => useInvitations());

      let invitation;
      await act(async () => {
        invitation = await result.current.createInvitation('instructor@example.com');
      });

      expect(invitation).toEqual(mockInvitation);
      expect(mockApiPost).toHaveBeenCalledWith('/invitations', { email: 'instructor@example.com' });
    });

    it('creates invitation with custom expiry', async () => {
      mockApiPost.mockResolvedValueOnce({ invitation: mockInvitation });
      mockApiGet.mockResolvedValueOnce({ invitations: [mockInvitation] });

      const { result } = renderHook(() => useInvitations());

      await act(async () => {
        await result.current.createInvitation('instructor@example.com', 14);
      });

      expect(mockApiPost).toHaveBeenCalledWith('/invitations', {
        email: 'instructor@example.com',
        expiresInDays: 14,
      });
    });

    it('sets error for invalid email', async () => {
      mockApiPost.mockRejectedValueOnce(new Error('Invalid email format'));

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
      mockApiPost.mockRejectedValueOnce(new Error('An invitation has already been sent to this email'));

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
      mockApiPost.mockResolvedValueOnce({ invitation: mockInvitation });
      mockApiGet.mockResolvedValueOnce({ invitations: [mockInvitation] });

      const { result } = renderHook(() => useInvitations());

      await act(async () => {
        await result.current.createInvitation('instructor@example.com');
      });

      // apiPost for create + apiGet for refresh
      expect(mockApiPost).toHaveBeenCalledTimes(1);
      expect(mockApiGet).toHaveBeenCalledTimes(1);
    });
  });

  describe('revokeInvitation', () => {
    it('revokes invitation successfully', async () => {
      mockApiDelete.mockResolvedValueOnce({ invitation: mockRevokedInvitation } as any);
      mockApiGet.mockResolvedValueOnce({ invitations: [mockRevokedInvitation] });

      const { result } = renderHook(() => useInvitations());

      let invitation;
      await act(async () => {
        invitation = await result.current.revokeInvitation('inv-3');
      });

      // apiDelete returns void; revokeInvitation returns a stub with id and revokedAt
      expect(invitation).toMatchObject({ id: 'inv-3' });
      expect(mockApiDelete).toHaveBeenCalledWith('/invitations/inv-3');
    });

    it('sets error when revoking consumed invitation', async () => {
      mockApiDelete.mockRejectedValueOnce(new Error('Cannot revoke a consumed invitation'));

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
      mockApiDelete.mockResolvedValueOnce({ invitation: mockRevokedInvitation } as any);
      mockApiGet.mockResolvedValueOnce({ invitations: [] });

      const { result } = renderHook(() => useInvitations());

      await act(async () => {
        await result.current.revokeInvitation('inv-3');
      });

      expect(mockApiDelete).toHaveBeenCalledTimes(1);
      expect(mockApiGet).toHaveBeenCalledTimes(1);
    });
  });

  describe('resendInvitation', () => {
    it('resends invitation successfully', async () => {
      mockApiPost.mockResolvedValueOnce({ invitation: mockInvitation });
      mockApiGet.mockResolvedValueOnce({ invitations: [mockInvitation] });

      const { result } = renderHook(() => useInvitations());

      let invitation;
      await act(async () => {
        invitation = await result.current.resendInvitation('inv-1');
      });

      expect(invitation).toEqual(mockInvitation);
      expect(mockApiPost).toHaveBeenCalledWith('/invitations/inv-1/resend');
    });

    it('sets error when resending consumed invitation', async () => {
      mockApiPost.mockRejectedValueOnce(new Error('Cannot resend a consumed invitation'));

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
      mockApiPost.mockRejectedValueOnce(new Error('Cannot resend a revoked invitation'));

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
      mockApiPost.mockRejectedValueOnce(new Error('Failed to send invitation email'));

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
      mockApiGet.mockRejectedValueOnce(new Error('Some error'));

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

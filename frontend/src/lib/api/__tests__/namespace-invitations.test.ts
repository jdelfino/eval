/**
 * Unit tests for namespace-invitations API client functions.
 * @jest-environment jsdom
 */

const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
const mockApiDelete = jest.fn();

jest.mock('@/lib/api-client', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiDelete: (...args: unknown[]) => mockApiDelete(...args),
}));

import {
  listNamespaceInvitations,
  createNamespaceInvitation,
  revokeNamespaceInvitation,
  resendNamespaceInvitation,
} from '../namespace-invitations';
import type { SerializedInvitation } from '../invitations';

const fakeInvitation: SerializedInvitation = {
  id: 'inv-1',
  email: 'instructor@example.com',
  target_role: 'instructor',
  namespace_id: 'ns-1',
  created_by: 'admin-1',
  created_at: '2024-01-01T00:00:00Z',
  expires_at: '2024-02-01T00:00:00Z',
  status: 'pending',
};

describe('namespace-invitations API client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listNamespaceInvitations', () => {
    it('calls GET /system/invitations without filters', async () => {
      mockApiGet.mockResolvedValue([fakeInvitation]);

      const result = await listNamespaceInvitations();

      expect(mockApiGet).toHaveBeenCalledWith('/system/invitations');
      expect(result).toEqual([fakeInvitation]);
    });

    it('includes status filter as query param', async () => {
      mockApiGet.mockResolvedValue([]);

      await listNamespaceInvitations({ status: 'pending' });

      expect(mockApiGet).toHaveBeenCalledWith('/system/invitations?status=pending');
    });

    it('returns array directly from API', async () => {
      const invitations = [fakeInvitation, { ...fakeInvitation, id: 'inv-2' }];
      mockApiGet.mockResolvedValue(invitations);

      const result = await listNamespaceInvitations();

      expect(result).toEqual(invitations);
    });
  });

  describe('createNamespaceInvitation', () => {
    it('calls POST /system/invitations with email', async () => {
      mockApiPost.mockResolvedValue(fakeInvitation);

      const result = await createNamespaceInvitation('instructor@example.com');

      expect(mockApiPost).toHaveBeenCalledWith('/system/invitations', {
        email: 'instructor@example.com',
      });
      expect(result).toEqual(fakeInvitation);
    });

    it('includes expiresInDays when provided', async () => {
      mockApiPost.mockResolvedValue(fakeInvitation);

      await createNamespaceInvitation('instructor@example.com', 14);

      expect(mockApiPost).toHaveBeenCalledWith('/system/invitations', {
        email: 'instructor@example.com',
        expiresInDays: 14,
      });
    });

    it('omits expiresInDays when undefined', async () => {
      mockApiPost.mockResolvedValue(fakeInvitation);

      await createNamespaceInvitation('instructor@example.com');

      const body = mockApiPost.mock.calls[0][1];
      expect(body).not.toHaveProperty('expiresInDays');
    });
  });

  describe('revokeNamespaceInvitation', () => {
    it('calls DELETE /system/invitations/{id}', async () => {
      mockApiDelete.mockResolvedValue(undefined);

      await revokeNamespaceInvitation('inv-1');

      expect(mockApiDelete).toHaveBeenCalledWith('/system/invitations/inv-1');
    });
  });

  describe('resendNamespaceInvitation', () => {
    it('calls POST /system/invitations/{id}/resend with empty body', async () => {
      mockApiPost.mockResolvedValue(undefined);

      await resendNamespaceInvitation('inv-1');

      expect(mockApiPost).toHaveBeenCalledWith('/system/invitations/inv-1/resend', {});
    });
  });
});

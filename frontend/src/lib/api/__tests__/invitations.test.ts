/**
 * Unit tests for invitations API client functions.
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
  listInvitations,
  createInvitation,
  revokeInvitation,
  resendInvitation,
} from '../invitations';
import type { SerializedInvitation } from '../invitations';

describe('invitations API client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockInvitation: SerializedInvitation = {
    id: 'inv-1',
    email: 'instructor@example.com',
    target_role: 'instructor',
    namespace_id: 'ns-1',
    created_by: 'admin-1',
    created_at: '2024-01-01T00:00:00Z',
    expires_at: '2024-01-08T00:00:00Z',
    status: 'pending',
  };

  describe('listInvitations', () => {
    it('calls GET /invitations and returns array directly', async () => {
      mockApiGet.mockResolvedValue([mockInvitation]);

      const result = await listInvitations();

      expect(mockApiGet).toHaveBeenCalledWith('/invitations');
      expect(result).toEqual([mockInvitation]);
    });

    it('includes status filter in query params', async () => {
      mockApiGet.mockResolvedValue([mockInvitation]);

      await listInvitations({ status: 'pending' });

      expect(mockApiGet).toHaveBeenCalledWith('/invitations?status=pending');
    });

    it('includes email filter in query params', async () => {
      mockApiGet.mockResolvedValue([mockInvitation]);

      await listInvitations({ email: 'test@example.com' });

      expect(mockApiGet).toHaveBeenCalledWith('/invitations?email=test%40example.com');
    });

    it('includes both filters in query params', async () => {
      mockApiGet.mockResolvedValue([mockInvitation]);

      await listInvitations({ status: 'pending', email: 'test@' });

      expect(mockApiGet).toHaveBeenCalledWith('/invitations?status=pending&email=test%40');
    });
  });

  describe('createInvitation', () => {
    it('calls POST /invitations and returns invitation directly', async () => {
      mockApiPost.mockResolvedValue(mockInvitation);

      const result = await createInvitation('instructor@example.com');

      expect(mockApiPost).toHaveBeenCalledWith('/invitations', { email: 'instructor@example.com' });
      expect(result).toEqual(mockInvitation);
    });

    it('includes expiresInDays when provided', async () => {
      mockApiPost.mockResolvedValue(mockInvitation);

      await createInvitation('instructor@example.com', 14);

      expect(mockApiPost).toHaveBeenCalledWith('/invitations', {
        email: 'instructor@example.com',
        expiresInDays: 14,
      });
    });
  });

  describe('revokeInvitation', () => {
    it('calls DELETE /invitations/{id} and returns void', async () => {
      mockApiDelete.mockResolvedValue(undefined);

      await revokeInvitation('inv-1');

      expect(mockApiDelete).toHaveBeenCalledWith('/invitations/inv-1');
    });
  });

  describe('resendInvitation', () => {
    it('calls POST /invitations/{id}/resend and returns invitation directly', async () => {
      mockApiPost.mockResolvedValue(mockInvitation);

      const result = await resendInvitation('inv-1');

      expect(mockApiPost).toHaveBeenCalledWith('/invitations/inv-1/resend');
      expect(result).toEqual(mockInvitation);
    });
  });
});

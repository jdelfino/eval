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
import {
  listSystemInvitations,
  createSystemInvitation,
} from '../system';
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
    it('calls GET /namespaces/{id}/invitations and returns array directly', async () => {
      mockApiGet.mockResolvedValue([mockInvitation]);

      const result = await listInvitations('ns-1');

      expect(mockApiGet).toHaveBeenCalledWith('/namespaces/ns-1/invitations');
      expect(result).toEqual([mockInvitation]);
    });

    it('includes status filter in query params', async () => {
      mockApiGet.mockResolvedValue([mockInvitation]);

      await listInvitations('ns-1', { status: 'pending' });

      expect(mockApiGet).toHaveBeenCalledWith('/namespaces/ns-1/invitations?status=pending');
    });

    it('includes email filter in query params', async () => {
      mockApiGet.mockResolvedValue([mockInvitation]);

      await listInvitations('ns-1', { email: 'test@example.com' });

      expect(mockApiGet).toHaveBeenCalledWith('/namespaces/ns-1/invitations?email=test%40example.com');
    });

    it('includes both filters in query params', async () => {
      mockApiGet.mockResolvedValue([mockInvitation]);

      await listInvitations('ns-1', { status: 'pending', email: 'test@' });

      expect(mockApiGet).toHaveBeenCalledWith('/namespaces/ns-1/invitations?status=pending&email=test%40');
    });
  });

  describe('listSystemInvitations', () => {
    it('calls GET /system/invitations and returns array from wrapped response', async () => {
      mockApiGet.mockResolvedValue({ invitations: [mockInvitation] });

      const result = await listSystemInvitations();

      expect(mockApiGet).toHaveBeenCalledWith('/system/invitations');
      expect(result).toEqual([mockInvitation]);
    });
  });

  describe('createInvitation', () => {
    it('calls POST /namespaces/{id}/invitations and returns invitation directly', async () => {
      mockApiPost.mockResolvedValue(mockInvitation);

      const result = await createInvitation('ns-1', 'instructor@example.com', 'instructor');

      expect(mockApiPost).toHaveBeenCalledWith('/namespaces/ns-1/invitations', {
        email: 'instructor@example.com',
        target_role: 'instructor',
      });
      expect(result).toEqual(mockInvitation);
    });

    it('includes expires_in_days when provided', async () => {
      mockApiPost.mockResolvedValue(mockInvitation);

      await createInvitation('ns-1', 'instructor@example.com', 'namespace-admin', 14);

      expect(mockApiPost).toHaveBeenCalledWith('/namespaces/ns-1/invitations', {
        email: 'instructor@example.com',
        target_role: 'namespace-admin',
        expires_in_days: 14,
      });
    });
  });

  describe('createSystemInvitation', () => {
    it('calls POST /system/invitations and returns invitation directly', async () => {
      mockApiPost.mockResolvedValue(mockInvitation);

      const result = await createSystemInvitation('instructor@example.com', 'ns-1', 'instructor');

      expect(mockApiPost).toHaveBeenCalledWith('/system/invitations', {
        email: 'instructor@example.com',
        namespace_id: 'ns-1',
        targetRole: 'instructor',
      });
      expect(result).toEqual(mockInvitation);
    });
  });

  describe('revokeInvitation', () => {
    it('calls DELETE /namespaces/{id}/invitations/{invId} and returns void', async () => {
      mockApiDelete.mockResolvedValue(undefined);

      await revokeInvitation('ns-1', 'inv-1');

      expect(mockApiDelete).toHaveBeenCalledWith('/namespaces/ns-1/invitations/inv-1');
    });
  });

  describe('resendInvitation', () => {
    it('calls POST /namespaces/{id}/invitations/{invId}/resend and returns invitation directly', async () => {
      mockApiPost.mockResolvedValue(mockInvitation);

      const result = await resendInvitation('ns-1', 'inv-1');

      expect(mockApiPost).toHaveBeenCalledWith('/namespaces/ns-1/invitations/inv-1/resend');
      expect(result).toEqual(mockInvitation);
    });
  });
});

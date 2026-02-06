/**
 * Unit tests for system API client functions.
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
  listSystemUsers,
  listSystemNamespaces,
  getSystemNamespace,
  listSystemInvitations,
  createSystemInvitation,
  revokeSystemInvitation,
  resendSystemInvitation,
} from '../system';
import type { User } from '@/types/api';
import type { SerializedInvitation } from '../invitations';

const fakeUser: User = {
  id: 'u1',
  external_id: 'ext-1',
  email: 'admin@example.com',
  role: 'instructor',
  namespace_id: 'ns-1',
  display_name: 'Admin User',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const fakeInvitation: SerializedInvitation = {
  id: 'inv-1',
  email: 'new@example.com',
  target_role: 'namespace-admin',
  namespace_id: 'ns-1',
  created_by: 'admin-1',
  created_at: '2024-01-01T00:00:00Z',
  expires_at: '2024-02-01T00:00:00Z',
  status: 'pending',
};

describe('system API client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listSystemUsers', () => {
    it('calls GET /system/users and returns users array', async () => {
      mockApiGet.mockResolvedValue([fakeUser]);

      const result = await listSystemUsers();

      expect(mockApiGet).toHaveBeenCalledWith('/system/users');
      expect(result).toEqual([fakeUser]);
    });
  });

  describe('listSystemNamespaces', () => {
    it('calls GET /system/namespaces and maps response to NamespaceInfo[]', async () => {
      mockApiGet.mockResolvedValue({
        success: true,
        namespaces: [
          { id: 'ns-1', display_name: 'University A', active: true },
          { id: 'ns-2', display_name: 'University B', active: false },
        ],
      });

      const result = await listSystemNamespaces();

      expect(mockApiGet).toHaveBeenCalledWith('/system/namespaces');
      expect(result).toEqual([
        { id: 'ns-1', displayName: 'University A', active: true },
        { id: 'ns-2', displayName: 'University B', active: false },
      ]);
    });

    it('maps display_name to displayName in the response', async () => {
      mockApiGet.mockResolvedValue({
        success: true,
        namespaces: [{ id: 'ns-1', display_name: 'Test NS', active: true }],
      });

      const result = await listSystemNamespaces();

      expect(result[0]).toHaveProperty('displayName', 'Test NS');
      expect(result[0]).not.toHaveProperty('display_name');
    });
  });

  describe('getSystemNamespace', () => {
    it('calls GET /system/namespaces/{id} and maps to NamespaceInfo', async () => {
      mockApiGet.mockResolvedValue({
        success: true,
        namespace: { id: 'ns-1', display_name: 'University A', active: true },
      });

      const result = await getSystemNamespace('ns-1');

      expect(mockApiGet).toHaveBeenCalledWith('/system/namespaces/ns-1');
      expect(result).toEqual({
        id: 'ns-1',
        displayName: 'University A',
        active: true,
      });
    });
  });

  describe('listSystemInvitations', () => {
    it('calls GET /system/invitations without filters', async () => {
      mockApiGet.mockResolvedValue([fakeInvitation]);

      const result = await listSystemInvitations();

      expect(mockApiGet).toHaveBeenCalledWith('/system/invitations');
      expect(result).toEqual([fakeInvitation]);
    });

    it('includes namespace_id filter', async () => {
      mockApiGet.mockResolvedValue([]);

      await listSystemInvitations({ namespace_id: 'ns-1' });

      expect(mockApiGet).toHaveBeenCalledWith('/system/invitations?namespace_id=ns-1');
    });

    it('includes targetRole filter', async () => {
      mockApiGet.mockResolvedValue([]);

      await listSystemInvitations({ targetRole: 'namespace-admin' });

      expect(mockApiGet).toHaveBeenCalledWith('/system/invitations?targetRole=namespace-admin');
    });

    it('includes status filter', async () => {
      mockApiGet.mockResolvedValue([]);

      await listSystemInvitations({ status: 'pending' });

      expect(mockApiGet).toHaveBeenCalledWith('/system/invitations?status=pending');
    });

    it('combines multiple filters', async () => {
      mockApiGet.mockResolvedValue([]);

      await listSystemInvitations({
        namespace_id: 'ns-1',
        targetRole: 'instructor',
        status: 'pending',
      });

      expect(mockApiGet).toHaveBeenCalledWith(
        '/system/invitations?namespace_id=ns-1&targetRole=instructor&status=pending'
      );
    });

    it('returns array directly from API', async () => {
      const invitations = [fakeInvitation, { ...fakeInvitation, id: 'inv-2' }];
      mockApiGet.mockResolvedValue(invitations);

      const result = await listSystemInvitations();

      expect(result).toEqual(invitations);
    });
  });

  describe('createSystemInvitation', () => {
    it('calls POST /system/invitations with email, namespace, and role', async () => {
      mockApiPost.mockResolvedValue(fakeInvitation);

      const result = await createSystemInvitation('new@example.com', 'ns-1', 'namespace-admin');

      expect(mockApiPost).toHaveBeenCalledWith('/system/invitations', {
        email: 'new@example.com',
        namespace_id: 'ns-1',
        targetRole: 'namespace-admin',
      });
      expect(result).toEqual(fakeInvitation);
    });

    it('supports instructor role', async () => {
      mockApiPost.mockResolvedValue(fakeInvitation);

      await createSystemInvitation('new@example.com', 'ns-2', 'instructor');

      expect(mockApiPost).toHaveBeenCalledWith('/system/invitations', {
        email: 'new@example.com',
        namespace_id: 'ns-2',
        targetRole: 'instructor',
      });
    });
  });

  describe('revokeSystemInvitation', () => {
    it('calls DELETE /system/invitations/{id}', async () => {
      mockApiDelete.mockResolvedValue(undefined);

      await revokeSystemInvitation('inv-1');

      expect(mockApiDelete).toHaveBeenCalledWith('/system/invitations/inv-1');
    });
  });

  describe('resendSystemInvitation', () => {
    it('calls POST /system/invitations/{id}/resend with empty body', async () => {
      mockApiPost.mockResolvedValue(undefined);

      await resendSystemInvitation('inv-1');

      expect(mockApiPost).toHaveBeenCalledWith('/system/invitations/inv-1/resend', {});
    });
  });
});

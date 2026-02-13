/**
 * Unit tests for the typed API client functions for namespaces.
 * These tests verify that the typed API functions correctly call the underlying
 * api-client methods and return responses directly (backend returns plain objects).
 *
 * @jest-environment jsdom
 */

const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
const mockApiPut = jest.fn();
const mockApiPatch = jest.fn();
const mockApiDelete = jest.fn();

jest.mock('@/lib/api-client', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiPut: (...args: unknown[]) => mockApiPut(...args),
  apiPatch: (...args: unknown[]) => mockApiPatch(...args),
  apiDelete: (...args: unknown[]) => mockApiDelete(...args),
}));

import {
  listNamespaces,
  createNamespace,
  updateNamespace,
  deleteNamespace,
  getNamespaceUsers,
  createUser,
  updateUserRole,
  deleteUser,
  type NamespaceWithStats,
} from '../namespaces';
import type { Namespace, User } from '@/types/api';

const fakeNamespace: Namespace = {
  id: 'ns-1',
  display_name: 'Test NS',
  active: true,
  max_instructors: null,
  max_students: null,
  created_at: '2024-01-01T00:00:00Z',
  created_by: null,
  updated_at: '2024-01-01T00:00:00Z',
};

const fakeNamespaceWithStats: NamespaceWithStats = {
  ...fakeNamespace,
  userCount: 5,
};

const fakeUser: User = {
  id: 'u1',
  external_id: null,
  email: 'a@b.com',
  role: 'instructor',
  namespace_id: 'ns-1',
  display_name: 'A',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('lib/api/namespaces', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listNamespaces', () => {
    it('calls GET /namespaces and returns plain NamespaceWithStats array', async () => {
      // Backend returns plain array (not wrapped in { namespaces: [...] })
      mockApiGet.mockResolvedValue([fakeNamespaceWithStats]);

      const result = await listNamespaces();

      expect(mockApiGet).toHaveBeenCalledWith('/namespaces?');
      expect(result).toEqual([fakeNamespaceWithStats]);
    });

    it('passes includeInactive=true query param', async () => {
      mockApiGet.mockResolvedValue([]);

      const result = await listNamespaces(true);

      expect(mockApiGet).toHaveBeenCalledWith('/namespaces?includeInactive=true');
      expect(result).toEqual([]);
    });

    it('returns empty array when API returns empty array', async () => {
      mockApiGet.mockResolvedValue([]);

      const result = await listNamespaces();

      expect(result).toEqual([]);
    });
  });

  describe('createNamespace', () => {
    it('calls POST /namespaces with id and display_name, returns plain Namespace', async () => {
      // Backend returns plain object (not wrapped in { namespace: ... })
      mockApiPost.mockResolvedValue(fakeNamespace);

      const result = await createNamespace('ns-1', 'Test NS');

      expect(mockApiPost).toHaveBeenCalledWith('/namespaces', { id: 'ns-1', display_name: 'Test NS' });
      expect(result).toEqual(fakeNamespace);
    });
  });

  describe('updateNamespace', () => {
    it('calls PATCH /namespaces/{id} and returns plain Namespace', async () => {
      const updated = { ...fakeNamespace, display_name: 'New Name' };
      // Backend returns plain object (not wrapped)
      mockApiPatch.mockResolvedValue(updated);

      const result = await updateNamespace('ns-1', { display_name: 'New Name' });

      expect(mockApiPatch).toHaveBeenCalledWith('/namespaces/ns-1', { display_name: 'New Name' });
      expect(result).toEqual(updated);
    });

    it('can update active field', async () => {
      const updated = { ...fakeNamespace, active: false };
      mockApiPatch.mockResolvedValue(updated);

      const result = await updateNamespace('ns-1', { active: false });

      expect(mockApiPatch).toHaveBeenCalledWith('/namespaces/ns-1', { active: false });
      expect(result).toEqual(updated);
    });
  });

  describe('deleteNamespace', () => {
    it('calls DELETE /namespaces/{id} and returns void', async () => {
      mockApiDelete.mockResolvedValue(undefined);

      const result = await deleteNamespace('ns-1');

      expect(mockApiDelete).toHaveBeenCalledWith('/namespaces/ns-1');
      expect(result).toBeUndefined();
    });
  });

  describe('getNamespaceUsers', () => {
    it('calls GET /namespaces/{id}/users and returns plain User array', async () => {
      // Backend returns plain array (not wrapped in { users: [...] })
      mockApiGet.mockResolvedValue([fakeUser]);

      const result = await getNamespaceUsers('ns-1');

      expect(mockApiGet).toHaveBeenCalledWith('/namespaces/ns-1/users');
      expect(result).toEqual([fakeUser]);
    });

    it('returns empty array when API returns empty array', async () => {
      mockApiGet.mockResolvedValue([]);

      const result = await getNamespaceUsers('ns-1');

      expect(result).toEqual([]);
    });
  });

  describe('createUser', () => {
    it('calls POST /namespaces/{id}/users and returns plain User', async () => {
      // Backend returns plain object (not wrapped in { user: ... })
      mockApiPost.mockResolvedValue(fakeUser);

      const result = await createUser('ns-1', 'a@b.com', 'auser', 'pass', 'instructor');

      expect(mockApiPost).toHaveBeenCalledWith('/namespaces/ns-1/users', {
        email: 'a@b.com',
        username: 'auser',
        password: 'pass',
        role: 'instructor',
      });
      expect(result).toEqual(fakeUser);
    });

    it('supports all role types', async () => {
      mockApiPost.mockResolvedValue(fakeUser);

      await createUser('ns-1', 'a@b.com', 'auser', 'pass', 'namespace-admin');
      expect(mockApiPost).toHaveBeenCalledWith('/namespaces/ns-1/users', expect.objectContaining({ role: 'namespace-admin' }));

      await createUser('ns-1', 'a@b.com', 'auser', 'pass', 'student');
      expect(mockApiPost).toHaveBeenCalledWith('/namespaces/ns-1/users', expect.objectContaining({ role: 'student' }));
    });
  });

  describe('updateUserRole', () => {
    it('calls PUT /system/users/{id} and returns plain User', async () => {
      const updated = { ...fakeUser, role: 'student' as const };
      // Backend returns plain object (not wrapped in { user: ... })
      mockApiPut.mockResolvedValue(updated);

      const result = await updateUserRole('u1', 'student');

      expect(mockApiPut).toHaveBeenCalledWith('/system/users/u1', { role: 'student' });
      expect(result).toEqual(updated);
    });
  });

  describe('deleteUser', () => {
    it('calls DELETE /system/users/{id} and returns void', async () => {
      mockApiDelete.mockResolvedValue(undefined);

      const result = await deleteUser('u1');

      expect(mockApiDelete).toHaveBeenCalledWith('/system/users/u1');
      expect(result).toBeUndefined();
    });
  });
});

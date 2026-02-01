'use client';

import { useState, useCallback } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client';
import type { Namespace, User } from '@/types/api';

interface NamespaceWithStats extends Namespace {
  userCount: number;
}

export interface UseNamespacesResult {
  namespaces: NamespaceWithStats[];
  loading: boolean;
  error: string | null;
  fetchNamespaces: (includeInactive?: boolean) => Promise<void>;
  createNamespace: (id: string, displayName: string) => Promise<Namespace>;
  updateNamespace: (id: string, updates: { display_name?: string; active?: boolean }) => Promise<Namespace>;
  deleteNamespace: (id: string) => Promise<void>;
  getNamespaceUsers: (namespaceId: string) => Promise<User[]>;
  createUser: (namespaceId: string, email: string, username: string, password: string, role: 'namespace-admin' | 'instructor' | 'student') => Promise<User>;
  updateUserRole: (userId: string, role: 'namespace-admin' | 'instructor' | 'student') => Promise<User>;
  deleteUser: (userId: string) => Promise<void>;
}

/**
 * Hook for managing namespaces (system-admin only)
 */
export function useNamespaces(): UseNamespacesResult {
  const [namespaces, setNamespaces] = useState<NamespaceWithStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNamespaces = useCallback(async (includeInactive: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (includeInactive) {
        params.set('includeInactive', 'true');
      }
      const data = await apiGet<{ namespaces: NamespaceWithStats[] }>(`/namespaces?${params}`);
      setNamespaces(data.namespaces);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch namespaces';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createNamespace = useCallback(async (id: string, displayName: string): Promise<Namespace> => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiPost<{ namespace: Namespace }>('/namespaces', { id, display_name: displayName });
      await fetchNamespaces();
      return data.namespace;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create namespace';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchNamespaces]);

  const updateNamespace = useCallback(async (
    id: string,
    updates: { display_name?: string; active?: boolean }
  ): Promise<Namespace> => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiPatch<{ namespace: Namespace }>(`/namespaces/${id}`, updates);
      await fetchNamespaces();
      return data.namespace;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update namespace';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchNamespaces]);

  const deleteNamespace = useCallback(async (id: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await apiDelete(`/namespaces/${id}`);
      await fetchNamespaces();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete namespace';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchNamespaces]);

  const getNamespaceUsers = useCallback(async (namespaceId: string): Promise<User[]> => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ users: User[] }>(`/namespaces/${namespaceId}/users`);
      return data.users;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch users';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createUser = useCallback(async (
    namespaceId: string,
    email: string,
    username: string,
    password: string,
    role: 'namespace-admin' | 'instructor' | 'student'
  ): Promise<User> => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiPost<{ user: User }>(`/namespaces/${namespaceId}/users`, { email, username, password, role });
      return data.user;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create user';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateUserRole = useCallback(async (
    userId: string,
    role: 'namespace-admin' | 'instructor' | 'student'
  ): Promise<User> => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiPatch<{ user: User }>(`/users/${userId}`, { role });
      return data.user;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update user';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteUser = useCallback(async (userId: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await apiDelete(`/users/${userId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete user';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    namespaces,
    loading,
    error,
    fetchNamespaces,
    createNamespace,
    updateNamespace,
    deleteNamespace,
    getNamespaceUsers,
    createUser,
    updateUserRole,
    deleteUser,
  };
}

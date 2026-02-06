'use client';

import { useState, useCallback } from 'react';
import {
  listNamespaces as apiListNamespaces,
  createNamespace as apiCreateNamespace,
  updateNamespace as apiUpdateNamespace,
  deleteNamespace as apiDeleteNamespace,
  getNamespaceUsers as apiGetNamespaceUsers,
  createUser as apiCreateUser,
  updateUserRole as apiUpdateUserRole,
  deleteUser as apiDeleteUser,
  type NamespaceWithStats,
} from '@/lib/api/namespaces';
import type { Namespace, User } from '@/types/api';

export interface UseNamespacesResult {
  namespaces: NamespaceWithStats[];
  loading: boolean;
  error: string | null;
  fetchNamespaces: (includeInactive?: boolean) => Promise<void>;
  createNamespace: (id: string, displayName: string) => Promise<Namespace>;
  updateNamespace: (id: string, updates: { display_name?: string; active?: boolean }) => Promise<Namespace>;
  deleteNamespace: (id: string) => Promise<void>;
  getNamespaceUsers: (namespace_id: string) => Promise<User[]>;
  createUser: (namespace_id: string, email: string, username: string, password: string, role: 'namespace-admin' | 'instructor' | 'student') => Promise<User>;
  updateUserRole: (user_id: string, role: 'namespace-admin' | 'instructor' | 'student') => Promise<User>;
  deleteUser: (user_id: string) => Promise<void>;
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
      const namespaceList = await apiListNamespaces(includeInactive);
      setNamespaces(namespaceList);
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
      const namespace = await apiCreateNamespace(id, displayName);
      await fetchNamespaces();
      return namespace;
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
      const namespace = await apiUpdateNamespace(id, updates);
      await fetchNamespaces();
      return namespace;
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
      await apiDeleteNamespace(id);
      await fetchNamespaces();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete namespace';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchNamespaces]);

  const getNamespaceUsers = useCallback(async (namespace_id: string): Promise<User[]> => {
    setLoading(true);
    setError(null);
    try {
      const users = await apiGetNamespaceUsers(namespace_id);
      return users;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch users';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createUser = useCallback(async (
    namespace_id: string,
    email: string,
    username: string,
    password: string,
    role: 'namespace-admin' | 'instructor' | 'student'
  ): Promise<User> => {
    setLoading(true);
    setError(null);
    try {
      const user = await apiCreateUser(namespace_id, email, username, password, role);
      return user;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create user';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateUserRole = useCallback(async (
    user_id: string,
    role: 'namespace-admin' | 'instructor' | 'student'
  ): Promise<User> => {
    setLoading(true);
    setError(null);
    try {
      const user = await apiUpdateUserRole(user_id, role);
      return user;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update user';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteUser = useCallback(async (user_id: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await apiDeleteUser(user_id);
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

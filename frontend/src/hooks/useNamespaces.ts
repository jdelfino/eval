'use client';

import { useState, useCallback } from 'react';
import { Namespace } from '@/server/auth/types';
import { User } from '@/server/auth/types';

interface NamespaceWithStats extends Namespace {
  userCount: number;
}

export interface UseNamespacesResult {
  namespaces: NamespaceWithStats[];
  loading: boolean;
  error: string | null;
  fetchNamespaces: (includeInactive?: boolean) => Promise<void>;
  createNamespace: (id: string, displayName: string) => Promise<Namespace>;
  updateNamespace: (id: string, updates: { displayName?: string; active?: boolean }) => Promise<Namespace>;
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

  /**
   * Fetch all namespaces
   */
  const fetchNamespaces = useCallback(async (includeInactive: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (includeInactive) {
        params.set('includeInactive', 'true');
      }

      const response = await fetch(`/api/system/namespaces?${params}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch namespaces');
      }

      const data = await response.json();
      setNamespaces(data.namespaces);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch namespaces';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Create a new namespace
   */
  const createNamespace = useCallback(async (id: string, displayName: string): Promise<Namespace> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/system/namespaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, displayName }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create namespace');
      }

      const data = await response.json();

      // Refresh namespace list
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

  /**
   * Update a namespace
   */
  const updateNamespace = useCallback(async (
    id: string,
    updates: { displayName?: string; active?: boolean }
  ): Promise<Namespace> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/system/namespaces/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update namespace');
      }

      const data = await response.json();

      // Refresh namespace list
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

  /**
   * Delete a namespace (soft delete)
   */
  const deleteNamespace = useCallback(async (id: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/system/namespaces/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete namespace');
      }

      // Refresh namespace list
      await fetchNamespaces();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete namespace';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchNamespaces]);

  /**
   * Get all users in a namespace
   */
  const getNamespaceUsers = useCallback(async (namespaceId: string): Promise<User[]> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/system/namespaces/${namespaceId}/users`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch users');
      }

      const data = await response.json();
      return data.users;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch users';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Create a new user in a namespace
   */
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
      const response = await fetch(`/api/system/namespaces/${namespaceId}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, password, role }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create user');
      }

      const data = await response.json();
      return data.user;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create user';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Update a user's role
   */
  const updateUserRole = useCallback(async (
    userId: string,
    role: 'namespace-admin' | 'instructor' | 'student'
  ): Promise<User> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/system/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update user');
      }

      const data = await response.json();
      return data.user;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update user';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Delete a user
   */
  const deleteUser = useCallback(async (userId: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/system/users/${userId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete user');
      }
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

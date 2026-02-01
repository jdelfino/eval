/**
 * useSelectedNamespace Hook
 *
 * Returns the namespace context for API calls:
 * - For system-admin: Returns the namespace selected in the dropdown (from localStorage)
 * - For other users: Returns their own namespace_id
 */

import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Compute the namespace synchronously from the current user.
 * Safe for SSR: falls back to user.namespace_id when window is unavailable.
 */
function getInitialNamespace(user: Pick<{ role: string; namespace_id: string | null }, 'role' | 'namespace_id'> | null): string | null {
  if (!user) return null;
  if (typeof window === 'undefined') return user.namespace_id;
  if (user.role === 'system-admin') {
    const saved = localStorage.getItem('selectedNamespaceId');
    if (saved === 'all') return null;
    return saved || user.namespace_id || 'default';
  }
  return user.namespace_id;
}

export function useSelectedNamespace(): string | null {
  const { user } = useAuth();
  return useMemo(() => getInitialNamespace(user), [user]);
}

/**
 * Get query parameter for namespace filtering (system-admin only)
 * Returns '?namespace=xxx' for system-admin, empty string for others
 */
export function useNamespaceQueryParam(): string {
  const { user } = useAuth();
  const selectedNamespaceId = useSelectedNamespace();

  if (!user || user.role !== 'system-admin' || !selectedNamespaceId) {
    return '';
  }

  return `?namespace=${selectedNamespaceId}`;
}

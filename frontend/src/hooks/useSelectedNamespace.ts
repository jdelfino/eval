/**
 * useSelectedNamespace Hook
 *
 * Returns the namespace context for API calls:
 * - For system-admin: Returns the namespace selected in the dropdown (from localStorage)
 * - For other users: Returns their own namespaceId
 */

import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Compute the namespace synchronously from the current user.
 * Safe for SSR: falls back to user.namespaceId when window is unavailable.
 */
function getInitialNamespace(user: Pick<{ role: string; namespaceId: string | null }, 'role' | 'namespaceId'> | null): string | null {
  if (!user) return null;
  if (typeof window === 'undefined') return user.namespaceId;
  if (user.role === 'system-admin') {
    const saved = localStorage.getItem('selectedNamespaceId');
    if (saved === 'all') return null;
    return saved || user.namespaceId || 'default';
  }
  return user.namespaceId;
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

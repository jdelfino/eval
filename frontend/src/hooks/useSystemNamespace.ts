'use client';

/**
 * useSystemNamespace Hook
 *
 * Owns all state for the system-admin namespace switcher:
 * - Loads the list of all namespaces from the API
 * - Reads/writes 'selectedNamespaceId' in localStorage (shared key with useSelectedNamespace)
 * - Exposes the 'all' sentinel as a first-class concept (isAll)
 * - Surfaces loading/error state so the consumer can show feedback (no silent failures)
 *
 * Only meaningful for system-admin users. Returns empty list and null current for others.
 *
 * localStorage semantics (consistent with useSelectedNamespace):
 * - 'all'       → isAll=true, current=null (cross-namespace / no filter)
 * - '<id>'      → isAll=false, current=NamespaceInfo for that id
 * - missing/null → falls back to user.namespace_id, then first namespace in list
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getSystemNamespace, listSystemNamespaces, NamespaceInfo } from '@/lib/api/system';
import { NAMESPACE_STORAGE_KEY, ALL_NAMESPACES_SENTINEL } from '@/hooks/namespaceStorage';

export interface UseSystemNamespaceResult {
  /** The currently-selected namespace, or null when 'all' is active or nothing loaded yet. */
  current: NamespaceInfo | null;
  /** Full list of namespaces available to switch to. */
  list: NamespaceInfo[];
  /** True when the 'all' sentinel is stored — user wants cross-namespace view. */
  isAll: boolean;
  /** True while the initial API fetch is in flight. */
  loading: boolean;
  /** Error message from the most recent fetch, or null. */
  error: string | null;
  /**
   * Select a namespace by id, or pass 'all' to activate the cross-namespace view.
   * Persists to localStorage and reloads the page (matches legacy per-namespace behavior).
   */
  select: (id: string | typeof ALL_NAMESPACES_SENTINEL) => void;
}

export function useSystemNamespace(): UseSystemNamespaceResult {
  const { user } = useAuth();
  const [list, setList] = useState<NamespaceInfo[]>([]);
  const [current, setCurrent] = useState<NamespaceInfo | null>(null);
  const [isAll, setIsAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSystemAdmin = user?.role === 'system-admin';

  useEffect(() => {
    if (!isSystemAdmin || !user?.namespace_id) return;

    setLoading(true);
    setError(null);

    listSystemNamespaces().then(nsList => {
      setList(nsList);

      const savedId = localStorage.getItem(NAMESPACE_STORAGE_KEY);

      if (savedId === ALL_NAMESPACES_SENTINEL) {
        setIsAll(true);
        setCurrent(null);
      } else {
        setIsAll(false);
        const activeId = savedId || user.namespace_id || 'default';
        const selected = nsList.find(ns => ns.id === activeId) || nsList[0] || null;
        setCurrent(selected);
      }
    }).catch(err => {
      setError(err instanceof Error ? err.message : 'Failed to load namespaces');
    }).finally(() => {
      setLoading(false);
    });
  }, [user?.namespace_id, isSystemAdmin]);

  // For non-system-admin, load their single namespace (display-only use case)
  useEffect(() => {
    if (!user?.namespace_id || isSystemAdmin) return;

    setLoading(true);
    setError(null);

    getSystemNamespace(user.namespace_id).then(ns => {
      setCurrent(ns);
    }).catch(err => {
      setError(err instanceof Error ? err.message : 'Failed to load namespace');
    }).finally(() => {
      setLoading(false);
    });
  }, [user?.namespace_id, isSystemAdmin]);

  const select = useCallback((id: string | typeof ALL_NAMESPACES_SENTINEL) => {
    localStorage.setItem(NAMESPACE_STORAGE_KEY, id);
    window.location.reload();
  }, []);

  return { current, list, isAll, loading, error, select };
}

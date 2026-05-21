'use client';

/**
 * useSystemNamespace Hook
 *
 * Owns all state for the system-admin namespace switcher:
 * - Loads the list of all namespaces from the API
 * - Reads/writes 'selectedNamespaceId' in localStorage (shared key with useSelectedNamespace)
 * - Exposes the 'all' sentinel as a first-class concept (isAll)
 *
 * Only meaningful for system-admin users. Returns empty list and null current for others.
 *
 * localStorage semantics (consistent with useSelectedNamespace):
 * - 'all'       → isAll=true, current=null (cross-namespace / no filter)
 * - '<id>'      → isAll=false, current=NamespaceInfo for that id
 * - missing/null → falls back to user.namespace_id, then first namespace in list
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getSystemNamespace, listSystemNamespaces, NamespaceInfo } from '@/lib/api/system';

const STORAGE_KEY = 'selectedNamespaceId';
const ALL_SENTINEL = 'all';

export interface UseSystemNamespaceResult {
  /** The currently-selected namespace, or null when 'all' is active or nothing loaded yet. */
  current: NamespaceInfo | null;
  /** Full list of namespaces available to switch to. */
  list: NamespaceInfo[];
  /** True when the 'all' sentinel is stored — user wants cross-namespace view. */
  isAll: boolean;
  /**
   * Select a namespace by id, or pass 'all' to activate the cross-namespace view.
   * Persists to localStorage and reloads the page (matches legacy per-namespace behavior).
   */
  select: (id: string | 'all') => void;
}

export function useSystemNamespace(): UseSystemNamespaceResult {
  const { user } = useAuth();
  const [list, setList] = useState<NamespaceInfo[]>([]);
  const [current, setCurrent] = useState<NamespaceInfo | null>(null);
  const [isAll, setIsAll] = useState(false);

  const isSystemAdmin = user?.role === 'system-admin';

  useEffect(() => {
    if (!isSystemAdmin || !user?.namespace_id) return;

    listSystemNamespaces().then(nsList => {
      setList(nsList);

      const savedId = localStorage.getItem(STORAGE_KEY);

      if (savedId === ALL_SENTINEL) {
        setIsAll(true);
        setCurrent(null);
        return;
      }

      setIsAll(false);
      const activeId = savedId || user.namespace_id || 'default';
      const selected = nsList.find(ns => ns.id === activeId) || nsList[0] || null;
      setCurrent(selected);
    }).catch(err => {
      console.error('Failed to load namespaces:', err);
    });
  }, [user?.namespace_id, isSystemAdmin]);

  // For non-system-admin, load their single namespace (display-only use case)
  useEffect(() => {
    if (!user?.namespace_id || isSystemAdmin) return;

    getSystemNamespace(user.namespace_id).then(ns => {
      setCurrent(ns);
    }).catch(err => {
      console.error('Failed to load namespace:', err);
    });
  }, [user?.namespace_id, isSystemAdmin]);

  const select = (id: string | 'all') => {
    localStorage.setItem(STORAGE_KEY, id);
    window.location.reload();
  };

  return { current, list, isAll, select };
}

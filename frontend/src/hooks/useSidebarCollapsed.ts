'use client';

/**
 * Hook for sidebar collapsed state with localStorage persistence.
 * Manages sidebar expand/collapse state across sessions.
 */

import { useState, useCallback } from 'react';

const STORAGE_KEY = 'coding-tool:sidebar-collapsed';

/**
 * Hook to manage sidebar collapsed state with localStorage persistence.
 * Uses lazy useState initializer to read localStorage synchronously on the
 * first client render, avoiding a post-mount useEffect re-render cycle.
 * @returns Tuple of [isCollapsed, setIsCollapsed, toggle]
 */
export function useSidebarCollapsed(): [boolean, (collapsed: boolean) => void, () => void] {
  const [isCollapsed, setIsCollapsedState] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const setIsCollapsed = useCallback((collapsed: boolean) => {
    setIsCollapsedState(collapsed);
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {
      // Storage error, ignore
    }
  }, []);

  const toggle = useCallback(() => {
    setIsCollapsedState(current => {
      const newValue = !current;
      try {
        localStorage.setItem(STORAGE_KEY, String(newValue));
      } catch {
        // Storage error, ignore
      }
      return newValue;
    });
  }, []);

  return [isCollapsed, setIsCollapsed, toggle];
}

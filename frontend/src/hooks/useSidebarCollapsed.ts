'use client';

/**
 * Hook for sidebar collapsed state with localStorage persistence.
 * Manages sidebar expand/collapse state across sessions.
 */

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'coding-tool:sidebar-collapsed';

/**
 * Hook to manage sidebar collapsed state with localStorage persistence.
 * @returns Tuple of [isCollapsed, setIsCollapsed, toggle]
 */
export function useSidebarCollapsed(): [boolean, (collapsed: boolean) => void, () => void] {
  const [isCollapsed, setIsCollapsedState] = useState(false);

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        setIsCollapsedState(stored === 'true');
      }
    } catch {
      // Storage error, ignore
    }
  }, []);

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

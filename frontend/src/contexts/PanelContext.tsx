'use client';

/**
 * Panel Context.
 * Provides panel visibility state management for collapsible panels.
 * State is persisted per page to localStorage.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

const STORAGE_KEY_PREFIX = 'coding-tool:panel-state:';

/** Panel state mapping */
export interface PanelState {
  [panelId: string]: 'expanded' | 'collapsed';
}

interface PanelContextType {
  /** Current panel states */
  panelStates: PanelState;
  /** Toggle a panel between expanded and collapsed */
  togglePanel: (panelId: string) => void;
  /** Expand a panel */
  expandPanel: (panelId: string) => void;
  /** Collapse a panel */
  collapsePanel: (panelId: string) => void;
  /** Check if a panel is expanded */
  isPanelExpanded: (panelId: string) => boolean;
}

const PanelContext = createContext<PanelContextType | undefined>(undefined);

interface PanelProviderProps {
  /** Page identifier for localStorage key */
  pageId: string;
  children: ReactNode;
}

/**
 * Provider for panel visibility state.
 * Persists panel states to localStorage per page.
 */
export function PanelProvider({ pageId, children }: PanelProviderProps) {
  const [panelStates, setPanelStates] = useState<PanelState>({});
  const storageKey = `${STORAGE_KEY_PREFIX}${pageId}`;

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as PanelState;
        setPanelStates(parsed);
      }
    } catch {
      // Invalid stored data, ignore
    }
  }, [storageKey]);

  // Persist to localStorage whenever state changes
  const persistState = useCallback((newState: PanelState) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(newState));
    } catch {
      // Storage error, ignore
    }
  }, [storageKey]);

  const togglePanel = useCallback((panelId: string) => {
    setPanelStates(current => {
      const currentState = current[panelId] ?? 'expanded';
      const newState: 'expanded' | 'collapsed' = currentState === 'expanded' ? 'collapsed' : 'expanded';
      const updated: PanelState = { ...current, [panelId]: newState };
      persistState(updated);
      return updated;
    });
  }, [persistState]);

  const expandPanel = useCallback((panelId: string) => {
    setPanelStates(current => {
      if (current[panelId] === 'expanded') {
        return current;
      }
      const updated = { ...current, [panelId]: 'expanded' as const };
      persistState(updated);
      return updated;
    });
  }, [persistState]);

  const collapsePanel = useCallback((panelId: string) => {
    setPanelStates(current => {
      if (current[panelId] === 'collapsed') {
        return current;
      }
      const updated = { ...current, [panelId]: 'collapsed' as const };
      persistState(updated);
      return updated;
    });
  }, [persistState]);

  const isPanelExpanded = useCallback((panelId: string) => {
    // Default to expanded if not explicitly set
    return (panelStates[panelId] ?? 'expanded') === 'expanded';
  }, [panelStates]);

  const value: PanelContextType = {
    panelStates,
    togglePanel,
    expandPanel,
    collapsePanel,
    isPanelExpanded,
  };

  return (
    <PanelContext.Provider value={value}>
      {children}
    </PanelContext.Provider>
  );
}

/**
 * Hook to access panel state context.
 * Must be used within PanelProvider.
 */
export function usePanelState() {
  const context = useContext(PanelContext);
  if (context === undefined) {
    throw new Error('usePanelState must be used within a PanelProvider');
  }
  return context;
}

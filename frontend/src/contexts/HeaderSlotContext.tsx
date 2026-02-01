'use client';

/**
 * Context for injecting content into the GlobalHeader from child pages.
 * Used by the student page to show connection status in the app navbar.
 */

import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

interface HeaderSlotContextValue {
  /** Content to render in the header's right section (before UserMenu) */
  headerSlot: ReactNode;
  /** Set the header slot content. Call with null to clear. */
  setHeaderSlot: (content: ReactNode) => void;
}

const HeaderSlotContext = createContext<HeaderSlotContextValue>({
  headerSlot: null,
  setHeaderSlot: () => {},
});

export function HeaderSlotProvider({ children }: { children: ReactNode }) {
  const [headerSlot, setHeaderSlotState] = useState<ReactNode>(null);
  const setHeaderSlot = useCallback((content: ReactNode) => {
    setHeaderSlotState(content);
  }, []);

  return (
    <HeaderSlotContext.Provider value={{ headerSlot, setHeaderSlot }}>
      {children}
    </HeaderSlotContext.Provider>
  );
}

export function useHeaderSlot() {
  return useContext(HeaderSlotContext);
}

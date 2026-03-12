'use client';

/**
 * Context for configuring the AppShell layout from child pages.
 *
 * Instructor pages can set forceDesktop=true to prevent the sidebar and
 * other responsive layouts from collapsing when the instructor zooms the
 * browser for projector display (zoom reduces window.innerWidth and CSS
 * viewport width, which triggers mobile breakpoints).
 */

import { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';

interface LayoutConfigContextValue {
  /** When true, AppShell shows the desktop sidebar regardless of viewport width */
  forceDesktop: boolean;
  /** Set forceDesktop. Call with false (or return the cleanup) to reset. */
  setForceDesktop: (value: boolean) => void;
}

const LayoutConfigContext = createContext<LayoutConfigContextValue>({
  forceDesktop: false,
  setForceDesktop: () => {},
});

export function LayoutConfigProvider({ children }: { children: ReactNode }) {
  const [forceDesktop, setForceDesktopState] = useState(false);
  const setForceDesktop = useCallback((value: boolean) => {
    setForceDesktopState(value);
  }, []);

  return (
    <LayoutConfigContext.Provider value={{ forceDesktop, setForceDesktop }}>
      {children}
    </LayoutConfigContext.Provider>
  );
}

export function useLayoutConfig() {
  return useContext(LayoutConfigContext);
}

/**
 * Hook for pages that need to force desktop layout.
 * Automatically resets when the component unmounts.
 *
 * Usage:
 *   useForceDesktopLayout(); // in an instructor page
 */
export function useForceDesktopLayout() {
  const { setForceDesktop } = useLayoutConfig();

  useEffect(() => {
    setForceDesktop(true);
    return () => {
      setForceDesktop(false);
    };
  }, [setForceDesktop]);
}

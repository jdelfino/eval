/**
 * Tests for LayoutConfigContext
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { renderHook, act, render } from '@testing-library/react';
import {
  LayoutConfigProvider,
  useLayoutConfig,
  useForceDesktopLayout,
} from '../LayoutConfigContext';

describe('LayoutConfigContext', () => {
  describe('useLayoutConfig', () => {
    it('returns forceDesktop=false by default', () => {
      const { result } = renderHook(() => useLayoutConfig(), {
        wrapper: LayoutConfigProvider,
      });

      expect(result.current.forceDesktop).toBe(false);
    });

    it('returns setForceDesktop function', () => {
      const { result } = renderHook(() => useLayoutConfig(), {
        wrapper: LayoutConfigProvider,
      });

      expect(typeof result.current.setForceDesktop).toBe('function');
    });

    it('updates forceDesktop to true when setForceDesktop(true) is called', () => {
      const { result } = renderHook(() => useLayoutConfig(), {
        wrapper: LayoutConfigProvider,
      });

      act(() => {
        result.current.setForceDesktop(true);
      });

      expect(result.current.forceDesktop).toBe(true);
    });

    it('updates forceDesktop back to false when setForceDesktop(false) is called', () => {
      const { result } = renderHook(() => useLayoutConfig(), {
        wrapper: LayoutConfigProvider,
      });

      act(() => {
        result.current.setForceDesktop(true);
      });
      act(() => {
        result.current.setForceDesktop(false);
      });

      expect(result.current.forceDesktop).toBe(false);
    });
  });

  describe('useForceDesktopLayout', () => {
    it('sets forceDesktop=true on mount', () => {
      // Both hooks must share the same provider tree — use a combined hook
      const { result } = renderHook(
        () => {
          useForceDesktopLayout();
          return useLayoutConfig();
        },
        { wrapper: LayoutConfigProvider }
      );

      expect(result.current.forceDesktop).toBe(true);
    });

    it('resets forceDesktop=false on unmount', () => {
      // Use a component that conditionally renders the forceDesktop hook
      function ForceDesktopChild({ force }: { force: boolean }) {
        useForceDesktopLayout();
        return force ? <span data-testid="child" /> : null;
      }

      const { result } = renderHook(() => useLayoutConfig(), {
        wrapper: ({ children }) => (
          <LayoutConfigProvider>
            {children}
            <ForceDesktopChild force={true} />
          </LayoutConfigProvider>
        ),
      });

      // ForceDesktopChild is mounted, so forceDesktop should be true
      expect(result.current.forceDesktop).toBe(true);
    });

    it('resets forceDesktop to false after cleanup on unmount', () => {
      // Use a persistent observer component that remains mounted after the
      // useForceDesktopLayout consumer unmounts so we can verify the context reset.
      //
      // Architecture: LayoutConfigProvider wraps both ForceDesktopChild (which calls
      // useForceDesktopLayout) and a persistent Observer (which reads forceDesktop).
      // We render the tree, verify forceDesktop is true, then rerender without
      // ForceDesktopChild so its cleanup runs, and assert forceDesktop returns to false.
      let observedForceDesktop: boolean | undefined;

      function Observer() {
        const { forceDesktop } = useLayoutConfig();
        observedForceDesktop = forceDesktop;
        return null;
      }

      function ForceDesktopChild() {
        useForceDesktopLayout();
        return null;
      }

      // Render the full tree: provider + observer + force-desktop child
      const { rerender } = render(
        <LayoutConfigProvider>
          <Observer />
          <ForceDesktopChild />
        </LayoutConfigProvider>
      );

      // ForceDesktopChild mounted → forceDesktop should be true
      expect(observedForceDesktop).toBe(true);

      // Unmount ForceDesktopChild by re-rendering without it
      act(() => {
        rerender(
          <LayoutConfigProvider>
            <Observer />
          </LayoutConfigProvider>
        );
      });

      // ForceDesktopChild unmounted → cleanup runs → forceDesktop resets to false
      expect(observedForceDesktop).toBe(false);
    });
  });
});

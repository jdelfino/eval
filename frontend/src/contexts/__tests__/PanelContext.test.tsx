/**
 * Tests for PanelContext
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { PanelProvider, usePanelState } from '../PanelContext';

const STORAGE_KEY_PREFIX = 'coding-tool:panel-state:';

describe('PanelContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const createWrapper = (pageId: string) => {
    return ({ children }: { children: React.ReactNode }) => (
      <PanelProvider pageId={pageId}>{children}</PanelProvider>
    );
  };

  describe('PanelProvider', () => {
    it('provides initial empty panel states', () => {
      const { result } = renderHook(() => usePanelState(), {
        wrapper: createWrapper('test-page'),
      });

      expect(result.current.panelStates).toEqual({});
    });

    it('restores state from localStorage on mount', () => {
      const storedState = { 'panel-1': 'collapsed', 'panel-2': 'expanded' };
      localStorage.setItem(`${STORAGE_KEY_PREFIX}test-page`, JSON.stringify(storedState));

      const { result } = renderHook(() => usePanelState(), {
        wrapper: createWrapper('test-page'),
      });

      expect(result.current.panelStates).toEqual(storedState);
    });

    it('uses page-specific storage key', () => {
      const state1 = { 'panel-a': 'collapsed' };
      const state2 = { 'panel-b': 'expanded' };
      localStorage.setItem(`${STORAGE_KEY_PREFIX}page-1`, JSON.stringify(state1));
      localStorage.setItem(`${STORAGE_KEY_PREFIX}page-2`, JSON.stringify(state2));

      const { result: result1 } = renderHook(() => usePanelState(), {
        wrapper: createWrapper('page-1'),
      });
      const { result: result2 } = renderHook(() => usePanelState(), {
        wrapper: createWrapper('page-2'),
      });

      expect(result1.current.panelStates).toEqual(state1);
      expect(result2.current.panelStates).toEqual(state2);
    });

    it('ignores invalid JSON in localStorage', () => {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}test-page`, 'invalid-json');

      const { result } = renderHook(() => usePanelState(), {
        wrapper: createWrapper('test-page'),
      });

      expect(result.current.panelStates).toEqual({});
    });
  });

  describe('togglePanel', () => {
    it('toggles panel from expanded to collapsed', () => {
      const { result } = renderHook(() => usePanelState(), {
        wrapper: createWrapper('test-page'),
      });

      // Default is expanded
      expect(result.current.isPanelExpanded('my-panel')).toBe(true);

      act(() => {
        result.current.togglePanel('my-panel');
      });

      expect(result.current.isPanelExpanded('my-panel')).toBe(false);
      expect(result.current.panelStates['my-panel']).toBe('collapsed');
    });

    it('toggles panel from collapsed to expanded', () => {
      const { result } = renderHook(() => usePanelState(), {
        wrapper: createWrapper('test-page'),
      });

      act(() => {
        result.current.togglePanel('my-panel'); // collapsed
      });

      act(() => {
        result.current.togglePanel('my-panel'); // expanded
      });

      expect(result.current.isPanelExpanded('my-panel')).toBe(true);
      expect(result.current.panelStates['my-panel']).toBe('expanded');
    });

    it('persists toggled state to localStorage', () => {
      const { result } = renderHook(() => usePanelState(), {
        wrapper: createWrapper('persist-test'),
      });

      act(() => {
        result.current.togglePanel('panel-x');
      });

      const stored = JSON.parse(localStorage.getItem(`${STORAGE_KEY_PREFIX}persist-test`) || '{}');
      expect(stored['panel-x']).toBe('collapsed');
    });
  });

  describe('expandPanel', () => {
    it('expands a collapsed panel', () => {
      const storedState = { 'collapsed-panel': 'collapsed' };
      localStorage.setItem(`${STORAGE_KEY_PREFIX}test-page`, JSON.stringify(storedState));

      const { result } = renderHook(() => usePanelState(), {
        wrapper: createWrapper('test-page'),
      });

      expect(result.current.isPanelExpanded('collapsed-panel')).toBe(false);

      act(() => {
        result.current.expandPanel('collapsed-panel');
      });

      expect(result.current.isPanelExpanded('collapsed-panel')).toBe(true);
    });

    it('does not change already expanded panel', () => {
      const { result } = renderHook(() => usePanelState(), {
        wrapper: createWrapper('test-page'),
      });

      // Set to expanded explicitly
      act(() => {
        result.current.expandPanel('panel-a');
      });

      const stateAfterFirst = { ...result.current.panelStates };

      act(() => {
        result.current.expandPanel('panel-a');
      });

      expect(result.current.panelStates).toEqual(stateAfterFirst);
    });
  });

  describe('collapsePanel', () => {
    it('collapses an expanded panel', () => {
      const { result } = renderHook(() => usePanelState(), {
        wrapper: createWrapper('test-page'),
      });

      // Default is expanded
      expect(result.current.isPanelExpanded('panel-to-collapse')).toBe(true);

      act(() => {
        result.current.collapsePanel('panel-to-collapse');
      });

      expect(result.current.isPanelExpanded('panel-to-collapse')).toBe(false);
    });

    it('does not change already collapsed panel', () => {
      const storedState = { 'collapsed-panel': 'collapsed' };
      localStorage.setItem(`${STORAGE_KEY_PREFIX}test-page`, JSON.stringify(storedState));

      const { result } = renderHook(() => usePanelState(), {
        wrapper: createWrapper('test-page'),
      });

      const stateBeforeCollapse = { ...result.current.panelStates };

      act(() => {
        result.current.collapsePanel('collapsed-panel');
      });

      expect(result.current.panelStates).toEqual(stateBeforeCollapse);
    });
  });

  describe('isPanelExpanded', () => {
    it('returns true for panels not in state (default)', () => {
      const { result } = renderHook(() => usePanelState(), {
        wrapper: createWrapper('test-page'),
      });

      expect(result.current.isPanelExpanded('unknown-panel')).toBe(true);
    });

    it('returns true for expanded panels', () => {
      const storedState = { 'expanded-panel': 'expanded' };
      localStorage.setItem(`${STORAGE_KEY_PREFIX}test-page`, JSON.stringify(storedState));

      const { result } = renderHook(() => usePanelState(), {
        wrapper: createWrapper('test-page'),
      });

      expect(result.current.isPanelExpanded('expanded-panel')).toBe(true);
    });

    it('returns false for collapsed panels', () => {
      const storedState = { 'collapsed-panel': 'collapsed' };
      localStorage.setItem(`${STORAGE_KEY_PREFIX}test-page`, JSON.stringify(storedState));

      const { result } = renderHook(() => usePanelState(), {
        wrapper: createWrapper('test-page'),
      });

      expect(result.current.isPanelExpanded('collapsed-panel')).toBe(false);
    });
  });

  describe('usePanelState', () => {
    it('throws error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => usePanelState());
      }).toThrow('usePanelState must be used within a PanelProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('Provider rendering', () => {
    it('renders children correctly', () => {
      render(
        <PanelProvider pageId="test">
          <div data-testid="child">Child content</div>
        </PanelProvider>
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
      expect(screen.getByText('Child content')).toBeInTheDocument();
    });
  });

  describe('Multiple panels', () => {
    it('manages multiple panels independently', () => {
      const { result } = renderHook(() => usePanelState(), {
        wrapper: createWrapper('multi-panel-test'),
      });

      act(() => {
        result.current.collapsePanel('panel-1');
      });

      act(() => {
        result.current.expandPanel('panel-2');
      });

      act(() => {
        result.current.collapsePanel('panel-3');
      });

      expect(result.current.isPanelExpanded('panel-1')).toBe(false);
      expect(result.current.isPanelExpanded('panel-2')).toBe(true);
      expect(result.current.isPanelExpanded('panel-3')).toBe(false);
    });
  });
});

/**
 * Tests for useSidebarCollapsed hook
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useSidebarCollapsed } from '../useSidebarCollapsed';

const STORAGE_KEY = 'coding-tool:sidebar-collapsed';

describe('useSidebarCollapsed', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('initial state', () => {
    it('returns false by default when no stored value', () => {
      const { result } = renderHook(() => useSidebarCollapsed());
      const [isCollapsed] = result.current;

      expect(isCollapsed).toBe(false);
    });

    it('restores true from localStorage', () => {
      localStorage.setItem(STORAGE_KEY, 'true');

      const { result } = renderHook(() => useSidebarCollapsed());
      const [isCollapsed] = result.current;

      expect(isCollapsed).toBe(true);
    });

    it('restores false from localStorage', () => {
      localStorage.setItem(STORAGE_KEY, 'false');

      const { result } = renderHook(() => useSidebarCollapsed());
      const [isCollapsed] = result.current;

      expect(isCollapsed).toBe(false);
    });
  });

  describe('setIsCollapsed', () => {
    it('sets collapsed state to true', () => {
      const { result } = renderHook(() => useSidebarCollapsed());

      act(() => {
        const [, setIsCollapsed] = result.current;
        setIsCollapsed(true);
      });

      const [isCollapsed] = result.current;
      expect(isCollapsed).toBe(true);
    });

    it('sets collapsed state to false', () => {
      localStorage.setItem(STORAGE_KEY, 'true');
      const { result } = renderHook(() => useSidebarCollapsed());

      act(() => {
        const [, setIsCollapsed] = result.current;
        setIsCollapsed(false);
      });

      const [isCollapsed] = result.current;
      expect(isCollapsed).toBe(false);
    });

    it('persists true to localStorage', () => {
      const { result } = renderHook(() => useSidebarCollapsed());

      act(() => {
        const [, setIsCollapsed] = result.current;
        setIsCollapsed(true);
      });

      expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
    });

    it('persists false to localStorage', () => {
      const { result } = renderHook(() => useSidebarCollapsed());

      act(() => {
        const [, setIsCollapsed] = result.current;
        setIsCollapsed(false);
      });

      expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
    });
  });

  describe('toggle', () => {
    it('toggles from false to true', () => {
      const { result } = renderHook(() => useSidebarCollapsed());

      act(() => {
        const [, , toggle] = result.current;
        toggle();
      });

      const [isCollapsed] = result.current;
      expect(isCollapsed).toBe(true);
    });

    it('toggles from true to false', () => {
      localStorage.setItem(STORAGE_KEY, 'true');
      const { result } = renderHook(() => useSidebarCollapsed());

      act(() => {
        const [, , toggle] = result.current;
        toggle();
      });

      const [isCollapsed] = result.current;
      expect(isCollapsed).toBe(false);
    });

    it('persists toggle result to localStorage', () => {
      const { result } = renderHook(() => useSidebarCollapsed());

      act(() => {
        const [, , toggle] = result.current;
        toggle();
      });

      expect(localStorage.getItem(STORAGE_KEY)).toBe('true');

      act(() => {
        const [, , toggle] = result.current;
        toggle();
      });

      expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
    });
  });

  describe('localStorage errors', () => {
    it('handles localStorage read errors gracefully', () => {
      const mockGetItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Storage error');
      });

      const { result } = renderHook(() => useSidebarCollapsed());
      const [isCollapsed] = result.current;

      expect(isCollapsed).toBe(false);

      mockGetItem.mockRestore();
    });

    it('handles localStorage write errors gracefully', () => {
      const mockSetItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Storage error');
      });

      const { result } = renderHook(() => useSidebarCollapsed());

      // Should not throw
      act(() => {
        const [, setIsCollapsed] = result.current;
        setIsCollapsed(true);
      });

      const [isCollapsed] = result.current;
      expect(isCollapsed).toBe(true);

      mockSetItem.mockRestore();
    });
  });
});

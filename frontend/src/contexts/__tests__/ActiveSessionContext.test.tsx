/**
 * Tests for ActiveSessionContext
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { ActiveSessionProvider, useActiveSession } from '../ActiveSessionContext';

const STORAGE_KEY = 'coding-tool:active-session';

describe('ActiveSessionContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('ActiveSessionProvider', () => {
    it('provides initial state with null values', () => {
      const { result } = renderHook(() => useActiveSession(), {
        wrapper: ActiveSessionProvider,
      });

      expect(result.current.state.sessionId).toBeNull();
      expect(result.current.state.joinCode).toBeNull();
    });

    it('restores state from localStorage on mount', () => {
      const storedState = { sessionId: 'test-session', joinCode: 'ABC-123' };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedState));

      const { result } = renderHook(() => useActiveSession(), {
        wrapper: ActiveSessionProvider,
      });

      expect(result.current.state.sessionId).toBe('test-session');
      expect(result.current.state.joinCode).toBe('ABC-123');
    });

    it('ignores invalid JSON in localStorage', () => {
      localStorage.setItem(STORAGE_KEY, 'invalid-json');

      const { result } = renderHook(() => useActiveSession(), {
        wrapper: ActiveSessionProvider,
      });

      expect(result.current.state.sessionId).toBeNull();
      expect(result.current.state.joinCode).toBeNull();
    });

    it('ignores incomplete stored state', () => {
      const incompleteState = { sessionId: 'test-session' };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(incompleteState));

      const { result } = renderHook(() => useActiveSession(), {
        wrapper: ActiveSessionProvider,
      });

      expect(result.current.state.sessionId).toBeNull();
      expect(result.current.state.joinCode).toBeNull();
    });
  });

  describe('setActiveSession', () => {
    it('updates state with session info', () => {
      const { result } = renderHook(() => useActiveSession(), {
        wrapper: ActiveSessionProvider,
      });

      act(() => {
        result.current.setActiveSession('session-123', 'XYZ-789');
      });

      expect(result.current.state.sessionId).toBe('session-123');
      expect(result.current.state.joinCode).toBe('XYZ-789');
    });

    it('persists session info to localStorage', () => {
      const { result } = renderHook(() => useActiveSession(), {
        wrapper: ActiveSessionProvider,
      });

      act(() => {
        result.current.setActiveSession('session-456', 'DEF-321');
      });

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      expect(stored.sessionId).toBe('session-456');
      expect(stored.joinCode).toBe('DEF-321');
    });

    it('overwrites previous session info', () => {
      const { result } = renderHook(() => useActiveSession(), {
        wrapper: ActiveSessionProvider,
      });

      act(() => {
        result.current.setActiveSession('first-session', 'CODE-1');
      });

      act(() => {
        result.current.setActiveSession('second-session', 'CODE-2');
      });

      expect(result.current.state.sessionId).toBe('second-session');
      expect(result.current.state.joinCode).toBe('CODE-2');
    });
  });

  describe('clearActiveSession', () => {
    it('clears session state', () => {
      const { result } = renderHook(() => useActiveSession(), {
        wrapper: ActiveSessionProvider,
      });

      act(() => {
        result.current.setActiveSession('session-to-clear', 'ABC-123');
      });

      expect(result.current.state.sessionId).toBe('session-to-clear');

      act(() => {
        result.current.clearActiveSession();
      });

      expect(result.current.state.sessionId).toBeNull();
      expect(result.current.state.joinCode).toBeNull();
    });

    it('removes session from localStorage', () => {
      const { result } = renderHook(() => useActiveSession(), {
        wrapper: ActiveSessionProvider,
      });

      act(() => {
        result.current.setActiveSession('session-id', 'CODE');
      });

      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

      act(() => {
        result.current.clearActiveSession();
      });

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe('useActiveSession', () => {
    it('throws error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useActiveSession());
      }).toThrow('useActiveSession must be used within an ActiveSessionProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('Provider rendering', () => {
    it('renders children correctly', () => {
      render(
        <ActiveSessionProvider>
          <div data-testid="child">Child content</div>
        </ActiveSessionProvider>
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
      expect(screen.getByText('Child content')).toBeInTheDocument();
    });
  });
});

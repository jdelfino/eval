/**
 * Tests for CodeEditor window.__TEST_EDITORS registration
 *
 * Verifies that Monaco editor instances are always registered on
 * window.__TEST_EDITORS for E2E test access (now unconditional —
 * NEXT_PUBLIC_AUTH_MODE guard was removed with the AUTH_MODE=test bypass).
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CodeEditor from '../CodeEditor';

// Typed window extension for __TEST_EDITORS
declare global {
  interface Window {
    __TEST_EDITORS?: any[];
  }
}

let mockEditorInstance: any;

// mockEditorFactory is reassigned per-test for the multi-instance test;
// all other tests use the default factory assigned in beforeEach.
let mockEditorFactory: (props: any) => React.ReactElement;

function makeDefaultFactory() {
  return function DefaultMockEditor({ onMount }: any) {
    React.useEffect(() => {
      if (onMount) {
        mockEditorInstance = {
          focus: jest.fn(),
          trigger: jest.fn(),
          deltaDecorations: jest.fn(() => []),
        };
        onMount(mockEditorInstance);
      }
    }, [onMount]);

    return <textarea data-testid="monaco-editor" />;
  };
}

jest.mock('@monaco-editor/react', () => {
  // Delegate to mockEditorFactory so individual tests can override behaviour
  return function MockEditorWrapper(props: any) {
    return mockEditorFactory(props);
  };
});

jest.mock('../ExecutionSettings', () => {
  return function MockExecutionSettings() {
    return <div data-testid="execution-settings" />;
  };
});

jest.mock('@/hooks/useResponsiveLayout', () => ({
  useResponsiveLayout: () => true,
  useSidebarSection: () => ({
    isCollapsed: true,
    toggle: jest.fn(),
    setCollapsed: jest.fn(),
  }),
  useMobileViewport: () => ({
    isMobile: false,
    isTablet: false,
    isVerySmall: false,
    isDesktop: true,
    width: 1200,
  }),
}));

jest.mock('@/lib/api/execute', () => ({
  executeCode: jest.fn(),
}));

describe('CodeEditor window.__TEST_EDITORS registration', () => {
  beforeEach(() => {
    // Reset factory to the default single-instance behaviour before each test
    mockEditorFactory = makeDefaultFactory();
  });

  afterEach(() => {
    // Clean up global state
    delete window.__TEST_EDITORS;
    mockEditorInstance = null;
  });

  describe('always registers editor on window.__TEST_EDITORS', () => {
    it('registers the editor on window.__TEST_EDITORS after mount', async () => {
      render(<CodeEditor code="print('hello')" onChange={jest.fn()} />);

      await waitFor(() => {
        expect(mockEditorInstance).not.toBeNull();
      });

      expect(window.__TEST_EDITORS).toBeDefined();
      expect(window.__TEST_EDITORS).toHaveLength(1);
      expect(window.__TEST_EDITORS![0]).toBe(mockEditorInstance);
    });

    it('removes the editor from window.__TEST_EDITORS on unmount', async () => {
      const { unmount } = render(
        <CodeEditor code="print('hello')" onChange={jest.fn()} />
      );

      await waitFor(() => {
        expect(mockEditorInstance).not.toBeNull();
      });

      expect(window.__TEST_EDITORS).toHaveLength(1);

      unmount();

      expect(window.__TEST_EDITORS).toHaveLength(0);
    });

    it('supports multiple editor instances', async () => {
      const mountedEditors: any[] = [];

      // Override the factory to produce a distinct instance per mount call
      mockEditorFactory = function MultiInstanceMockEditor({ onMount }: any) {
        React.useEffect(() => {
          if (onMount) {
            const instance = {
              focus: jest.fn(),
              trigger: jest.fn(),
              deltaDecorations: jest.fn(() => []),
            };
            mountedEditors.push(instance);
            mockEditorInstance = instance;
            onMount(instance);
          }
        }, [onMount]);
        return <textarea data-testid="monaco-editor" />;
      };

      const { unmount: unmountFirst } = render(
        <CodeEditor code="first" onChange={jest.fn()} />
      );

      await waitFor(() => {
        expect(window.__TEST_EDITORS).toHaveLength(1);
      });

      const { unmount: unmountSecond } = render(
        <CodeEditor code="second" onChange={jest.fn()} />
      );

      await waitFor(() => {
        expect(window.__TEST_EDITORS).toHaveLength(2);
      });

      // Both instances should be the real editor objects registered via handleEditorDidMount
      expect(window.__TEST_EDITORS![0]).toBe(mountedEditors[0]);
      expect(window.__TEST_EDITORS![1]).toBe(mountedEditors[1]);
      expect(window.__TEST_EDITORS![0]).not.toBe(window.__TEST_EDITORS![1]);

      // Unmounting the first should remove only the first instance
      unmountFirst();
      expect(window.__TEST_EDITORS).toHaveLength(1);
      expect(window.__TEST_EDITORS![0]).toBe(mountedEditors[1]);

      // Unmounting the second should leave the array empty
      unmountSecond();
      expect(window.__TEST_EDITORS).toHaveLength(0);
    });

    it('initialises window.__TEST_EDITORS as array if not already set', async () => {
      // Ensure it starts undefined
      delete window.__TEST_EDITORS;

      render(<CodeEditor code="print('hello')" onChange={jest.fn()} />);

      await waitFor(() => {
        expect(window.__TEST_EDITORS).toBeDefined();
      });

      expect(Array.isArray(window.__TEST_EDITORS)).toBe(true);
    });
  });
});

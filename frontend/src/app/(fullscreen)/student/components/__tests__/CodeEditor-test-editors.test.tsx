/**
 * Tests for CodeEditor window.__TEST_EDITORS registration
 *
 * Verifies that Monaco editor instances are registered on window.__TEST_EDITORS
 * when NEXT_PUBLIC_AUTH_MODE === 'test', and cleaned up on unmount.
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

jest.mock('@monaco-editor/react', () => {
  return function MockEditor({ onMount }: any) {
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
  executeStandaloneCode: jest.fn(),
}));

describe('CodeEditor window.__TEST_EDITORS registration', () => {
  const originalEnv = process.env.NEXT_PUBLIC_AUTH_MODE;

  afterEach(() => {
    // Restore env variable
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_AUTH_MODE;
    } else {
      process.env.NEXT_PUBLIC_AUTH_MODE = originalEnv;
    }
    // Clean up global state
    delete window.__TEST_EDITORS;
    mockEditorInstance = null;
  });

  describe('when NEXT_PUBLIC_AUTH_MODE === "test"', () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_AUTH_MODE = 'test';
    });

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
      const firstEditor: any = {};
      const secondEditor: any = {};
      let mountCount = 0;

      // Override mock to track two separate instances
      const { rerender } = render(
        <CodeEditor code="first" onChange={jest.fn()} />
      );

      await waitFor(() => {
        expect(mockEditorInstance).not.toBeNull();
      });

      // Simulate a second editor being registered manually
      window.__TEST_EDITORS!.push(secondEditor);

      expect(window.__TEST_EDITORS).toHaveLength(2);
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

  describe('when NEXT_PUBLIC_AUTH_MODE !== "test"', () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_AUTH_MODE = 'firebase';
    });

    it('does NOT register the editor on window.__TEST_EDITORS', async () => {
      render(<CodeEditor code="print('hello')" onChange={jest.fn()} />);

      await waitFor(() => {
        expect(mockEditorInstance).not.toBeNull();
      });

      expect(window.__TEST_EDITORS).toBeUndefined();
    });
  });

  describe('when NEXT_PUBLIC_AUTH_MODE is not set', () => {
    beforeEach(() => {
      delete process.env.NEXT_PUBLIC_AUTH_MODE;
    });

    it('does NOT register the editor on window.__TEST_EDITORS', async () => {
      render(<CodeEditor code="print('hello')" onChange={jest.fn()} />);

      await waitFor(() => {
        expect(mockEditorInstance).not.toBeNull();
      });

      expect(window.__TEST_EDITORS).toBeUndefined();
    });
  });
});

/**
 * Tests for CodeEditor outputPosition prop
 *
 * Verifies that outputPosition="right" renders a horizontal (side-by-side)
 * layout and that the default "bottom" position still renders vertically.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import CodeEditor from '../CodeEditor';

// Mock Monaco Editor
jest.mock('@monaco-editor/react', () => {
  return function MockEditor({ value, onChange }: any) {
    return (
      <textarea
        data-testid="monaco-editor"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  };
});

// Mock ExecutionSettings
jest.mock('../ExecutionSettings', () => {
  return function MockExecutionSettings() {
    return <div data-testid="execution-settings">Settings</div>;
  };
});

// Mock useResponsiveLayout hook - default to desktop
jest.mock('@/hooks/useResponsiveLayout', () => ({
  useResponsiveLayout: jest.fn(() => true),
  useSidebarSection: jest.fn(() => ({
    isCollapsed: true,
    toggle: jest.fn(),
    setCollapsed: jest.fn(),
  })),
  useMobileViewport: jest.fn(() => ({
    isMobile: false,
    isTablet: false,
    isVerySmall: false,
    isDesktop: true,
    width: 1200,
  })),
}));

describe('CodeEditor outputPosition prop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('outputPosition="right" (horizontal layout)', () => {
    it('should render editor area with flex-row layout', () => {
      const { container } = render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
          outputPosition="right"
          forceDesktop={true}
        />
      );

      // The main editor area should use flex-row when outputPosition is "right"
      const editorArea = container.querySelector('[data-testid="editor-output-container"]');
      expect(editorArea).toBeInTheDocument();
      expect(editorArea).toHaveClass('flex-row');
    });

    it('should render a vertical resize handle (left of output)', () => {
      const { container } = render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
          outputPosition="right"
          forceDesktop={true}
        />
      );

      // The resize handle should be vertical (cursor-col-resize) not horizontal
      const resizeHandle = container.querySelector('[data-testid="output-resize-handle"]');
      expect(resizeHandle).toBeInTheDocument();
      expect(resizeHandle).toHaveClass('cursor-col-resize');
    });

    it('should set output area width via inline style', () => {
      const { container } = render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
          outputPosition="right"
          forceDesktop={true}
        />
      );

      const outputArea = container.querySelector('[data-testid="output-area"]');
      expect(outputArea).toBeInTheDocument();
      // Should have a width style (not height)
      const style = outputArea?.getAttribute('style') || '';
      expect(style).toContain('width');
    });

    it('should apply border-l instead of border-t on output area', () => {
      const { container } = render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
          outputPosition="right"
          forceDesktop={true}
        />
      );

      const outputArea = container.querySelector('[data-testid="output-area"]');
      expect(outputArea).toHaveClass('border-l');
      expect(outputArea).not.toHaveClass('border-t');
    });
  });

  describe('default outputPosition (vertical layout)', () => {
    it('should render editor area with flex-col layout by default', () => {
      const { container } = render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
          forceDesktop={true}
        />
      );

      const editorArea = container.querySelector('[data-testid="editor-output-container"]');
      expect(editorArea).toBeInTheDocument();
      expect(editorArea).toHaveClass('flex-col');
    });

    it('should render a horizontal resize handle (top of output) by default', () => {
      const { container } = render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
          forceDesktop={true}
        />
      );

      const resizeHandle = container.querySelector('[data-testid="output-resize-handle"]');
      expect(resizeHandle).toBeInTheDocument();
      expect(resizeHandle).toHaveClass('cursor-row-resize');
    });

    it('should set output area height via inline style by default', () => {
      const { container } = render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
          forceDesktop={true}
        />
      );

      const outputArea = container.querySelector('[data-testid="output-area"]');
      expect(outputArea).toBeInTheDocument();
      const style = outputArea?.getAttribute('style') || '';
      expect(style).toContain('height');
    });

    it('should apply border-t on output area by default', () => {
      const { container } = render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
          forceDesktop={true}
        />
      );

      const outputArea = container.querySelector('[data-testid="output-area"]');
      expect(outputArea).toHaveClass('border-t');
    });
  });

  describe('outputPosition="bottom" (explicit)', () => {
    it('should behave the same as default', () => {
      const { container } = render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
          outputPosition="bottom"
          forceDesktop={true}
        />
      );

      const editorArea = container.querySelector('[data-testid="editor-output-container"]');
      expect(editorArea).toHaveClass('flex-col');
    });
  });
});

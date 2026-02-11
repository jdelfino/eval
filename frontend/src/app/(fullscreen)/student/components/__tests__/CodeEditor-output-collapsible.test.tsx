/**
 * Tests for CodeEditor outputCollapsible prop
 *
 * Verifies that outputCollapsible=true renders a toggle button between the
 * editor and output panel (only when outputPosition="right" on desktop),
 * and that clicking it collapses/expands the output.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react';
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

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Undo2: ({ size }: any) => <span data-testid="icon-undo2">Undo2</span>,
  Redo2: ({ size }: any) => <span data-testid="icon-redo2">Redo2</span>,
  ChevronLeft: ({ size }: any) => <span data-testid="icon-chevron-left">ChevronLeft</span>,
  ChevronRight: ({ size }: any) => <span data-testid="icon-chevron-right">ChevronRight</span>,
}));

// Mock MarkdownContent
jest.mock('@/components/MarkdownContent', () => {
  return function MockMarkdownContent({ content }: any) {
    return <div data-testid="markdown-content">{content}</div>;
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

describe('CodeEditor outputCollapsible prop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should show toggle button when outputCollapsible=true, outputPosition="right", and desktop', () => {
    const { queryByTestId } = render(
      <CodeEditor
        code="print('hello')"
        onChange={jest.fn()}
        outputCollapsible={true}
        outputPosition="right"
        forceDesktop={true}
      />
    );

    const toggle = queryByTestId('output-collapse-toggle');
    expect(toggle).toBeInTheDocument();
  });

  it('should NOT show toggle button when outputCollapsible is false (default)', () => {
    const { queryByTestId } = render(
      <CodeEditor
        code="print('hello')"
        onChange={jest.fn()}
        outputPosition="right"
        forceDesktop={true}
      />
    );

    const toggle = queryByTestId('output-collapse-toggle');
    expect(toggle).not.toBeInTheDocument();
  });

  it('should NOT show toggle button when outputPosition is "bottom"', () => {
    const { queryByTestId } = render(
      <CodeEditor
        code="print('hello')"
        onChange={jest.fn()}
        outputCollapsible={true}
        outputPosition="bottom"
        forceDesktop={true}
      />
    );

    const toggle = queryByTestId('output-collapse-toggle');
    expect(toggle).not.toBeInTheDocument();
  });

  it('should collapse output panel when toggle is clicked', () => {
    const { getByTestId } = render(
      <CodeEditor
        code="print('hello')"
        onChange={jest.fn()}
        outputCollapsible={true}
        outputPosition="right"
        forceDesktop={true}
      />
    );

    const toggle = getByTestId('output-collapse-toggle');
    // Initially expanded - label should say "Collapse output panel"
    expect(toggle).toHaveAttribute('aria-label', 'Collapse output panel');

    // Click to collapse
    fireEvent.click(toggle);

    // After collapse - label should say "Expand output panel"
    expect(toggle).toHaveAttribute('aria-label', 'Expand output panel');

    // The output area should have width: 0 when collapsed
    const outputArea = getByTestId('output-area');
    const style = outputArea.getAttribute('style') || '';
    expect(style).toContain('width: 0');
  });

  it('should expand output panel when toggle is clicked again', () => {
    const { getByTestId } = render(
      <CodeEditor
        code="print('hello')"
        onChange={jest.fn()}
        outputCollapsible={true}
        outputPosition="right"
        forceDesktop={true}
      />
    );

    const toggle = getByTestId('output-collapse-toggle');

    // Click to collapse
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-label', 'Expand output panel');

    // Click again to expand
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-label', 'Collapse output panel');

    // The output area should have a width percentage, not 0
    const outputArea = getByTestId('output-area');
    const style = outputArea.getAttribute('style') || '';
    expect(style).not.toContain('width: 0');
    expect(style).toContain('width');
  });
});

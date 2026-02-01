/**
 * Tests for CodeEditor undo/redo functionality
 * 
 * Tests the undo/redo buttons and their interaction with Monaco editor
 * 
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CodeEditor from '../CodeEditor';

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Undo2: (props: any) => <svg data-testid="undo-icon" {...props} />,
  Redo2: (props: any) => <svg data-testid="redo-icon" {...props} />,
}));

// Mock Monaco Editor with undo/redo support
let mockEditorInstance: any;
jest.mock('@monaco-editor/react', () => {
  return function MockEditor({ value, onChange, onMount }: any) {
    React.useEffect(() => {
      if (onMount) {
        mockEditorInstance = {
          trigger: jest.fn(),
          focus: jest.fn(),
          deltaDecorations: jest.fn(() => []),
        };
        onMount(mockEditorInstance);
      }
    }, [onMount]);

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
    return <div data-testid="execution-settings">Execution Settings</div>;
  };
});

// Mock useResponsiveLayout
jest.mock('@/hooks/useResponsiveLayout', () => ({
  useResponsiveLayout: () => true, // Desktop layout
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

describe('CodeEditor Undo/Redo Functionality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEditorInstance = null;
  });

  it('should render undo and redo buttons when not read-only', () => {
    const mockOnChange = jest.fn();

    render(
      <CodeEditor
        code="print('hello')"
        onChange={mockOnChange}
        readOnly={false}
      />
    );

    const undoButton = screen.getByLabelText('Undo');
    const redoButton = screen.getByLabelText('Redo');

    expect(undoButton).toBeInTheDocument();
    expect(redoButton).toBeInTheDocument();
  });

  it('should not render undo/redo buttons when read-only', () => {
    const mockOnChange = jest.fn();

    render(
      <CodeEditor
        code="print('hello')"
        onChange={mockOnChange}
        readOnly={true}
      />
    );

    const undoButton = screen.queryByLabelText('Undo');
    const redoButton = screen.queryByLabelText('Redo');

    expect(undoButton).not.toBeInTheDocument();
    expect(redoButton).not.toBeInTheDocument();
  });

  it('should call editor.trigger with undo command when undo button is clicked', async () => {
    const mockOnChange = jest.fn();

    render(
      <CodeEditor
        code="print('hello')"
        onChange={mockOnChange}
        readOnly={false}
      />
    );

    // Wait for editor to mount
    await waitFor(() => {
      expect(mockEditorInstance).not.toBeNull();
    });

    const undoButton = screen.getByLabelText('Undo');
    fireEvent.click(undoButton);

    expect(mockEditorInstance.trigger).toHaveBeenCalledWith('keyboard', 'undo', null);
  });

  it('should call editor.trigger with redo command when redo button is clicked', async () => {
    const mockOnChange = jest.fn();

    render(
      <CodeEditor
        code="print('hello')"
        onChange={mockOnChange}
        readOnly={false}
      />
    );

    // Wait for editor to mount
    await waitFor(() => {
      expect(mockEditorInstance).not.toBeNull();
    });

    const redoButton = screen.getByLabelText('Redo');
    fireEvent.click(redoButton);

    expect(mockEditorInstance.trigger).toHaveBeenCalledWith('keyboard', 'redo', null);
  });

  it('should have proper tooltip text for keyboard shortcuts', () => {
    const mockOnChange = jest.fn();

    render(
      <CodeEditor
        code="print('hello')"
        onChange={mockOnChange}
        readOnly={false}
      />
    );

    const undoButton = screen.getByLabelText('Undo');
    const redoButton = screen.getByLabelText('Redo');

    expect(undoButton).toHaveAttribute('title', 'Undo (Ctrl+Z)');
    expect(redoButton).toHaveAttribute('title', 'Redo (Ctrl+Y)');
  });

  it('should not render undo/redo buttons when debugger is active (read-only)', () => {
    const mockOnChange = jest.fn();
    const mockDebugger = {
      trace: { steps: [], totalSteps: 0, exitCode: 0 },
      currentStep: 0,
      isLoading: false,
      error: null,
      requestTrace: jest.fn(),
      setTrace: jest.fn(),
      setError: jest.fn(),
      stepForward: jest.fn(),
      stepBackward: jest.fn(),
      jumpToStep: jest.fn(),
      jumpToFirst: jest.fn(),
      jumpToLast: jest.fn(),
      reset: jest.fn(),
      getCurrentStep: jest.fn(() => null),
      getCurrentLocals: jest.fn(() => ({})),
      getCurrentGlobals: jest.fn(() => ({})),
      getCurrentCallStack: jest.fn(() => []),
      getPreviousStep: jest.fn(() => null),
      totalSteps: 0,
      hasTrace: true,
      canStepForward: false,
      canStepBackward: false,
    };

    render(
      <CodeEditor
        code="print('hello')"
        onChange={mockOnChange}
        debugger={mockDebugger}
      />
    );

    const undoButton = screen.queryByLabelText('Undo');
    const redoButton = screen.queryByLabelText('Redo');

    expect(undoButton).not.toBeInTheDocument();
    expect(redoButton).not.toBeInTheDocument();
  });

  it('should handle clicking undo button before editor is mounted', () => {
    const mockOnChange = jest.fn();

    // Render without onMount triggering
    jest.spyOn(React, 'useEffect').mockImplementation(() => {});

    render(
      <CodeEditor
        code="print('hello')"
        onChange={mockOnChange}
        readOnly={false}
      />
    );

    const undoButton = screen.getByLabelText('Undo');
    
    // Should not crash when editor is not yet mounted
    expect(() => fireEvent.click(undoButton)).not.toThrow();

    jest.restoreAllMocks();
  });

  it('should render Lucide Undo2 and Redo2 icons inside the buttons', () => {
    const mockOnChange = jest.fn();

    render(
      <CodeEditor
        code="print('hello')"
        onChange={mockOnChange}
        readOnly={false}
      />
    );

    expect(screen.getByTestId('undo-icon')).toBeInTheDocument();
    expect(screen.getByTestId('redo-icon')).toBeInTheDocument();
  });

  it('should display undo/redo buttons with proper styling', () => {
    const mockOnChange = jest.fn();

    render(
      <CodeEditor
        code="print('hello')"
        onChange={mockOnChange}
        readOnly={false}
      />
    );

    const undoButton = screen.getByLabelText('Undo');
    const redoButton = screen.getByLabelText('Redo');

    // Check for proper CSS classes
    expect(undoButton).toHaveClass('bg-gray-200');
    expect(undoButton).toHaveClass('hover:bg-gray-300');
    expect(redoButton).toHaveClass('bg-gray-200');
    expect(redoButton).toHaveClass('hover:bg-gray-300');
  });

  it('should render undo/redo buttons in the header alongside run button', () => {
    const mockOnChange = jest.fn();
    const mockOnRun = jest.fn();

    render(
      <CodeEditor
        code="print('hello')"
        onChange={mockOnChange}
        onRun={mockOnRun}
        readOnly={false}
      />
    );

    const undoButton = screen.getByLabelText('Undo');
    const redoButton = screen.getByLabelText('Redo');
    const runButton = screen.getByText('▶ Run Code');

    // All buttons should be in the same container
    const header = undoButton.parentElement;
    expect(header).toContainElement(redoButton);
    expect(header).toContainElement(runButton);
  });
});

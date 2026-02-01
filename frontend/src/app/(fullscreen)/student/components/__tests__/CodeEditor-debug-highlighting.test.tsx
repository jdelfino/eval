/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import CodeEditor from '../CodeEditor';

// Mock Monaco Editor with deltaDecorations support
let mockDeltaDecorations: jest.Mock;
let mockEditor: any;

jest.mock('@monaco-editor/react', () => {
  return function MockEditor({ onMount }: any) {
    React.useEffect(() => {
      if (onMount) {
        onMount(mockEditor);
      }
    }, [onMount]);
    return <div data-testid="monaco-editor">Monaco Editor</div>;
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

describe('CodeEditor - Debug Line Highlighting', () => {
  beforeEach(() => {
    mockDeltaDecorations = jest.fn().mockReturnValue(['decoration-id-1']);
    mockEditor = {
      focus: jest.fn(),
      getModel: jest.fn(() => ({
        getFullModelRange: jest.fn(() => ({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 1,
        })),
      })),
      executeEdits: jest.fn(),
      deltaDecorations: mockDeltaDecorations,
    };
  });

  it('should add decoration when currentLine is set during debugging', () => {
    const mockDebugger = {
      hasTrace: true,
      isLoading: false,
      currentStep: 0,
      totalSteps: 5,
      trace: { steps: [], truncated: false, totalSteps: 5, exitCode: 0 },
      getCurrentStep: jest.fn().mockReturnValue({ line: 5 }),
      getCurrentLocals: jest.fn().mockReturnValue({}),
      getCurrentGlobals: jest.fn().mockReturnValue({}),
      getPreviousStep: jest.fn().mockReturnValue(null),
      getCurrentCallStack: jest.fn().mockReturnValue([]),
      canStepForward: true,
      canStepBackward: false,
      stepForward: jest.fn(),
      stepBackward: jest.fn(),
      jumpToFirst: jest.fn(),
      jumpToLast: jest.fn(),
      reset: jest.fn(),
      requestTrace: jest.fn(),
      setTrace: jest.fn(),
      setError: jest.fn(),
      jumpToStep: jest.fn(),
      error: null,
    };

    render(
      <CodeEditor
        code="print('hello')\nprint('world')\nx = 5\ny = 10\nprint(x + y)"
        onChange={jest.fn()}
        debugger={mockDebugger}
      />
    );

    // Verify deltaDecorations was called with the correct parameters
    expect(mockDeltaDecorations).toHaveBeenCalled();
    const lastCall = mockDeltaDecorations.mock.calls[mockDeltaDecorations.mock.calls.length - 1];
    const decorations = lastCall[1];

    expect(decorations).toHaveLength(1);
    expect(decorations[0]).toMatchObject({
      range: {
        startLineNumber: 5,
        startColumn: 1,
        endLineNumber: 5,
        endColumn: 1,
      },
      options: {
        isWholeLine: true,
        className: 'debugger-line-highlight',
        glyphMarginClassName: 'debugger-line-glyph',
      },
    });
  });

  it('should remove decoration when debugging stops', () => {
    const mockDebugger = {
      hasTrace: false,
      isLoading: false,
      currentStep: 0,
      totalSteps: 0,
      trace: null,
      getCurrentStep: jest.fn().mockReturnValue(null),
      getCurrentLocals: jest.fn().mockReturnValue({}),
      getCurrentGlobals: jest.fn().mockReturnValue({}),
      getPreviousStep: jest.fn().mockReturnValue(null),
      getCurrentCallStack: jest.fn().mockReturnValue([]),
      canStepForward: false,
      canStepBackward: false,
      stepForward: jest.fn(),
      stepBackward: jest.fn(),
      jumpToFirst: jest.fn(),
      jumpToLast: jest.fn(),
      reset: jest.fn(),
      requestTrace: jest.fn(),
      setTrace: jest.fn(),
      setError: jest.fn(),
      jumpToStep: jest.fn(),
      error: null,
    };

    render(
      <CodeEditor
        code="print('hello')"
        onChange={jest.fn()}
        debugger={mockDebugger}
      />
    );

    // Verify deltaDecorations was called to clear decorations
    expect(mockDeltaDecorations).toHaveBeenCalled();
    const lastCall = mockDeltaDecorations.mock.calls[mockDeltaDecorations.mock.calls.length - 1];
    const decorations = lastCall[1];

    // When not debugging, decorations array should be empty
    expect(decorations).toHaveLength(0);
  });

  it('should update decoration when stepping to a new line', () => {
    const mockDebugger = {
      hasTrace: true,
      isLoading: false,
      currentStep: 0,
      totalSteps: 5,
      trace: { steps: [], truncated: false, totalSteps: 5, exitCode: 0 },
      getCurrentStep: jest.fn().mockReturnValue({ line: 3 }),
      getCurrentLocals: jest.fn().mockReturnValue({}),
      getCurrentGlobals: jest.fn().mockReturnValue({}),
      getPreviousStep: jest.fn().mockReturnValue(null),
      getCurrentCallStack: jest.fn().mockReturnValue([]),
      canStepForward: true,
      canStepBackward: false,
      stepForward: jest.fn(),
      stepBackward: jest.fn(),
      jumpToFirst: jest.fn(),
      jumpToLast: jest.fn(),
      reset: jest.fn(),
      requestTrace: jest.fn(),
      setTrace: jest.fn(),
      setError: jest.fn(),
      jumpToStep: jest.fn(),
      error: null,
    };

    const { rerender } = render(
      <CodeEditor
        code="x = 1\ny = 2\nz = x + y\nprint(z)"
        onChange={jest.fn()}
        debugger={mockDebugger}
      />
    );

    // Initial decoration at line 3
    expect(mockDeltaDecorations).toHaveBeenCalled();
    let lastCall = mockDeltaDecorations.mock.calls[mockDeltaDecorations.mock.calls.length - 1];
    let decorations = lastCall[1];
    expect(decorations[0].range.startLineNumber).toBe(3);

    // Update to line 4
    mockDebugger.currentStep = 1;
    mockDebugger.getCurrentStep = jest.fn().mockReturnValue({ line: 4 });

    rerender(
      <CodeEditor
        code="x = 1\ny = 2\nz = x + y\nprint(z)"
        onChange={jest.fn()}
        debugger={mockDebugger}
      />
    );

    // Should have new decoration at line 4
    lastCall = mockDeltaDecorations.mock.calls[mockDeltaDecorations.mock.calls.length - 1];
    decorations = lastCall[1];
    expect(decorations[0].range.startLineNumber).toBe(4);
  });

  it('should not add decoration when debugger is loading', () => {
    const mockDebugger = {
      hasTrace: false,
      isLoading: true,
      currentStep: 0,
      totalSteps: 0,
      trace: null,
      getCurrentStep: jest.fn().mockReturnValue(null),
      getCurrentLocals: jest.fn().mockReturnValue({}),
      getCurrentGlobals: jest.fn().mockReturnValue({}),
      getPreviousStep: jest.fn().mockReturnValue(null),
      getCurrentCallStack: jest.fn().mockReturnValue([]),
      canStepForward: false,
      canStepBackward: false,
      stepForward: jest.fn(),
      stepBackward: jest.fn(),
      jumpToFirst: jest.fn(),
      jumpToLast: jest.fn(),
      reset: jest.fn(),
      requestTrace: jest.fn(),
      setTrace: jest.fn(),
      setError: jest.fn(),
      jumpToStep: jest.fn(),
      error: null,
    };

    render(
      <CodeEditor
        code="print('hello')"
        onChange={jest.fn()}
        debugger={mockDebugger}
      />
    );

    // Verify deltaDecorations was called with empty decorations
    expect(mockDeltaDecorations).toHaveBeenCalled();
    const lastCall = mockDeltaDecorations.mock.calls[mockDeltaDecorations.mock.calls.length - 1];
    const decorations = lastCall[1];
    expect(decorations).toHaveLength(0);
  });

  it('should make editor read-only when debugger is active', () => {
    const mockDebugger = {
      hasTrace: true,
      isLoading: false,
      currentStep: 0,
      totalSteps: 5,
      trace: { steps: [], truncated: false, totalSteps: 5, exitCode: 0 },
      getCurrentStep: jest.fn().mockReturnValue({ line: 5 }),
      getCurrentLocals: jest.fn().mockReturnValue({}),
      getCurrentGlobals: jest.fn().mockReturnValue({}),
      getPreviousStep: jest.fn().mockReturnValue(null),
      getCurrentCallStack: jest.fn().mockReturnValue([]),
      canStepForward: true,
      canStepBackward: false,
      stepForward: jest.fn(),
      stepBackward: jest.fn(),
      jumpToFirst: jest.fn(),
      jumpToLast: jest.fn(),
      reset: jest.fn(),
      requestTrace: jest.fn(),
      setTrace: jest.fn(),
      setError: jest.fn(),
      jumpToStep: jest.fn(),
      error: null,
    };

    const onChange = jest.fn();
    render(
      <CodeEditor
        code="print('hello')"
        onChange={onChange}
        debugger={mockDebugger}
      />
    );

    // onChange should be called during mount, but editor should be read-only
    // Since the Monaco mock auto-calls onMount, check that focus was NOT called (read-only editors don't get focus)
    expect(mockEditor.focus).not.toHaveBeenCalled();
  });

  it('should allow editing when debugger is not active', () => {
    const mockDebugger = {
      hasTrace: false,
      isLoading: false,
      currentStep: 0,
      totalSteps: 0,
      trace: null,
      getCurrentStep: jest.fn().mockReturnValue(null),
      getCurrentLocals: jest.fn().mockReturnValue({}),
      getCurrentGlobals: jest.fn().mockReturnValue({}),
      getPreviousStep: jest.fn().mockReturnValue(null),
      getCurrentCallStack: jest.fn().mockReturnValue([]),
      canStepForward: false,
      canStepBackward: false,
      stepForward: jest.fn(),
      stepBackward: jest.fn(),
      jumpToFirst: jest.fn(),
      jumpToLast: jest.fn(),
      reset: jest.fn(),
      requestTrace: jest.fn(),
      setTrace: jest.fn(),
      setError: jest.fn(),
      jumpToStep: jest.fn(),
      error: null,
    };

    const onChange = jest.fn();
    render(
      <CodeEditor
        code="print('hello')"
        onChange={onChange}
        debugger={mockDebugger}
      />
    );

    // Editor should not be read-only, so focus should be called
    expect(mockEditor.focus).toHaveBeenCalled();
  });

  it('should respect explicit readOnly prop even when debugger is not active', () => {
    const mockDebugger = {
      hasTrace: false,
      isLoading: false,
      currentStep: 0,
      totalSteps: 0,
      trace: null,
      getCurrentStep: jest.fn().mockReturnValue(null),
      getCurrentLocals: jest.fn().mockReturnValue({}),
      getCurrentGlobals: jest.fn().mockReturnValue({}),
      getPreviousStep: jest.fn().mockReturnValue(null),
      getCurrentCallStack: jest.fn().mockReturnValue([]),
      canStepForward: false,
      canStepBackward: false,
      stepForward: jest.fn(),
      stepBackward: jest.fn(),
      jumpToFirst: jest.fn(),
      jumpToLast: jest.fn(),
      reset: jest.fn(),
      requestTrace: jest.fn(),
      setTrace: jest.fn(),
      setError: jest.fn(),
      jumpToStep: jest.fn(),
      error: null,
    };

    const onChange = jest.fn();
    render(
      <CodeEditor
        code="print('hello')"
        onChange={onChange}
        readOnly={true}
        debugger={mockDebugger}
      />
    );

    // Editor is explicitly readOnly, so focus should NOT be called
    expect(mockEditor.focus).not.toHaveBeenCalled();
  });
});

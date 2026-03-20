/**
 * Consolidated behavioral tests for CodeEditor component.
 *
 * Covers: API execution, debug highlighting, debugger output, form interaction,
 * markdown rendering, sidebar, undo/redo, and output collapsible.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import CodeEditor from '../CodeEditor';

// ---------------------------------------------------------------------------
// Shared Monaco Editor mock
// ---------------------------------------------------------------------------

// Module-level mutable so individual tests can configure the instance.
let mockEditorInstance: any = null;

jest.mock('@monaco-editor/react', () => {
  return function MockEditor({ value, onChange, onMount }: any) {
    const mountedRef = React.useRef(false);
    React.useEffect(() => {
      if (onMount && !mountedRef.current) {
        mountedRef.current = true;
        mockEditorInstance = {
          focus: jest.fn(),
          trigger: jest.fn(),
          getValue: jest.fn(() => 'test code'),
          setValue: jest.fn(),
          deltaDecorations: jest.fn().mockReturnValue(['decoration-id-1']),
          getModel: jest.fn(() => ({
            getFullModelRange: jest.fn(() => ({
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: 1,
              endColumn: 1,
            })),
          })),
          executeEdits: jest.fn(),
        };
        onMount(mockEditorInstance);
      }
    }, [onMount]);

    return (
      <div data-testid="monaco-editor">
        <textarea
          data-testid="code-input"
          value={value ?? ''}
          onChange={(e) => onChange?.(e.target.value)}
        />
      </div>
    );
  };
});

// ---------------------------------------------------------------------------
// Other shared mocks
// ---------------------------------------------------------------------------

jest.mock('../ExecutionSettings', () => {
  return function MockExecutionSettings({ inSidebar }: { inSidebar?: boolean }) {
    return (
      <div data-testid="execution-settings" data-in-sidebar={inSidebar}>
        Execution Settings {inSidebar ? '(Sidebar)' : '(Bottom)'}
      </div>
    );
  };
});

jest.mock('@/hooks/useResponsiveLayout', () => ({
  useResponsiveLayout: jest.fn(() => true), // default: desktop
  useSidebarSection: jest.fn((section_id: string, defaultCollapsed: boolean) => ({
    isCollapsed: defaultCollapsed ?? false,
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

jest.mock('@/lib/api/execute', () => ({
  executeCode: jest.fn(),
}));

jest.mock('lucide-react', () => ({
  Undo2: (props: any) => <svg data-testid="undo-icon" {...props} />,
  Redo2: (props: any) => <svg data-testid="redo-icon" {...props} />,
  ChevronLeft: ({ size }: any) => <span data-testid="icon-chevron-left">ChevronLeft</span>,
  ChevronRight: ({ size }: any) => <span data-testid="icon-chevron-right">ChevronRight</span>,
}));

// ---------------------------------------------------------------------------
// Helper to get hooks mock
// ---------------------------------------------------------------------------
function getLayoutMock() {
  return require('@/hooks/useResponsiveLayout') as {
    useResponsiveLayout: jest.Mock;
    useSidebarSection: jest.Mock;
    useMobileViewport: jest.Mock;
  };
}

function setDesktopLayout() {
  const m = getLayoutMock();
  m.useResponsiveLayout.mockReturnValue(true);
  m.useMobileViewport.mockReturnValue({
    isMobile: false,
    isTablet: false,
    isVerySmall: false,
    isDesktop: true,
    width: 1200,
  });
}

function setMobileLayout(isVerySmall = false) {
  const m = getLayoutMock();
  m.useResponsiveLayout.mockReturnValue(false);
  m.useMobileViewport.mockReturnValue({
    isMobile: true,
    isTablet: false,
    isVerySmall,
    isDesktop: false,
    width: isVerySmall ? 375 : 600,
  });
}

// ---------------------------------------------------------------------------
// Common test data
// ---------------------------------------------------------------------------

const baseDebugger = {
  hasTrace: false,
  isLoading: false,
  currentStep: 0,
  total_steps: 0,
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

function makeActiveDebugger(overrides: Record<string, any> = {}) {
  return {
    ...baseDebugger,
    hasTrace: true,
    total_steps: 5,
    trace: { steps: [], truncated: false, total_steps: 5, exit_code: 0 },
    canStepForward: true,
    getCurrentStep: jest.fn().mockReturnValue({ line: 5 }),
    ...overrides,
  };
}

// ===========================================================================
// API Execution
// ===========================================================================

describe('CodeEditor - API Execution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEditorInstance = null;
    setDesktopLayout();
    getLayoutMock().useSidebarSection.mockReturnValue({
      isCollapsed: true,
      toggle: jest.fn(),
      setCollapsed: jest.fn(),
    });
  });

  describe('WebSocket Execution Mode (default)', () => {
    it('calls onRun callback when run button is clicked', () => {
      const mockOnRun = jest.fn();
      render(
        <CodeEditor code="print('hello')" onChange={jest.fn()} onRun={mockOnRun} />
      );

      fireEvent.click(screen.getByText('▶ Run Code'));

      expect(mockOnRun).toHaveBeenCalledWith({
        stdin: undefined,
        random_seed: undefined,
        attached_files: undefined,
      });
    });

    it('displays execution results when provided', () => {
      render(
        <CodeEditor
          code="print('Hello, World!')"
          onChange={jest.fn()}
          onRun={jest.fn()}
          execution_result={{
            results: [{ name: 'run', type: 'io', status: 'run', input: '', actual: 'Hello, World!\n', time_ms: 125 }],
            summary: { total: 1, passed: 0, failed: 0, errors: 0, run: 1, time_ms: 125 },
          }}
        />
      );

      expect(screen.getByText('✓ Success')).toBeInTheDocument();
      expect(screen.getByText(/Execution time: 125ms/)).toBeInTheDocument();
      expect(screen.getByText('Output:')).toBeInTheDocument();
      expect(screen.getByText('Hello, World!')).toBeInTheDocument();
    });

    it('displays error results when execution fails', () => {
      render(
        <CodeEditor
          code="print(x)"
          onChange={jest.fn()}
          onRun={jest.fn()}
          execution_result={{
            results: [{ name: 'run', type: 'io', status: 'error', input: '', stderr: 'NameError: name "x" is not defined', time_ms: 100 }],
            summary: { total: 1, passed: 0, failed: 0, errors: 1, run: 0, time_ms: 100 },
          }}
        />
      );

      expect(screen.getByText('✗ Error')).toBeInTheDocument();
      expect(screen.getByText(/Execution time: 100ms/)).toBeInTheDocument();
      expect(screen.getByText('Error:')).toBeInTheDocument();
      expect(screen.getByText('NameError: name "x" is not defined')).toBeInTheDocument();
    });
  });


  describe('Props and customization', () => {
    it('uses custom title when provided', () => {
      render(
        <CodeEditor
          code="print('test')"
          onChange={jest.fn()}
          onRun={jest.fn()}
          title="My Custom Code"
        />
      );
      expect(screen.getByText('My Custom Code')).toBeInTheDocument();
    });

    it('hides run button when showRunButton is false', () => {
      render(<CodeEditor code="print('test')" onChange={jest.fn()} showRunButton={false} />);
      expect(screen.queryByText('▶ Run Code')).not.toBeInTheDocument();
    });

    it('run button is enabled even in read-only mode', () => {
      render(
        <CodeEditor
          code="print('test')"
          onChange={jest.fn()}
          onRun={jest.fn()}
          readOnly={true}
        />
      );
      expect(screen.getByText('▶ Run Code')).not.toBeDisabled();
    });
  });
});

// ===========================================================================
// Debug Line Highlighting
// ===========================================================================

describe('CodeEditor - Debug Line Highlighting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEditorInstance = null;
    setDesktopLayout();
    getLayoutMock().useSidebarSection.mockReturnValue({
      isCollapsed: true,
      toggle: jest.fn(),
      setCollapsed: jest.fn(),
    });
  });

  it('adds decoration when currentLine is set during debugging', () => {
    const debugger_ = makeActiveDebugger();

    render(
      <CodeEditor
        code="print('hello')\nprint('world')\nx = 5\ny = 10\nprint(x + y)"
        onChange={jest.fn()}
        debugger={debugger_}
      />
    );

    expect(mockEditorInstance.deltaDecorations).toHaveBeenCalled();
    const lastCall = mockEditorInstance.deltaDecorations.mock.calls[
      mockEditorInstance.deltaDecorations.mock.calls.length - 1
    ];
    const decorations = lastCall[1];

    expect(decorations).toHaveLength(1);
    expect(decorations[0]).toMatchObject({
      range: { startLineNumber: 5, startColumn: 1, endLineNumber: 5, endColumn: 1 },
      options: {
        isWholeLine: true,
        className: 'debugger-line-highlight',
        glyphMarginClassName: 'debugger-line-glyph',
      },
    });
  });

  it('removes decoration when debugging stops', () => {
    const debugger_ = { ...baseDebugger };

    render(
      <CodeEditor code="print('hello')" onChange={jest.fn()} debugger={debugger_} />
    );

    expect(mockEditorInstance.deltaDecorations).toHaveBeenCalled();
    const lastCall = mockEditorInstance.deltaDecorations.mock.calls[
      mockEditorInstance.deltaDecorations.mock.calls.length - 1
    ];
    expect(lastCall[1]).toHaveLength(0);
  });

  it('updates decoration when stepping to a new line', () => {
    const debugger_ = makeActiveDebugger({
      getCurrentStep: jest.fn().mockReturnValue({ line: 3 }),
    });

    const { rerender } = render(
      <CodeEditor
        code="x = 1\ny = 2\nz = x + y\nprint(z)"
        onChange={jest.fn()}
        debugger={debugger_}
      />
    );

    let lastCall = mockEditorInstance.deltaDecorations.mock.calls[
      mockEditorInstance.deltaDecorations.mock.calls.length - 1
    ];
    expect(lastCall[1][0].range.startLineNumber).toBe(3);

    const updatedDebugger = {
      ...debugger_,
      currentStep: 1,
      getCurrentStep: jest.fn().mockReturnValue({ line: 4 }),
    };

    rerender(
      <CodeEditor
        code="x = 1\ny = 2\nz = x + y\nprint(z)"
        onChange={jest.fn()}
        debugger={updatedDebugger}
      />
    );

    lastCall = mockEditorInstance.deltaDecorations.mock.calls[
      mockEditorInstance.deltaDecorations.mock.calls.length - 1
    ];
    expect(lastCall[1][0].range.startLineNumber).toBe(4);
  });

  it('does not add decoration when debugger is loading', () => {
    const debugger_ = { ...baseDebugger, isLoading: true };

    render(<CodeEditor code="print('hello')" onChange={jest.fn()} debugger={debugger_} />);

    const lastCall = mockEditorInstance.deltaDecorations.mock.calls[
      mockEditorInstance.deltaDecorations.mock.calls.length - 1
    ];
    expect(lastCall[1]).toHaveLength(0);
  });

  it('makes editor read-only when debugger is active (focus not called)', () => {
    const debugger_ = makeActiveDebugger();
    render(<CodeEditor code="print('hello')" onChange={jest.fn()} debugger={debugger_} />);
    expect(mockEditorInstance.focus).not.toHaveBeenCalled();
  });

  it('allows editing when debugger is not active (focus called)', () => {
    const debugger_ = { ...baseDebugger };
    render(<CodeEditor code="print('hello')" onChange={jest.fn()} debugger={debugger_} />);
    expect(mockEditorInstance.focus).toHaveBeenCalled();
  });

  it('respects explicit readOnly prop even when debugger is not active', () => {
    const debugger_ = { ...baseDebugger };
    render(
      <CodeEditor
        code="print('hello')"
        onChange={jest.fn()}
        readOnly={true}
        debugger={debugger_}
      />
    );
    expect(mockEditorInstance.focus).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Debugger Output Display
// ===========================================================================

describe('CodeEditor - Debugger Output Display', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEditorInstance = null;
    setDesktopLayout();
    getLayoutMock().useSidebarSection.mockReturnValue({
      isCollapsed: true,
      toggle: jest.fn(),
      setCollapsed: jest.fn(),
    });
  });

  describe('when debugger has trace with stdout', () => {
    it('displays stdout with step annotations in the output panel', () => {
      const debugger_ = {
        trace: {
          steps: [
            { line: 1, event: 'line', locals: {}, globals: {}, call_stack: [], stdout: '' },
            { line: 2, event: 'line', locals: { x: 5 }, globals: {}, call_stack: [], stdout: 'Hello, World!\n' },
            { line: 3, event: 'line', locals: { x: 5, y: 10 }, globals: {}, call_stack: [], stdout: 'Hello, World!\nValue: 15\n' },
          ],
          total_steps: 3,
          exit_code: 0,
          truncated: false,
        },
        currentStep: 2,
        isLoading: false,
        error: null,
        hasTrace: true,
        total_steps: 3,
        canStepForward: false,
        canStepBackward: true,
        requestTrace: jest.fn(),
        setTrace: jest.fn(),
        setError: jest.fn(),
        stepForward: jest.fn(),
        stepBackward: jest.fn(),
        jumpToStep: jest.fn(),
        jumpToFirst: jest.fn(),
        jumpToLast: jest.fn(),
        reset: jest.fn(),
        getCurrentStep: jest.fn(() => ({
          line: 3,
          event: 'line',
          locals: { x: 5, y: 10 },
          globals: {},
          call_stack: [],
          stdout: 'Hello, World!\nValue: 15\n',
        })),
        getCurrentLocals: jest.fn(() => ({ x: 5, y: 10 })),
        getCurrentGlobals: jest.fn(() => ({})),
        getCurrentCallStack: jest.fn(() => []),
        getPreviousStep: jest.fn(() => ({
          line: 2,
          event: 'line',
          locals: { x: 5 },
          globals: {},
          call_stack: [],
          stdout: 'Hello, World!\n',
        })),
      };

      render(
        <CodeEditor
          code="x = 5\nprint('Hello, World!')\ny = 10\nprint(f'Value: {x + y}')"
          onChange={jest.fn()}
          debugger={debugger_}
        />
      );

      expect(screen.getByText('🐛 Debugger Output')).toBeInTheDocument();
      expect(screen.getByText('Step 3 of 3')).toBeInTheDocument();
      expect(screen.getByText('Console Output (up to current step):')).toBeInTheDocument();
      expect(screen.getByText('[Step 2]')).toBeInTheDocument();
      expect(screen.getByText('[Step 3]')).toBeInTheDocument();
      expect(screen.getByText('Hello, World!')).toBeInTheDocument();
      expect(screen.getByText('Value: 15')).toBeInTheDocument();
    });

    it('shows "no output yet" when stdout is empty', () => {
      const debugger_ = {
        trace: {
          steps: [{ line: 1, event: 'line', locals: {}, globals: {}, call_stack: [], stdout: '' }],
          total_steps: 1,
          exit_code: 0,
          truncated: false,
        },
        currentStep: 0,
        isLoading: false,
        error: null,
        hasTrace: true,
        total_steps: 1,
        canStepForward: false,
        canStepBackward: false,
        requestTrace: jest.fn(),
        setTrace: jest.fn(),
        setError: jest.fn(),
        stepForward: jest.fn(),
        stepBackward: jest.fn(),
        jumpToStep: jest.fn(),
        jumpToFirst: jest.fn(),
        jumpToLast: jest.fn(),
        reset: jest.fn(),
        getCurrentStep: jest.fn(() => ({
          line: 1,
          event: 'line',
          locals: {},
          globals: {},
          call_stack: [],
          stdout: '',
        })),
        getCurrentLocals: jest.fn(() => ({})),
        getCurrentGlobals: jest.fn(() => ({})),
        getCurrentCallStack: jest.fn(() => []),
        getPreviousStep: jest.fn(() => null),
      };

      render(<CodeEditor code="x = 5" onChange={jest.fn()} debugger={debugger_} />);
      expect(screen.getByText('No console output yet')).toBeInTheDocument();
    });

    it('displays error messages when debugger has errors', () => {
      const debugger_ = {
        trace: { steps: [], total_steps: 0, exit_code: 1, truncated: false },
        currentStep: 0,
        isLoading: false,
        error: 'NameError: name "undefined_var" is not defined',
        hasTrace: true,
        total_steps: 0,
        canStepForward: false,
        canStepBackward: false,
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
      };

      render(<CodeEditor code="print(undefined_var)" onChange={jest.fn()} debugger={debugger_} />);
      expect(screen.getByText('Error:')).toBeInTheDocument();
      expect(screen.getByText(/NameError/)).toBeInTheDocument();
    });

    it('shows stdout incrementally as user steps through code', () => {
      const debugger_ = {
        trace: {
          steps: [
            { line: 1, event: 'line', locals: {}, globals: {}, call_stack: [], stdout: '' },
            { line: 2, event: 'line', locals: {}, globals: {}, call_stack: [], stdout: 'First line\n' },
            { line: 3, event: 'line', locals: {}, globals: {}, call_stack: [], stdout: 'First line\nSecond line\n' },
          ],
          total_steps: 3,
          exit_code: 0,
          truncated: false,
        },
        currentStep: 1,
        isLoading: false,
        error: null,
        hasTrace: true,
        total_steps: 3,
        canStepForward: true,
        canStepBackward: true,
        requestTrace: jest.fn(),
        setTrace: jest.fn(),
        setError: jest.fn(),
        stepForward: jest.fn(),
        stepBackward: jest.fn(),
        jumpToStep: jest.fn(),
        jumpToFirst: jest.fn(),
        jumpToLast: jest.fn(),
        reset: jest.fn(),
        getCurrentStep: jest.fn(() => ({
          line: 2,
          event: 'line',
          locals: {},
          globals: {},
          call_stack: [],
          stdout: 'First line\n',
        })),
        getCurrentLocals: jest.fn(() => ({})),
        getCurrentGlobals: jest.fn(() => ({})),
        getCurrentCallStack: jest.fn(() => []),
        getPreviousStep: jest.fn(() => ({
          line: 1,
          event: 'line',
          locals: {},
          globals: {},
          call_stack: [],
          stdout: '',
        })),
      };

      render(
        <CodeEditor
          code="print('First line')\nprint('Second line')"
          onChange={jest.fn()}
          debugger={debugger_}
        />
      );

      expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
      expect(screen.getByText('[Step 2]')).toBeInTheDocument();
      expect(screen.getByText('First line')).toBeInTheDocument();
      expect(screen.queryByText('Second line')).not.toBeInTheDocument();
    });
  });

  describe('when debugger is not active', () => {
    it('shows normal execution result output', () => {
      render(
        <CodeEditor
          code="print('Hello')"
          onChange={jest.fn()}
          execution_result={{ results: [{ name: 'run', type: 'io', status: 'run', input: '', actual: 'Hello\n', time_ms: 100 }], summary: { total: 1, passed: 0, failed: 0, errors: 0, run: 1, time_ms: 100 } }}
        />
      );
      expect(screen.getByText('✓ Success')).toBeInTheDocument();
      // Use getAllByText to handle the textarea also containing the code
      expect(screen.getAllByText(/Hello/).length).toBeGreaterThan(0);
    });

    it('shows waiting message when no output exists and no problem loaded', () => {
      render(<CodeEditor code="# Empty code" onChange={jest.fn()} />);
      expect(screen.getByText('Waiting for instructor to load a problem...')).toBeInTheDocument();
      expect(screen.getByText('You can start writing code while you wait.')).toBeInTheDocument();
    });

    it('shows run-code message when no output exists but problem is loaded', () => {
      render(
        <CodeEditor
          code="# Empty code"
          onChange={jest.fn()}
          problem={{ title: 'Test Problem', description: null, starter_code: null, language: 'python' }}
        />
      );
      expect(screen.getByText('No output yet.')).toBeInTheDocument();
      expect(screen.getByText('Click "Run Code" to execute your program and see the results here.')).toBeInTheDocument();
    });
  });
});

// ===========================================================================
// Form Interaction
// ===========================================================================

describe('CodeEditor - Form Interaction', () => {
  const mockProblem = {
    id: 'test-problem',
    title: 'Test Problem',
    description: 'Test problem description',
    starter_code: 'print("hello")',
    test_cases: [],
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-01T00:00:00Z'),
    author_id: 'test-author',
    language: 'python',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockEditorInstance = null;
    localStorage.clear();
    setDesktopLayout();
    // Use actual useSidebarSection so problem panel opens by default
    const actual = jest.requireActual('@/hooks/useResponsiveLayout');
    getLayoutMock().useSidebarSection.mockImplementation(actual.useSidebarSection);
  });

  it('does not submit parent form when clicking Problem toggle button', async () => {
    const handleSubmit = jest.fn((e) => e.preventDefault());

    render(
      <form onSubmit={handleSubmit}>
        <CodeEditor code="print('test')" onChange={jest.fn()} problem={mockProblem} />
        <button type="submit">Submit Form</button>
      </form>
    );

    const problemToggleButton = screen.getByLabelText('Problem');
    await act(async () => { fireEvent.click(problemToggleButton); });

    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('does not submit parent form when clicking Settings toggle button', async () => {
    const handleSubmit = jest.fn((e) => e.preventDefault());

    render(
      <form onSubmit={handleSubmit}>
        <CodeEditor code="print('test')" onChange={jest.fn()} problem={mockProblem} />
        <button type="submit">Submit Form</button>
      </form>
    );

    const settingsToggleButton = screen.getByLabelText('Execution Settings');
    await act(async () => { fireEvent.click(settingsToggleButton); });

    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('does not submit parent form when clicking close panel button', async () => {
    const handleSubmit = jest.fn((e) => e.preventDefault());

    jest.spyOn(require('@/hooks/useResponsiveLayout'), 'useSidebarSection')
      .mockImplementation(((section_id: string) => {
        if (section_id === 'problem-panel') {
          return { isCollapsed: false, toggle: jest.fn(), setCollapsed: jest.fn() };
        }
        return { isCollapsed: true, toggle: jest.fn(), setCollapsed: jest.fn() };
      }) as any);

    render(
      <form onSubmit={handleSubmit}>
        <CodeEditor code="print('test')" onChange={jest.fn()} problem={mockProblem} />
        <button type="submit">Submit Form</button>
      </form>
    );

    const closePanelButtons = screen.getAllByLabelText('Close panel');
    fireEvent.click(closePanelButtons[0]);

    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('does not submit parent form when clicking Run Code button', async () => {
    const handleSubmit = jest.fn((e) => e.preventDefault());
    const handleRun = jest.fn();

    render(
      <form onSubmit={handleSubmit}>
        <CodeEditor code="print('test')" onChange={jest.fn()} onRun={handleRun} showRunButton={true} />
        <button type="submit">Submit Form</button>
      </form>
    );

    fireEvent.click(screen.getByText(/▶ Run Code/));

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(handleRun).toHaveBeenCalled();
  });

  it('does not submit parent form when clicking Restore Starter Code button', async () => {
    const handleSubmit = jest.fn((e) => e.preventDefault());
    const handleLoadStarterCode = jest.fn();

    jest.spyOn(require('@/hooks/useResponsiveLayout'), 'useSidebarSection')
      .mockImplementation(((section_id: string) => {
        if (section_id === 'problem-panel') {
          return { isCollapsed: false, toggle: jest.fn(), setCollapsed: jest.fn() };
        }
        return { isCollapsed: true, toggle: jest.fn(), setCollapsed: jest.fn() };
      }) as any);

    render(
      <form onSubmit={handleSubmit}>
        <CodeEditor
          code="print('test')"
          onChange={jest.fn()}
          problem={mockProblem}
          onLoadStarterCode={handleLoadStarterCode}
        />
        <button type="submit">Submit Form</button>
      </form>
    );

    fireEvent.click(screen.getByText('Restore Starter Code'));

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(handleLoadStarterCode).toHaveBeenCalledWith(mockProblem.starter_code);
  });

  it('allows form submission via explicit submit button', async () => {
    const handleSubmit = jest.fn((e) => e.preventDefault());

    render(
      <form onSubmit={handleSubmit}>
        <CodeEditor code="print('test')" onChange={jest.fn()} problem={mockProblem} />
        <button type="submit">Submit Form</button>
      </form>
    );

    fireEvent.click(screen.getByText('Submit Form'));
    expect(handleSubmit).toHaveBeenCalled();
  });

  it('verifies all activity bar buttons have type="button" attribute', () => {
    const { container } = render(
      <form>
        <CodeEditor code="print('test')" onChange={jest.fn()} problem={mockProblem} />
      </form>
    );

    const activityBar = container.querySelector('.bg-gray-800');
    expect(activityBar).toBeInTheDocument();

    const buttons = activityBar?.querySelectorAll('button');
    expect(buttons).toBeTruthy();
    expect(buttons!.length).toBeGreaterThan(0);

    buttons?.forEach((button) => {
      expect(button.getAttribute('type')).toBe('button');
    });
  });

  it('verifies Run button has type="button" attribute', () => {
    const { container } = render(
      <form>
        <CodeEditor code="print('test')" onChange={jest.fn()} onRun={jest.fn()} showRunButton={true} />
      </form>
    );

    const runButton = screen.getByText(/▶ Run Code/);
    expect(runButton.getAttribute('type')).toBe('button');
  });
});

// ===========================================================================
// Problem Description Markdown Rendering
// ===========================================================================

describe('CodeEditor - Problem Description Markdown Rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEditorInstance = null;
    localStorage.clear();
    setDesktopLayout();
    const actual = jest.requireActual('@/hooks/useResponsiveLayout');
    getLayoutMock().useSidebarSection.mockImplementation(actual.useSidebarSection);
  });

  it('renders markdown headers in problem description', async () => {
    const problem = {
      id: 'problem-1',
      author_id: 'instructor-1',
      title: 'Test Problem',
      description: '# Main Header\n\nSome content\n\n## Sub Header',
      starter_code: 'def solution():\n    pass',
      execution_settings: {},
      created_at: new Date(),
      updated_at: new Date(),
      language: 'python',
    };

    render(<CodeEditor code="" onChange={jest.fn()} problem={problem} onLoadStarterCode={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Main Header' })).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { level: 2, name: 'Sub Header' })).toBeInTheDocument();
  });

  it('renders markdown bold text in problem description', async () => {
    const problem = {
      id: 'problem-1',
      author_id: 'instructor-1',
      title: 'Test Problem',
      description: 'This is **bold** text.',
      starter_code: '',
      execution_settings: {},
      created_at: new Date(),
      updated_at: new Date(),
      language: 'python',
    };

    render(<CodeEditor code="" onChange={jest.fn()} problem={problem} onLoadStarterCode={jest.fn()} />);

    await waitFor(() => {
      const boldElement = screen.getByText('bold');
      expect(boldElement.tagName).toBe('STRONG');
    });
  });

  it('renders inline code in problem description', async () => {
    const problem = {
      id: 'problem-1',
      author_id: 'instructor-1',
      title: 'Test Problem',
      description: 'Call the `main()` function to start.',
      starter_code: '',
      execution_settings: {},
      created_at: new Date(),
      updated_at: new Date(),
      language: 'python',
    };

    render(<CodeEditor code="" onChange={jest.fn()} problem={problem} onLoadStarterCode={jest.fn()} />);

    await waitFor(() => {
      const codeElement = screen.getByText('main()');
      expect(codeElement.tagName).toBe('CODE');
    });
  });

  it('renders markdown lists in problem description', async () => {
    const problem = {
      id: 'problem-1',
      author_id: 'instructor-1',
      title: 'Test Problem',
      description: '## Requirements\n\n- First item\n- Second item\n- Third item',
      starter_code: '',
      execution_settings: {},
      created_at: new Date(),
      updated_at: new Date(),
      language: 'python',
    };

    render(<CodeEditor code="" onChange={jest.fn()} problem={problem} onLoadStarterCode={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Requirements' })).toBeInTheDocument();
    });
    expect(screen.getByText('First item')).toBeInTheDocument();
    expect(screen.getByText('Second item')).toBeInTheDocument();
    expect(screen.getByText('Third item')).toBeInTheDocument();
  });

  it('renders markdown links in problem description', async () => {
    const problem = {
      id: 'problem-1',
      author_id: 'instructor-1',
      title: 'Test Problem',
      description: 'See [Python docs](https://docs.python.org) for more info.',
      starter_code: '',
      execution_settings: {},
      created_at: new Date(),
      updated_at: new Date(),
      language: 'python',
    };

    render(<CodeEditor code="" onChange={jest.fn()} problem={problem} onLoadStarterCode={jest.fn()} />);

    await waitFor(() => {
      const link = screen.getByRole('link', { name: 'Python docs' });
      expect(link).toHaveAttribute('href', 'https://docs.python.org');
      expect(link).toHaveAttribute('target', '_blank');
    });
  });

  it('renders code blocks in problem description', async () => {
    const problem = {
      id: 'problem-1',
      author_id: 'instructor-1',
      title: 'Test Problem',
      description: 'Example:\n\n```python\nprint("hello")\n```',
      starter_code: '',
      execution_settings: {},
      created_at: new Date(),
      updated_at: new Date(),
      language: 'python',
    };

    render(<CodeEditor code="" onChange={jest.fn()} problem={problem} onLoadStarterCode={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('print("hello")')).toBeInTheDocument();
    });
  });
});

// ===========================================================================
// Mobile Markdown Rendering
// ===========================================================================

describe('CodeEditor - Mobile Markdown Rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEditorInstance = null;
    localStorage.clear();
    setMobileLayout();
    const actual = jest.requireActual('@/hooks/useResponsiveLayout');
    getLayoutMock().useSidebarSection.mockImplementation(actual.useSidebarSection);
  });

  it('renders markdown headers in mobile problem view', async () => {
    const problem = {
      id: 'problem-1',
      author_id: 'instructor-1',
      title: 'Test Problem',
      description: '# Main Header\n\nSome content\n\n## Sub Header',
      starter_code: '',
      execution_settings: {},
      created_at: new Date(),
      updated_at: new Date(),
      language: 'python',
    };

    render(
      <CodeEditor code="" onChange={jest.fn()} problem={problem} onLoadStarterCode={jest.fn()} />
    );

    const problemButton = screen.getByRole('button', { name: 'Toggle Problem' });
    await act(async () => { problemButton.click(); });

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Main Header' })).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { level: 2, name: 'Sub Header' })).toBeInTheDocument();
  });

  it('renders markdown bold text in mobile view', async () => {
    const problem = {
      id: 'problem-1',
      author_id: 'instructor-1',
      title: 'Test Problem',
      description: 'This is **bold** text.',
      starter_code: '',
      execution_settings: {},
      created_at: new Date(),
      updated_at: new Date(),
      language: 'python',
    };

    render(
      <CodeEditor code="" onChange={jest.fn()} problem={problem} onLoadStarterCode={jest.fn()} />
    );

    const problemButton = screen.getByRole('button', { name: 'Toggle Problem' });
    await act(async () => { problemButton.click(); });

    await waitFor(() => {
      const boldElement = screen.getByText('bold');
      expect(boldElement.tagName).toBe('STRONG');
    });
  });

  it('renders inline code in mobile view', async () => {
    const problem = {
      id: 'problem-1',
      author_id: 'instructor-1',
      title: 'Test Problem',
      description: 'Call the `main()` function to start.',
      starter_code: '',
      execution_settings: {},
      created_at: new Date(),
      updated_at: new Date(),
      language: 'python',
    };

    render(
      <CodeEditor code="" onChange={jest.fn()} problem={problem} onLoadStarterCode={jest.fn()} />
    );

    const problemButton = screen.getByRole('button', { name: 'Toggle Problem' });
    await act(async () => { problemButton.click(); });

    await waitFor(() => {
      const codeElement = screen.getByText('main()');
      expect(codeElement.tagName).toBe('CODE');
    });
  });

  it('renders markdown lists in mobile view', async () => {
    const problem = {
      id: 'problem-1',
      author_id: 'instructor-1',
      title: 'Test Problem',
      description: '## Requirements\n\n- First item\n- Second item',
      starter_code: '',
      execution_settings: {},
      created_at: new Date(),
      updated_at: new Date(),
      language: 'python',
    };

    render(
      <CodeEditor code="" onChange={jest.fn()} problem={problem} onLoadStarterCode={jest.fn()} />
    );

    const problemButton = screen.getByRole('button', { name: 'Toggle Problem' });
    await act(async () => { problemButton.click(); });

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Requirements' })).toBeInTheDocument();
    });
    expect(screen.getByText('First item')).toBeInTheDocument();
    expect(screen.getByText('Second item')).toBeInTheDocument();
  });
});

// ===========================================================================
// Problem Sidebar
// ===========================================================================

describe('CodeEditor - Problem Sidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEditorInstance = null;
    localStorage.clear();
    setDesktopLayout();
    const actual = jest.requireActual('@/hooks/useResponsiveLayout');
    getLayoutMock().useSidebarSection.mockImplementation(actual.useSidebarSection);
  });

  it('shows problem sidebar open by default when problem exists', async () => {
    const problem = {
      id: 'problem-1',
      author_id: 'instructor-1',
      title: 'Test Problem',
      description: 'This is a test problem description',
      starter_code: 'def solution():\n    pass',
      execution_settings: {},
      created_at: new Date(),
      updated_at: new Date(),
      language: 'python',
    };

    render(
      <CodeEditor code="" onChange={jest.fn()} problem={problem} onLoadStarterCode={jest.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('Test Problem')).toBeInTheDocument();
    });
    expect(screen.getByText('This is a test problem description')).toBeInTheDocument();
    expect(screen.getByText('Restore Starter Code')).toBeInTheDocument();
  });

  it('persists sidebar state in localStorage', async () => {
    const problem = {
      id: 'problem-1',
      author_id: 'instructor-1',
      title: 'Test Problem',
      description: 'Test description',
      starter_code: 'def solution():\n    pass',
      execution_settings: {},
      created_at: new Date(),
      updated_at: new Date(),
      language: 'python',
    };

    const { rerender } = render(
      <CodeEditor code="" onChange={jest.fn()} problem={problem} onLoadStarterCode={jest.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('Test Problem')).toBeInTheDocument();
    });

    const closeButton = screen.getByLabelText('Close panel');
    await act(async () => { closeButton.click(); });

    await waitFor(() => {
      expect(localStorage.getItem('sidebar-problem-panel-collapsed')).toBe('true');
    });

    expect(screen.queryByText('Test Problem')).not.toBeInTheDocument();

    rerender(
      <CodeEditor
        code="# test code"
        onChange={jest.fn()}
        problem={problem}
        onLoadStarterCode={jest.fn()}
      />
    );

    expect(screen.queryByText('Test Problem')).not.toBeInTheDocument();
  });

  it('shows execution settings collapsed by default when problem is present', async () => {
    const problem = {
      id: 'problem-1',
      author_id: 'instructor-1',
      title: 'Test Problem',
      description: 'Test description',
      starter_code: 'def solution():\n    pass',
      execution_settings: {},
      created_at: new Date(),
      updated_at: new Date(),
      language: 'python',
    };

    render(
      <CodeEditor
        code=""
        onChange={jest.fn()}
        problem={problem}
        onLoadStarterCode={jest.fn()}
        onRun={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Test Problem')).toBeInTheDocument();
    });
    expect(screen.queryByText('Execution Settings')).not.toBeInTheDocument();
  });
});

// ===========================================================================
// Empty States
// ===========================================================================

describe('CodeEditor - Empty States', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEditorInstance = null;
    setDesktopLayout();
    getLayoutMock().useSidebarSection.mockReturnValue({
      isCollapsed: true,
      toggle: jest.fn(),
      setCollapsed: jest.fn(),
    });
  });

  describe('Output panel empty states', () => {
    it('shows "waiting for problem" message when no problem is loaded', () => {
      render(<CodeEditor code="" onChange={jest.fn()} problem={null} />);
      expect(screen.getByText('Waiting for instructor to load a problem...')).toBeInTheDocument();
      expect(screen.getByText('You can start writing code while you wait.')).toBeInTheDocument();
    });

    it('shows "no output yet" message when problem is loaded but no result', () => {
      render(
        <CodeEditor
          code=""
          onChange={jest.fn()}
          problem={{ title: 'Test Problem', description: 'A test problem', starter_code: null, language: 'python' }}
        />
      );
      expect(screen.getByText('No output yet.')).toBeInTheDocument();
      expect(screen.getByText('Click "Run Code" to execute your program and see the results here.')).toBeInTheDocument();
    });

    it('does not show empty state when execution result is present', () => {
      render(
        <CodeEditor
          code="print('Hello, World!')"
          onChange={jest.fn()}
          problem={{ title: 'Test Problem', description: null, starter_code: null, language: 'python' }}
          execution_result={{ results: [{ name: 'run', type: 'io', status: 'run', input: '', actual: 'Hello, World!', time_ms: 10 }], summary: { total: 1, passed: 0, failed: 0, errors: 0, run: 1, time_ms: 10 } }}
        />
      );

      expect(screen.queryByText('Waiting for instructor to load a problem...')).not.toBeInTheDocument();
      expect(screen.queryByText('No output yet.')).not.toBeInTheDocument();
      expect(screen.getByText('Hello, World!')).toBeInTheDocument();
    });

    it('shows empty state with undefined problem', () => {
      render(<CodeEditor code="" onChange={jest.fn()} problem={undefined} />);
      expect(screen.getByText('Waiting for instructor to load a problem...')).toBeInTheDocument();
    });
  });

  describe('Problem panel empty states', () => {
    it('does not show problem button in activity bar when no problem', () => {
      render(<CodeEditor code="" onChange={jest.fn()} problem={null} />);
      expect(screen.queryByRole('button', { name: 'Problem' })).not.toBeInTheDocument();
    });

    it('shows problem button in activity bar when problem is loaded', () => {
      render(
        <CodeEditor
          code=""
          onChange={jest.fn()}
          problem={{ title: 'Test Problem', description: 'Description here', starter_code: null, language: 'python' }}
        />
      );
      expect(screen.getByRole('button', { name: 'Problem' })).toBeInTheDocument();
    });
  });
});

// ===========================================================================
// Undo/Redo Functionality
// ===========================================================================

describe('CodeEditor - Undo/Redo Functionality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEditorInstance = null;
    setDesktopLayout();
    getLayoutMock().useSidebarSection.mockReturnValue({
      isCollapsed: true,
      toggle: jest.fn(),
      setCollapsed: jest.fn(),
    });
  });

  it('renders undo and redo buttons when not read-only', () => {
    render(<CodeEditor code="print('hello')" onChange={jest.fn()} readOnly={false} />);
    expect(screen.getByLabelText('Undo')).toBeInTheDocument();
    expect(screen.getByLabelText('Redo')).toBeInTheDocument();
  });

  it('does not render undo/redo buttons when read-only', () => {
    render(<CodeEditor code="print('hello')" onChange={jest.fn()} readOnly={true} />);
    expect(screen.queryByLabelText('Undo')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Redo')).not.toBeInTheDocument();
  });

  it('calls editor.trigger with undo command when undo button is clicked', async () => {
    render(<CodeEditor code="print('hello')" onChange={jest.fn()} readOnly={false} />);

    await waitFor(() => { expect(mockEditorInstance).not.toBeNull(); });

    fireEvent.click(screen.getByLabelText('Undo'));
    expect(mockEditorInstance.trigger).toHaveBeenCalledWith('keyboard', 'undo', null);
  });

  it('calls editor.trigger with redo command when redo button is clicked', async () => {
    render(<CodeEditor code="print('hello')" onChange={jest.fn()} readOnly={false} />);

    await waitFor(() => { expect(mockEditorInstance).not.toBeNull(); });

    fireEvent.click(screen.getByLabelText('Redo'));
    expect(mockEditorInstance.trigger).toHaveBeenCalledWith('keyboard', 'redo', null);
  });

  it('has proper tooltip text for keyboard shortcuts', () => {
    render(<CodeEditor code="print('hello')" onChange={jest.fn()} readOnly={false} />);
    expect(screen.getByLabelText('Undo')).toHaveAttribute('title', 'Undo (Ctrl+Z)');
    expect(screen.getByLabelText('Redo')).toHaveAttribute('title', 'Redo (Ctrl+Y)');
  });

  it('does not render undo/redo buttons when debugger is active (read-only)', () => {
    const debugger_ = {
      ...baseDebugger,
      hasTrace: true,
      trace: { steps: [], total_steps: 0, exit_code: 0 },
    };

    render(<CodeEditor code="print('hello')" onChange={jest.fn()} debugger={debugger_} />);

    expect(screen.queryByLabelText('Undo')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Redo')).not.toBeInTheDocument();
  });

  it('handles clicking undo button before editor is mounted without crashing', () => {
    jest.spyOn(React, 'useEffect').mockImplementation(() => {});

    render(<CodeEditor code="print('hello')" onChange={jest.fn()} readOnly={false} />);

    const undoButton = screen.getByLabelText('Undo');
    expect(() => fireEvent.click(undoButton)).not.toThrow();

    jest.restoreAllMocks();
  });

  it('renders Lucide Undo2 and Redo2 icons inside the buttons', () => {
    render(<CodeEditor code="print('hello')" onChange={jest.fn()} readOnly={false} />);
    expect(screen.getByTestId('undo-icon')).toBeInTheDocument();
    expect(screen.getByTestId('redo-icon')).toBeInTheDocument();
  });

  it('renders undo/redo buttons in the header alongside run button', () => {
    render(
      <CodeEditor code="print('hello')" onChange={jest.fn()} onRun={jest.fn()} readOnly={false} />
    );

    const undoButton = screen.getByLabelText('Undo');
    const redoButton = screen.getByLabelText('Redo');
    const runButton = screen.getByText('▶ Run Code');

    const header = undoButton.parentElement;
    expect(header).toContainElement(redoButton);
    expect(header).toContainElement(runButton);
  });
});

// ===========================================================================
// Output Collapsible
// ===========================================================================

describe('CodeEditor - outputCollapsible prop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEditorInstance = null;
    setDesktopLayout();
    getLayoutMock().useSidebarSection.mockReturnValue({
      isCollapsed: true,
      toggle: jest.fn(),
      setCollapsed: jest.fn(),
    });
  });

  it('shows toggle button when outputCollapsible=true, outputPosition="right", and desktop', () => {
    const { queryByTestId } = render(
      <CodeEditor
        code="print('hello')"
        onChange={jest.fn()}
        outputCollapsible={true}
        outputPosition="right"
        forceDesktop={true}
      />
    );
    expect(queryByTestId('output-collapse-toggle')).toBeInTheDocument();
  });

  it('does NOT show toggle button when outputCollapsible is false (default)', () => {
    const { queryByTestId } = render(
      <CodeEditor
        code="print('hello')"
        onChange={jest.fn()}
        outputPosition="right"
        forceDesktop={true}
      />
    );
    expect(queryByTestId('output-collapse-toggle')).not.toBeInTheDocument();
  });

  it('does NOT show toggle button when outputPosition is "bottom"', () => {
    const { queryByTestId } = render(
      <CodeEditor
        code="print('hello')"
        onChange={jest.fn()}
        outputCollapsible={true}
        outputPosition="bottom"
        forceDesktop={true}
      />
    );
    expect(queryByTestId('output-collapse-toggle')).not.toBeInTheDocument();
  });

  it('collapses output panel when toggle is clicked', () => {
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
    expect(toggle).toHaveAttribute('aria-label', 'Collapse output panel');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-label', 'Expand output panel');

    const style = getByTestId('output-area').getAttribute('style') || '';
    expect(style).toContain('width: 0');
  });

  it('expands output panel when toggle is clicked again', () => {
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
    fireEvent.click(toggle); // collapse
    expect(toggle).toHaveAttribute('aria-label', 'Expand output panel');

    fireEvent.click(toggle); // expand
    expect(toggle).toHaveAttribute('aria-label', 'Collapse output panel');

    const style = getByTestId('output-area').getAttribute('style') || '';
    expect(style).not.toContain('width: 0');
    expect(style).toContain('width');
  });
});

// ===========================================================================
// Error Line Highlighting
// ===========================================================================

describe('CodeEditor - Error Line Highlighting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEditorInstance = null;
    setDesktopLayout();
    getLayoutMock().useSidebarSection.mockReturnValue({
      isCollapsed: true,
      toggle: jest.fn(),
      setCollapsed: jest.fn(),
    });
  });

  it('applies error-line-highlight decoration when execution result has error', () => {
    render(
      <CodeEditor
        code={'x = 1\ny = x + undefined_var\nprint(y)'}
        onChange={jest.fn()}
        execution_result={{
          results: [{ name: 'run', type: 'io', status: 'error', input: '', stderr: 'Traceback (most recent call last):\n  File "<student code>", line 2, in <module>\nNameError: name \'undefined_var\' is not defined', time_ms: 50 }],
          summary: { total: 1, passed: 0, failed: 0, errors: 1, run: 0, time_ms: 50 },
        }}
      />
    );

    expect(mockEditorInstance.deltaDecorations).toHaveBeenCalled();
    const allCalls = mockEditorInstance.deltaDecorations.mock.calls;
    const lastCall = allCalls[allCalls.length - 1];
    const decorations = lastCall[1];

    expect(decorations).toHaveLength(1);
    expect(decorations[0]).toMatchObject({
      range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 },
      options: {
        isWholeLine: true,
        className: 'error-line-highlight',
        glyphMarginClassName: 'error-line-glyph',
      },
    });
  });

  it('applies error highlight on last line of multi-frame traceback', () => {
    const multiFrameError = [
      'Traceback (most recent call last):',
      '  File "<student code>", line 10, in <module>',
      '    foo()',
      '  File "<student code>", line 3, in foo',
      '    raise ValueError("bad")',
      'ValueError: bad',
    ].join('\n');

    render(
      <CodeEditor
        code={'def foo():\n    raise ValueError("bad")\n\nfoo()'}
        onChange={jest.fn()}
        execution_result={{
          results: [{ name: 'run', type: 'io', status: 'error', input: '', stderr: multiFrameError, time_ms: 50 }],
          summary: { total: 1, passed: 0, failed: 0, errors: 1, run: 0, time_ms: 50 },
        }}
      />
    );

    expect(mockEditorInstance.deltaDecorations).toHaveBeenCalled();
    const allCalls = mockEditorInstance.deltaDecorations.mock.calls;
    const lastCall = allCalls[allCalls.length - 1];
    const decorations = lastCall[1];

    expect(decorations).toHaveLength(1);
    expect(decorations[0].range.startLineNumber).toBe(3);
  });

  it('clears error decorations when execution result becomes null', () => {
    const errorResult = {
      results: [{ name: 'run', type: 'io', status: 'error', input: '', stderr: 'File "<student code>", line 3\nNameError: name "x" is not defined', time_ms: 50 }],
      summary: { total: 1, passed: 0, failed: 0, errors: 1, run: 0, time_ms: 50 },
    };
    const { rerender } = render(
      <CodeEditor
        code={'print("hello")'}
        onChange={jest.fn()}
        execution_result={errorResult}
      />
    );

    // First verify the error decoration was applied
    const callsAfterError = mockEditorInstance.deltaDecorations.mock.calls.length;
    expect(callsAfterError).toBeGreaterThan(0);

    // Now clear the execution result
    rerender(
      <CodeEditor
        code={'print("hello")'}
        onChange={jest.fn()}
        execution_result={null}
      />
    );

    // After clearing, there should be an additional call that cleared decorations
    const allCalls = mockEditorInstance.deltaDecorations.mock.calls;
    expect(allCalls.length).toBeGreaterThan(callsAfterError);
    const lastCall = allCalls[allCalls.length - 1];
    expect(lastCall[1]).toHaveLength(0);
  });

  it('clears error decorations when execution result becomes successful', () => {
    const errorResult = {
      results: [{ name: 'run', type: 'io', status: 'error', input: '', stderr: 'File "<student code>", line 2\nNameError: name "x" is not defined', time_ms: 50 }],
      summary: { total: 1, passed: 0, failed: 0, errors: 1, run: 0, time_ms: 50 },
    };
    const { rerender } = render(
      <CodeEditor
        code={'print("hello")'}
        onChange={jest.fn()}
        execution_result={errorResult}
      />
    );

    const callsAfterError = mockEditorInstance.deltaDecorations.mock.calls.length;
    expect(callsAfterError).toBeGreaterThan(0);

    rerender(
      <CodeEditor
        code={'print("hello")'}
        onChange={jest.fn()}
        execution_result={{
          results: [{ name: 'run', type: 'io', status: 'run', input: '', actual: 'hello\n', time_ms: 50 }],
          summary: { total: 1, passed: 0, failed: 0, errors: 0, run: 1, time_ms: 50 },
        }}
      />
    );

    const allCalls = mockEditorInstance.deltaDecorations.mock.calls;
    expect(allCalls.length).toBeGreaterThan(callsAfterError);
    const lastCall = allCalls[allCalls.length - 1];
    expect(lastCall[1]).toHaveLength(0);
  });

  it('does not apply error decorations when error text has no parseable line number', () => {
    render(
      <CodeEditor
        code={'print("hello")'}
        onChange={jest.fn()}
        execution_result={{
          results: [{ name: 'run', type: 'io', status: 'error', input: '', stderr: 'Killed: execution timeout', time_ms: 10000 }],
          summary: { total: 1, passed: 0, failed: 0, errors: 1, run: 0, time_ms: 10000 },
        }}
      />
    );

    // deltaDecorations should NOT be called (no decorations to add or remove)
    const allCalls = mockEditorInstance.deltaDecorations.mock.calls;
    const errorHighlightCalls = allCalls.filter((call: any[]) =>
      call[1].some((dec: any) => dec?.options?.className === 'error-line-highlight')
    );
    expect(errorHighlightCalls).toHaveLength(0);
  });

  it('clears error decorations when debugger activates', () => {
    const activeDebugger = makeActiveDebugger();
    const errResult = {
      results: [{ name: 'run', type: 'io', status: 'error', input: '', stderr: 'File "<student code>", line 1\nNameError: ...', time_ms: 50 }],
      summary: { total: 1, passed: 0, failed: 0, errors: 1, run: 0, time_ms: 50 },
    };
    const { rerender } = render(
      <CodeEditor
        code={'x = undefined_var'}
        onChange={jest.fn()}
        execution_result={errResult}
      />
    );

    // Now activate debugger — error decorations should be cleared
    rerender(
      <CodeEditor
        code={'x = undefined_var'}
        onChange={jest.fn()}
        execution_result={errResult}
        debugger={activeDebugger}
      />
    );

    const allCalls = mockEditorInstance.deltaDecorations.mock.calls;
    // After debugger activates, there should be at least one call that cleared decorations
    // (empty decoration array), meaning the error decorations were cleared
    const hasEmptyDecCall = allCalls.some((call: any[]) => call[1].length === 0);
    expect(hasEmptyDecCall).toBe(true);
  });
});

// ===========================================================================
// Font Size Scaling (prose/title classes)
// ===========================================================================

describe('CodeEditor - Font Size Scaling', () => {
  const problem = {
    id: 'problem-1',
    author_id: 'instructor-1',
    title: 'Test Problem',
    description: 'A test problem description.',
    starter_code: '',
    execution_settings: {},
    created_at: new Date(),
    updated_at: new Date(),
    language: 'python',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockEditorInstance = null;
    localStorage.clear();
    setDesktopLayout();
    const actual = jest.requireActual('@/hooks/useResponsiveLayout');
    getLayoutMock().useSidebarSection.mockImplementation(actual.useSidebarSection);
  });

  describe('Desktop problem panel title', () => {
    it('uses text-xl for title when fontSize is below 20', async () => {
      const { container } = render(
        <CodeEditor code="" onChange={jest.fn()} problem={problem} fontSize={14} />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Problem')).toBeInTheDocument();
      });

      const titleEl = screen.getByText('Test Problem');
      expect(titleEl.className).toContain('text-xl');
      expect(titleEl.className).not.toContain('text-3xl');
    });

    it('uses text-3xl for title when fontSize is 20 or above', async () => {
      render(
        <CodeEditor code="" onChange={jest.fn()} problem={problem} fontSize={24} />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Problem')).toBeInTheDocument();
      });

      const titleEl = screen.getByText('Test Problem');
      expect(titleEl.className).toContain('text-3xl');
      expect(titleEl.className).not.toContain('text-xl');
    });

    it('applies inline fontSize to title proportional to fontSize prop', async () => {
      render(
        <CodeEditor code="" onChange={jest.fn()} problem={problem} fontSize={30} />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Problem')).toBeInTheDocument();
      });

      const titleEl = screen.getByText('Test Problem');
      // titleFontSize = Math.round(30 * 1.3) = 39
      expect(titleEl.style.fontSize).toBe('39px');
    });

    it('applies inline fontSize to description proportional to fontSize prop', async () => {
      const { container } = render(
        <CodeEditor code="" onChange={jest.fn()} problem={problem} fontSize={30} />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Problem')).toBeInTheDocument();
      });

      const proseContainer = container.querySelector('.prose');
      expect(proseContainer).not.toBeNull();
      // descFontSize = Math.round(30 * 0.85) = 26
      expect((proseContainer as HTMLElement).style.fontSize).toBe('26px');
    });

    it('uses prose-sm for description when fontSize is below 20', async () => {
      const { container } = render(
        <CodeEditor code="" onChange={jest.fn()} problem={problem} fontSize={14} />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Problem')).toBeInTheDocument();
      });

      // The prose container wraps the description
      const proseContainer = container.querySelector('.prose');
      expect(proseContainer).not.toBeNull();
      expect(proseContainer!.className).toContain('prose-sm');
      expect(proseContainer!.className).not.toContain('prose-lg');
    });

    it('uses prose-lg for description when fontSize is 20 or above', async () => {
      const { container } = render(
        <CodeEditor code="" onChange={jest.fn()} problem={problem} fontSize={24} />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Problem')).toBeInTheDocument();
      });

      // The prose container wraps the description
      const proseContainer = container.querySelector('.prose');
      expect(proseContainer).not.toBeNull();
      expect(proseContainer!.className).toContain('prose-lg');
      expect(proseContainer!.className).not.toContain('prose-sm');
    });

    it('uses text-xl and prose-sm when fontSize is not provided', async () => {
      const { container } = render(
        <CodeEditor code="" onChange={jest.fn()} problem={problem} />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Problem')).toBeInTheDocument();
      });

      const titleEl = screen.getByText('Test Problem');
      expect(titleEl.className).toContain('text-xl');
      expect(titleEl.className).not.toContain('text-3xl');
      // No inline fontSize when prop is not provided
      expect(titleEl.style.fontSize).toBe('');

      const proseContainer = container.querySelector('.prose');
      expect(proseContainer).not.toBeNull();
      expect(proseContainer!.className).toContain('prose-sm');
      expect(proseContainer!.className).not.toContain('prose-lg');
      expect((proseContainer as HTMLElement).style.fontSize).toBe('');
    });
  });

  describe('Output panel scaling', () => {
    it('applies inline fontSize to output container when fontSize is set', async () => {
      render(
        <CodeEditor code="" onChange={jest.fn()} problem={problem} fontSize={30} />
      );

      await waitFor(() => {
        // The placeholder text should be visible
        expect(screen.getByText(/No output yet/)).toBeInTheDocument();
      });

      const placeholderEl = screen.getByText(/No output yet/);
      const outputContainer = placeholderEl.closest('[style]');
      expect(outputContainer).not.toBeNull();
      // outputFontSize = Math.round(30 * 0.85) = 26
      expect((outputContainer as HTMLElement).style.fontSize).toBe('26px');
    });

    it('does not apply inline fontSize to output when fontSize is not set', async () => {
      render(
        <CodeEditor code="" onChange={jest.fn()} problem={problem} />
      );

      await waitFor(() => {
        expect(screen.getByText(/No output yet/)).toBeInTheDocument();
      });

      const placeholderEl = screen.getByText(/No output yet/);
      // No inline fontSize should be set on any parent
      const parentWithStyle = placeholderEl.closest('[style]');
      if (parentWithStyle) {
        expect((parentWithStyle as HTMLElement).style.fontSize).toBe('');
      }
    });
  });

  describe('Mobile problem panel title', () => {
    beforeEach(() => {
      setMobileLayout();
    });

    it('uses text-xl for title in mobile view when fontSize is below 20', async () => {
      render(
        <CodeEditor code="" onChange={jest.fn()} problem={problem} fontSize={14} />
      );

      const problemButton = screen.getByRole('button', { name: 'Toggle Problem' });
      await act(async () => { problemButton.click(); });

      await waitFor(() => {
        expect(screen.getByText('Test Problem')).toBeInTheDocument();
      });

      const titleEl = screen.getByText('Test Problem');
      expect(titleEl.className).toContain('text-xl');
      expect(titleEl.className).not.toContain('text-3xl');
    });

    it('uses text-3xl for title in mobile view when fontSize is 20 or above', async () => {
      render(
        <CodeEditor code="" onChange={jest.fn()} problem={problem} fontSize={24} />
      );

      const problemButton = screen.getByRole('button', { name: 'Toggle Problem' });
      await act(async () => { problemButton.click(); });

      await waitFor(() => {
        expect(screen.getByText('Test Problem')).toBeInTheDocument();
      });

      const titleEl = screen.getByText('Test Problem');
      expect(titleEl.className).toContain('text-3xl');
      expect(titleEl.className).not.toContain('text-xl');
    });

    it('uses prose-sm in mobile view when fontSize is below 20', async () => {
      const { container } = render(
        <CodeEditor code="" onChange={jest.fn()} problem={problem} fontSize={14} />
      );

      const problemButton = screen.getByRole('button', { name: 'Toggle Problem' });
      await act(async () => { problemButton.click(); });

      await waitFor(() => {
        expect(screen.getByText('Test Problem')).toBeInTheDocument();
      });

      const proseContainer = container.querySelector('.prose');
      expect(proseContainer).not.toBeNull();
      expect(proseContainer!.className).toContain('prose-sm');
      expect(proseContainer!.className).not.toContain('prose-lg');
    });

    it('uses prose-lg in mobile view when fontSize is 20 or above', async () => {
      const { container } = render(
        <CodeEditor code="" onChange={jest.fn()} problem={problem} fontSize={24} />
      );

      const problemButton = screen.getByRole('button', { name: 'Toggle Problem' });
      await act(async () => { problemButton.click(); });

      await waitFor(() => {
        expect(screen.getByText('Test Problem')).toBeInTheDocument();
      });

      const proseContainer = container.querySelector('.prose');
      expect(proseContainer).not.toBeNull();
      expect(proseContainer!.className).toContain('prose-lg');
      expect(proseContainer!.className).not.toContain('prose-sm');
    });
  });
});

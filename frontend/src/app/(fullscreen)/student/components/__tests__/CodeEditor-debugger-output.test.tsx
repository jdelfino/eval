import React from 'react';
import { render, screen } from '@testing-library/react';
import CodeEditor from '../CodeEditor';

// Mock dependencies
jest.mock('@monaco-editor/react', () => {
  return function MockedEditor() {
    return <div data-testid="monaco-editor">Mocked Editor</div>;
  };
});

jest.mock('@/hooks/useResponsiveLayout', () => ({
  useResponsiveLayout: () => true,
  useSidebarSection: () => ({
    isCollapsed: true,
    toggle: jest.fn(),
    setCollapsed: jest.fn()
  }),
  useMobileViewport: () => ({
    isMobile: false,
    isTablet: false,
    isVerySmall: false,
    isDesktop: true,
    width: 1200,
  }),
}));

describe('CodeEditor - Debugger Output Display', () => {
  const mockOnChange = jest.fn();
  const mockOnRun = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when debugger has trace with stdout', () => {
    it('displays stdout with step annotations in the output panel', () => {
      const mockDebugger = {
        trace: {
          steps: [
            {
              line: 1,
              event: 'line',
              locals: {},
              globals: {},
              callStack: [],
              stdout: ''
            },
            {
              line: 2,
              event: 'line',
              locals: { x: 5 },
              globals: {},
              callStack: [],
              stdout: 'Hello, World!\n'
            },
            {
              line: 3,
              event: 'line',
              locals: { x: 5, y: 10 },
              globals: {},
              callStack: [],
              stdout: 'Hello, World!\nValue: 15\n'
            }
          ],
          totalSteps: 3,
          exitCode: 0,
          truncated: false
        },
        currentStep: 2,
        isLoading: false,
        error: null,
        hasTrace: true,
        totalSteps: 3,
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
          callStack: [],
          stdout: 'Hello, World!\nValue: 15\n'
        })),
        getCurrentLocals: jest.fn(() => ({ x: 5, y: 10 })),
        getCurrentGlobals: jest.fn(() => ({})),
        getCurrentCallStack: jest.fn(() => []),
        getPreviousStep: jest.fn(() => ({
          line: 2,
          event: 'line',
          locals: { x: 5 },
          globals: {},
          callStack: [],
          stdout: 'Hello, World!\n'
        }))
      };

      render(
        <CodeEditor
          code="x = 5\nprint('Hello, World!')\ny = 10\nprint(f'Value: {x + y}')"
          onChange={mockOnChange}
          debugger={mockDebugger}
        />
      );

      // Should show debugger output header
      expect(screen.getByText('🐛 Debugger Output')).toBeInTheDocument();

      // Should show step information
      expect(screen.getByText('Step 3 of 3')).toBeInTheDocument();

      // Should show the stdout content with step annotations
      expect(screen.getByText('Console Output (up to current step):')).toBeInTheDocument();
      expect(screen.getByText('[Step 2]')).toBeInTheDocument();
      expect(screen.getByText('[Step 3]')).toBeInTheDocument();
      expect(screen.getByText('Hello, World!')).toBeInTheDocument();
      expect(screen.getByText('Value: 15')).toBeInTheDocument();
    });

    it('shows "no output yet" when stdout is empty', () => {
      const mockDebugger = {
        trace: {
          steps: [
            {
              line: 1,
              event: 'line',
              locals: {},
              globals: {},
              callStack: [],
              stdout: ''
            }
          ],
          totalSteps: 1,
          exitCode: 0,
          truncated: false
        },
        currentStep: 0,
        isLoading: false,
        error: null,
        hasTrace: true,
        totalSteps: 1,
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
          callStack: [],
          stdout: ''
        })),
        getCurrentLocals: jest.fn(() => ({})),
        getCurrentGlobals: jest.fn(() => ({})),
        getCurrentCallStack: jest.fn(() => []),
        getPreviousStep: jest.fn(() => null)
      };

      render(
        <CodeEditor
          code="x = 5"
          onChange={mockOnChange}
          debugger={mockDebugger}
        />
      );

      expect(screen.getByText('No console output yet')).toBeInTheDocument();
    });

    it('displays error messages when debugger has errors', () => {
      const mockDebugger = {
        trace: {
          steps: [],
          totalSteps: 0,
          exitCode: 1,
          truncated: false
        },
        currentStep: 0,
        isLoading: false,
        error: 'NameError: name "undefined_var" is not defined',
        hasTrace: true,
        totalSteps: 0,
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
        getPreviousStep: jest.fn(() => null)
      };

      render(
        <CodeEditor
          code="print(undefined_var)"
          onChange={mockOnChange}
          debugger={mockDebugger}
        />
      );

      expect(screen.getByText('Error:')).toBeInTheDocument();
      expect(screen.getByText(/NameError/)).toBeInTheDocument();
    });

    it('shows stdout incrementally as user steps through code', () => {
      const mockDebugger = {
        trace: {
          steps: [
            {
              line: 1,
              event: 'line',
              locals: {},
              globals: {},
              callStack: [],
              stdout: ''
            },
            {
              line: 2,
              event: 'line',
              locals: {},
              globals: {},
              callStack: [],
              stdout: 'First line\n'
            },
            {
              line: 3,
              event: 'line',
              locals: {},
              globals: {},
              callStack: [],
              stdout: 'First line\nSecond line\n'
            }
          ],
          totalSteps: 3,
          exitCode: 0,
          truncated: false
        },
        currentStep: 1,
        isLoading: false,
        error: null,
        hasTrace: true,
        totalSteps: 3,
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
          callStack: [],
          stdout: 'First line\n'
        })),
        getCurrentLocals: jest.fn(() => ({})),
        getCurrentGlobals: jest.fn(() => ({})),
        getCurrentCallStack: jest.fn(() => []),
        getPreviousStep: jest.fn(() => ({
          line: 1,
          event: 'line',
          locals: {},
          globals: {},
          callStack: [],
          stdout: ''
        }))
      };

      render(
        <CodeEditor
          code="print('First line')\nprint('Second line')"
          onChange={mockOnChange}
          debugger={mockDebugger}
        />
      );

      // At step 2, should only show first line with step annotation
      expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
      expect(screen.getByText('[Step 2]')).toBeInTheDocument();
      expect(screen.getByText('First line')).toBeInTheDocument();
      // Should NOT show second line yet (that's in step 3)
      expect(screen.queryByText('Second line')).not.toBeInTheDocument();
    });
  });

  describe('when debugger is not active', () => {
    it('shows normal execution result output', () => {
      render(
        <CodeEditor
          code="print('Hello')"
          onChange={mockOnChange}
          executionResult={{
            success: true,
            output: 'Hello\n',
            error: '',
            executionTime: 100
          }}
        />
      );

      expect(screen.getByText('✓ Success')).toBeInTheDocument();
      expect(screen.getByText(/Hello/)).toBeInTheDocument();
    });

    it('shows appropriate message when no output exists and no problem loaded', () => {
      render(
        <CodeEditor
          code="# Empty code"
          onChange={mockOnChange}
        />
      );

      // When no problem is loaded, show "waiting for instructor" message
      expect(screen.getByText('Waiting for instructor to load a problem...')).toBeInTheDocument();
      expect(screen.getByText('You can start writing code while you wait.')).toBeInTheDocument();
    });

    it('shows appropriate message when no output exists but problem is loaded', () => {
      render(
        <CodeEditor
          code="# Empty code"
          onChange={mockOnChange}
          problem={{ title: 'Test Problem' }}
        />
      );

      // When problem is loaded, show "run code" message
      expect(screen.getByText('No output yet.')).toBeInTheDocument();
      expect(screen.getByText('Click "Run Code" to execute your program and see the results here.')).toBeInTheDocument();
    });
  });
});

/**
 * @jest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { useDebugger } from '../useDebugger';
import { ExecutionTrace } from '@/server/types';

describe('useDebugger', () => {
  let sendMessage: jest.Mock;

  beforeEach(() => {
    sendMessage = jest.fn();
  });

  const mockTrace: ExecutionTrace = {
    steps: [
      {
        line: 1,
        event: 'line',
        locals: {},
        globals: {},
        callStack: [{ functionName: '<module>', filename: '<string>', line: 1 }],
        stdout: ''
      },
      {
        line: 2,
        event: 'line',
        locals: { x: 5 },
        globals: {},
        callStack: [{ functionName: '<module>', filename: '<string>', line: 2 }],
        stdout: ''
      },
      {
        line: 3,
        event: 'line',
        locals: { x: 5, y: 10 },
        globals: {},
        callStack: [{ functionName: '<module>', filename: '<string>', line: 3 }],
        stdout: ''
      }
    ],
    totalSteps: 3,
    exitCode: 0,
    truncated: false
  };

  it('initializes with empty state', () => {
    const { result } = renderHook(() => useDebugger(sendMessage));

    expect(result.current.trace).toBeNull();
    expect(result.current.currentStep).toBe(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('requests trace with correct payload', () => {
    const { result } = renderHook(() => useDebugger(sendMessage));

    act(() => {
      result.current.requestTrace('print("hello")', 'input', 1000);
    });

    expect(sendMessage).toHaveBeenCalledWith('TRACE_REQUEST', {
      code: 'print("hello")',
      stdin: 'input',
      maxSteps: 1000
    });
    expect(result.current.isLoading).toBe(true);
  });

  it('sets trace and resets step to 0', () => {
    const { result } = renderHook(() => useDebugger(sendMessage));

    act(() => {
      result.current.setTrace(mockTrace);
    });

    expect(result.current.trace).toEqual(mockTrace);
    expect(result.current.currentStep).toBe(0);
    expect(result.current.isLoading).toBe(false);
  });

  it('steps forward correctly', () => {
    const { result } = renderHook(() => useDebugger(sendMessage));

    act(() => {
      result.current.setTrace(mockTrace);
    });

    act(() => {
      result.current.stepForward();
    });

    expect(result.current.currentStep).toBe(1);

    act(() => {
      result.current.stepForward();
    });

    expect(result.current.currentStep).toBe(2);

    // Should not go beyond last step
    act(() => {
      result.current.stepForward();
    });

    expect(result.current.currentStep).toBe(2);
  });

  it('steps backward correctly', () => {
    const { result } = renderHook(() => useDebugger(sendMessage));

    act(() => {
      result.current.setTrace(mockTrace);
      result.current.jumpToStep(2);
    });

    act(() => {
      result.current.stepBackward();
    });

    expect(result.current.currentStep).toBe(1);

    act(() => {
      result.current.stepBackward();
    });

    expect(result.current.currentStep).toBe(0);

    // Should not go below 0
    act(() => {
      result.current.stepBackward();
    });

    expect(result.current.currentStep).toBe(0);
  });

  it('jumps to specific step', () => {
    const { result } = renderHook(() => useDebugger(sendMessage));

    act(() => {
      result.current.setTrace(mockTrace);
    });

    act(() => {
      result.current.jumpToStep(2);
    });

    expect(result.current.currentStep).toBe(2);

    act(() => {
      result.current.jumpToStep(0);
    });

    expect(result.current.currentStep).toBe(0);
  });

  it('jumps to first and last steps', () => {
    const { result } = renderHook(() => useDebugger(sendMessage));

    act(() => {
      result.current.setTrace(mockTrace);
      result.current.jumpToStep(1);
    });

    act(() => {
      result.current.jumpToLast();
    });

    expect(result.current.currentStep).toBe(2);

    act(() => {
      result.current.jumpToFirst();
    });

    expect(result.current.currentStep).toBe(0);
  });

  it('resets state correctly', () => {
    const { result } = renderHook(() => useDebugger(sendMessage));

    act(() => {
      result.current.setTrace(mockTrace);
      result.current.stepForward();
    });

    expect(result.current.currentStep).toBe(1);

    act(() => {
      result.current.reset();
    });

    expect(result.current.trace).toBeNull();
    expect(result.current.currentStep).toBe(0);
  });

  it('gets current step data', () => {
    const { result } = renderHook(() => useDebugger(sendMessage));

    act(() => {
      result.current.setTrace(mockTrace);
      result.current.jumpToStep(1);
    });

    const currentStep = result.current.getCurrentStep();
    expect(currentStep?.line).toBe(2);
    expect(currentStep?.locals).toEqual({ x: 5 });
  });

  it('gets current locals and globals', () => {
    const { result } = renderHook(() => useDebugger(sendMessage));

    act(() => {
      result.current.setTrace(mockTrace);
      result.current.jumpToStep(2);
    });

    expect(result.current.getCurrentLocals()).toEqual({ x: 5, y: 10 });
    expect(result.current.getCurrentGlobals()).toEqual({});
  });

  it('gets current call stack', () => {
    const { result } = renderHook(() => useDebugger(sendMessage));

    act(() => {
      result.current.setTrace(mockTrace);
    });

    const callStack = result.current.getCurrentCallStack();
    expect(callStack).toHaveLength(1);
    expect(callStack[0].functionName).toBe('<module>');
  });

  it('provides correct navigation flags', () => {
    const { result } = renderHook(() => useDebugger(sendMessage));

    // No trace
    expect(result.current.canStepForward).toBe(false);
    expect(result.current.canStepBackward).toBe(false);

    act(() => {
      result.current.setTrace(mockTrace);
    });

    // At first step
    expect(result.current.canStepForward).toBe(true);
    expect(result.current.canStepBackward).toBe(false);

    act(() => {
      result.current.jumpToStep(1);
    });

    // In middle
    expect(result.current.canStepForward).toBe(true);
    expect(result.current.canStepBackward).toBe(true);

    act(() => {
      result.current.jumpToLast();
    });

    // At last step
    expect(result.current.canStepForward).toBe(false);
    expect(result.current.canStepBackward).toBe(true);
  });

  describe('keyboard shortcuts', () => {
    it('responds to arrow keys and n/p shortcuts', () => {
      const { result } = renderHook(() => useDebugger(sendMessage));

      act(() => {
        result.current.setTrace(mockTrace);
      });

      expect(result.current.currentStep).toBe(0);

      // Test arrow right
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      });
      expect(result.current.currentStep).toBe(1);

      // Test 'n' key
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
      });
      expect(result.current.currentStep).toBe(2);

      // Test 'p' key
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }));
      });
      expect(result.current.currentStep).toBe(1);

      // Test arrow left
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
      });
      expect(result.current.currentStep).toBe(0);
    });

    it('responds to Home/End keys', () => {
      const { result } = renderHook(() => useDebugger(sendMessage));

      act(() => {
        result.current.setTrace(mockTrace);
        result.current.jumpToStep(1);
      });

      expect(result.current.currentStep).toBe(1);

      // Test End key
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
      });
      expect(result.current.currentStep).toBe(2);

      // Test Home key
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
      });
      expect(result.current.currentStep).toBe(0);
    });

    it('responds to Escape key', () => {
      const { result } = renderHook(() => useDebugger(sendMessage));

      act(() => {
        result.current.setTrace(mockTrace);
        result.current.jumpToStep(1);
      });

      expect(result.current.trace).not.toBeNull();

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });

      expect(result.current.trace).toBeNull();
      expect(result.current.currentStep).toBe(0);
    });

    it('ignores shortcuts when typing in input field', () => {
      const { result } = renderHook(() => useDebugger(sendMessage));

      act(() => {
        result.current.setTrace(mockTrace);
      });

      expect(result.current.currentStep).toBe(0);

      // Create a mock input element
      const input = document.createElement('input');
      document.body.appendChild(input);

      // Simulate typing 'p' in the input field
      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'p',
          bubbles: true
        });
        Object.defineProperty(event, 'target', { value: input, enumerable: true });
        window.dispatchEvent(event);
      });

      // Should NOT step backward - still at step 0
      expect(result.current.currentStep).toBe(0);

      document.body.removeChild(input);
    });

    it('ignores shortcuts when typing in textarea', () => {
      const { result } = renderHook(() => useDebugger(sendMessage));

      act(() => {
        result.current.setTrace(mockTrace);
      });

      expect(result.current.currentStep).toBe(0);

      // Create a mock textarea element
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);

      // Simulate typing 'n' in the textarea
      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'n',
          bubbles: true
        });
        Object.defineProperty(event, 'target', { value: textarea, enumerable: true });
        window.dispatchEvent(event);
      });

      // Should NOT step forward - still at step 0
      expect(result.current.currentStep).toBe(0);

      document.body.removeChild(textarea);
    });

    it('ignores shortcuts when typing in contenteditable element', () => {
      const { result } = renderHook(() => useDebugger(sendMessage));

      act(() => {
        result.current.setTrace(mockTrace);
      });

      expect(result.current.currentStep).toBe(0);

      // Create a mock contenteditable div
      const div = document.createElement('div');
      div.contentEditable = 'true';
      document.body.appendChild(div);

      // Simulate typing 'p' in the contenteditable
      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'p',
          bubbles: true
        });
        Object.defineProperty(event, 'target', { value: div, enumerable: true });
        window.dispatchEvent(event);
      });

      // Should NOT step backward - still at step 0
      expect(result.current.currentStep).toBe(0);

      document.body.removeChild(div);
    });

    it('ignores shortcuts when typing in Monaco editor', () => {
      const { result } = renderHook(() => useDebugger(sendMessage));

      act(() => {
        result.current.setTrace(mockTrace);
      });

      expect(result.current.currentStep).toBe(0);

      // Create mock Monaco editor structure
      const monacoEditor = document.createElement('div');
      monacoEditor.className = 'monaco-editor';
      const textarea = document.createElement('textarea');
      monacoEditor.appendChild(textarea);
      document.body.appendChild(monacoEditor);

      // Simulate typing 'p' in the Monaco editor
      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'p',
          bubbles: true
        });
        Object.defineProperty(event, 'target', { value: textarea, enumerable: true });
        window.dispatchEvent(event);
      });

      // Should NOT step backward - still at step 0
      expect(result.current.currentStep).toBe(0);

      document.body.removeChild(monacoEditor);
    });

    it('does not register shortcuts when no trace is active', () => {
      const { result } = renderHook(() => useDebugger(sendMessage));

      expect(result.current.trace).toBeNull();

      // Try to use shortcut
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
      });

      // Should still be at 0 and no trace
      expect(result.current.currentStep).toBe(0);
      expect(result.current.trace).toBeNull();
    });
  });
});

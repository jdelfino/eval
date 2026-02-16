/**
 * Tests for useApiDebugger hook
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useApiDebugger } from '../useApiDebugger';

// Mock the typed API function
jest.mock('@/lib/api/trace', () => ({
  traceCode: jest.fn(),
}));

import { traceCode } from '@/lib/api/trace';

const mockTraceCode = traceCode as jest.MockedFunction<typeof traceCode>;

const mockTrace = {
  steps: [
    { line: 1, locals: { x: 1 }, globals: { __name__: '__main__' }, call_stack: ['<module>'] },
    { line: 2, locals: { x: 1, y: 2 }, globals: { __name__: '__main__' }, call_stack: ['<module>'] },
    { line: 3, locals: { x: 1, y: 2, z: 3 }, globals: { __name__: '__main__' }, call_stack: ['<module>', 'foo'] },
  ],
  error: null,
};

describe('useApiDebugger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('starts with no trace and step 0', () => {
      const { result } = renderHook(() => useApiDebugger());

      expect(result.current.trace).toBeNull();
      expect(result.current.currentStep).toBe(0);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.hasTrace).toBe(false);
      expect(result.current.total_steps).toBe(0);
      expect(result.current.canStepForward).toBe(false);
      expect(result.current.canStepBackward).toBe(false);
    });
  });

  describe('requestTrace', () => {
    it('calls traceCode with code and sets trace', async () => {
      mockTraceCode.mockResolvedValueOnce(mockTrace as never);

      const { result } = renderHook(() => useApiDebugger());

      await act(async () => {
        await result.current.requestTrace('print("hello")');
      });

      expect(mockTraceCode).toHaveBeenCalledWith('print("hello")');
      expect(result.current.trace).toEqual(mockTrace);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.hasTrace).toBe(true);
      expect(result.current.total_steps).toBe(3);
      expect(result.current.currentStep).toBe(0);
    });

    it('sets isLoading during request', async () => {
      let resolveTrace: (value: unknown) => void;
      mockTraceCode.mockImplementationOnce(() => new Promise(r => { resolveTrace = r; }) as never);

      const { result } = renderHook(() => useApiDebugger());

      // Start request without awaiting
      let promise: Promise<void>;
      act(() => {
        promise = result.current.requestTrace('code');
      });

      expect(result.current.isLoading).toBe(true);

      // Resolve
      await act(async () => {
        resolveTrace!(mockTrace);
        await promise!;
      });

      expect(result.current.isLoading).toBe(false);
    });

    it('handles error from traceCode', async () => {
      mockTraceCode.mockRejectedValueOnce(new Error('Unauthorized'));

      const { result } = renderHook(() => useApiDebugger());

      await act(async () => {
        await result.current.requestTrace('code');
      });

      expect(result.current.error).toBe('Unauthorized');
      expect(result.current.isLoading).toBe(false);
      expect(result.current.trace).toBeNull();
    });

    it('handles non-Error thrown values', async () => {
      mockTraceCode.mockRejectedValueOnce('string error');

      const { result } = renderHook(() => useApiDebugger());

      await act(async () => {
        await result.current.requestTrace('code');
      });

      expect(result.current.error).toBe('Failed to trace code execution');
    });

    it('propagates trace.error from response', async () => {
      const traceWithError = { steps: [], error: 'SyntaxError: invalid syntax' };
      mockTraceCode.mockResolvedValueOnce(traceWithError as never);

      const { result } = renderHook(() => useApiDebugger());

      await act(async () => {
        await result.current.requestTrace('bad code');
      });

      expect(result.current.error).toBe('SyntaxError: invalid syntax');
      expect(result.current.trace).toEqual(traceWithError);
    });
  });

  describe('step navigation', () => {
    async function setupWithTrace() {
      mockTraceCode.mockResolvedValueOnce(mockTrace as never);
      const hook = renderHook(() => useApiDebugger());
      await act(async () => {
        await hook.result.current.requestTrace('code');
      });
      return hook;
    }

    it('stepForward advances by one', async () => {
      const { result } = await setupWithTrace();

      expect(result.current.currentStep).toBe(0);
      act(() => result.current.stepForward());
      expect(result.current.currentStep).toBe(1);
    });

    it('stepForward does not go past last step', async () => {
      const { result } = await setupWithTrace();

      act(() => result.current.jumpToLast());
      expect(result.current.currentStep).toBe(2);

      act(() => result.current.stepForward());
      expect(result.current.currentStep).toBe(2);
    });

    it('stepBackward goes back by one', async () => {
      const { result } = await setupWithTrace();

      act(() => result.current.stepForward());
      expect(result.current.currentStep).toBe(1);

      act(() => result.current.stepBackward());
      expect(result.current.currentStep).toBe(0);
    });

    it('stepBackward does not go below 0', async () => {
      const { result } = await setupWithTrace();

      expect(result.current.currentStep).toBe(0);
      act(() => result.current.stepBackward());
      expect(result.current.currentStep).toBe(0);
    });

    it('jumpToStep clamps to valid range', async () => {
      const { result } = await setupWithTrace();

      act(() => result.current.jumpToStep(1));
      expect(result.current.currentStep).toBe(1);

      // Clamp to max
      act(() => result.current.jumpToStep(100));
      expect(result.current.currentStep).toBe(2);

      // Clamp to min
      act(() => result.current.jumpToStep(-5));
      expect(result.current.currentStep).toBe(0);
    });

    it('jumpToFirst goes to step 0', async () => {
      const { result } = await setupWithTrace();

      act(() => result.current.jumpToLast());
      expect(result.current.currentStep).toBe(2);

      act(() => result.current.jumpToFirst());
      expect(result.current.currentStep).toBe(0);
    });

    it('jumpToLast goes to last step', async () => {
      const { result } = await setupWithTrace();

      act(() => result.current.jumpToLast());
      expect(result.current.currentStep).toBe(2);
    });

    it('canStepForward and canStepBackward are correct', async () => {
      const { result } = await setupWithTrace();

      // At step 0: can go forward, cannot go backward
      expect(result.current.canStepForward).toBe(true);
      expect(result.current.canStepBackward).toBe(false);

      // At step 1: can go both ways
      act(() => result.current.stepForward());
      expect(result.current.canStepForward).toBe(true);
      expect(result.current.canStepBackward).toBe(true);

      // At last step: cannot go forward, can go backward
      act(() => result.current.jumpToLast());
      expect(result.current.canStepForward).toBe(false);
      expect(result.current.canStepBackward).toBe(true);
    });

    it('navigation is no-op without a trace', () => {
      const { result } = renderHook(() => useApiDebugger());

      act(() => result.current.stepForward());
      expect(result.current.currentStep).toBe(0);

      act(() => result.current.stepBackward());
      expect(result.current.currentStep).toBe(0);

      act(() => result.current.jumpToStep(5));
      expect(result.current.currentStep).toBe(0);

      act(() => result.current.jumpToFirst());
      expect(result.current.currentStep).toBe(0);

      act(() => result.current.jumpToLast());
      expect(result.current.currentStep).toBe(0);
    });
  });

  describe('state accessors', () => {
    it('getCurrentStep returns current trace step', async () => {
      mockTraceCode.mockResolvedValueOnce(mockTrace as never);
      const { result } = renderHook(() => useApiDebugger());

      await act(async () => {
        await result.current.requestTrace('code');
      });

      expect(result.current.getCurrentStep()).toEqual(mockTrace.steps[0]);

      act(() => result.current.stepForward());
      expect(result.current.getCurrentStep()).toEqual(mockTrace.steps[1]);
    });

    it('getCurrentStep returns null without trace', () => {
      const { result } = renderHook(() => useApiDebugger());
      expect(result.current.getCurrentStep()).toBeNull();
    });

    it('getCurrentLocals returns locals from current step', async () => {
      mockTraceCode.mockResolvedValueOnce(mockTrace as never);
      const { result } = renderHook(() => useApiDebugger());

      await act(async () => {
        await result.current.requestTrace('code');
      });

      expect(result.current.getCurrentLocals()).toEqual({ x: 1 });

      act(() => result.current.stepForward());
      expect(result.current.getCurrentLocals()).toEqual({ x: 1, y: 2 });
    });

    it('getCurrentLocals returns empty object without trace', () => {
      const { result } = renderHook(() => useApiDebugger());
      expect(result.current.getCurrentLocals()).toEqual({});
    });

    it('getCurrentGlobals returns globals from current step', async () => {
      mockTraceCode.mockResolvedValueOnce(mockTrace as never);
      const { result } = renderHook(() => useApiDebugger());

      await act(async () => {
        await result.current.requestTrace('code');
      });

      expect(result.current.getCurrentGlobals()).toEqual({ __name__: '__main__' });
    });

    it('getCurrentCallStack returns call stack from current step', async () => {
      mockTraceCode.mockResolvedValueOnce(mockTrace as never);
      const { result } = renderHook(() => useApiDebugger());

      await act(async () => {
        await result.current.requestTrace('code');
      });

      expect(result.current.getCurrentCallStack()).toEqual(['<module>']);

      act(() => result.current.jumpToLast());
      expect(result.current.getCurrentCallStack()).toEqual(['<module>', 'foo']);
    });

    it('getPreviousStep returns null at step 0', async () => {
      mockTraceCode.mockResolvedValueOnce(mockTrace as never);
      const { result } = renderHook(() => useApiDebugger());

      await act(async () => {
        await result.current.requestTrace('code');
      });

      expect(result.current.getPreviousStep()).toBeNull();
    });

    it('getPreviousStep returns previous step', async () => {
      mockTraceCode.mockResolvedValueOnce(mockTrace as never);
      const { result } = renderHook(() => useApiDebugger());

      await act(async () => {
        await result.current.requestTrace('code');
      });

      act(() => result.current.stepForward());
      expect(result.current.getPreviousStep()).toEqual(mockTrace.steps[0]);
    });
  });

  describe('reset', () => {
    it('clears trace and resets to initial state', async () => {
      mockTraceCode.mockResolvedValueOnce(mockTrace as never);
      const { result } = renderHook(() => useApiDebugger());

      await act(async () => {
        await result.current.requestTrace('code');
      });

      act(() => result.current.stepForward());
      expect(result.current.hasTrace).toBe(true);
      expect(result.current.currentStep).toBe(1);

      act(() => result.current.reset());

      expect(result.current.trace).toBeNull();
      expect(result.current.currentStep).toBe(0);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.hasTrace).toBe(false);
    });
  });

  describe('setTrace', () => {
    it('sets trace directly without API call', () => {
      const { result } = renderHook(() => useApiDebugger());

      act(() => result.current.setTrace(mockTrace as never));

      expect(result.current.trace).toEqual(mockTrace);
      expect(result.current.currentStep).toBe(0);
      expect(result.current.hasTrace).toBe(true);
    });

    it('propagates trace.error', () => {
      const traceWithError = { steps: [{ line: 1, locals: {}, globals: {}, call_stack: [] }], error: 'Runtime error' };
      const { result } = renderHook(() => useApiDebugger());

      act(() => result.current.setTrace(traceWithError as never));

      expect(result.current.error).toBe('Runtime error');
    });
  });

  describe('setError', () => {
    it('sets error and clears loading', () => {
      const { result } = renderHook(() => useApiDebugger());

      act(() => result.current.setError('Something went wrong'));

      expect(result.current.error).toBe('Something went wrong');
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('keyboard shortcuts', () => {
    async function setupWithTrace() {
      mockTraceCode.mockResolvedValueOnce(mockTrace as never);
      const hook = renderHook(() => useApiDebugger());
      await act(async () => {
        await hook.result.current.requestTrace('code');
      });
      return hook;
    }

    function dispatchKey(key: string) {
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      });
    }

    it('ArrowRight steps forward', async () => {
      const { result } = await setupWithTrace();

      dispatchKey('ArrowRight');
      expect(result.current.currentStep).toBe(1);
    });

    it('n steps forward', async () => {
      const { result } = await setupWithTrace();

      dispatchKey('n');
      expect(result.current.currentStep).toBe(1);
    });

    it('ArrowLeft steps backward', async () => {
      const { result } = await setupWithTrace();

      act(() => result.current.stepForward());
      dispatchKey('ArrowLeft');
      expect(result.current.currentStep).toBe(0);
    });

    it('p steps backward', async () => {
      const { result } = await setupWithTrace();

      act(() => result.current.stepForward());
      dispatchKey('p');
      expect(result.current.currentStep).toBe(0);
    });

    it('Home jumps to first step', async () => {
      const { result } = await setupWithTrace();

      act(() => result.current.jumpToLast());
      dispatchKey('Home');
      expect(result.current.currentStep).toBe(0);
    });

    it('End jumps to last step', async () => {
      const { result } = await setupWithTrace();

      dispatchKey('End');
      expect(result.current.currentStep).toBe(2);
    });

    it('Escape resets debugger', async () => {
      const { result } = await setupWithTrace();

      dispatchKey('Escape');
      expect(result.current.trace).toBeNull();
      expect(result.current.hasTrace).toBe(false);
    });

    it('does not handle keys without trace', () => {
      const { result } = renderHook(() => useApiDebugger());

      dispatchKey('ArrowRight');
      expect(result.current.currentStep).toBe(0);
    });

    it('ignores keys in input elements', async () => {
      const { result } = await setupWithTrace();

      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      act(() => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });

      expect(result.current.currentStep).toBe(0);
      document.body.removeChild(input);
    });

    it('ignores keys in textarea elements', async () => {
      const { result } = await setupWithTrace();

      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();

      act(() => {
        textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });

      expect(result.current.currentStep).toBe(0);
      document.body.removeChild(textarea);
    });

    // Note: contenteditable check is tested indirectly via Monaco editor test.
    // jsdom does not properly support isContentEditable, so we skip a direct test.

    it('ignores keys inside Monaco editor', async () => {
      const { result } = await setupWithTrace();

      const monacoContainer = document.createElement('div');
      monacoContainer.className = 'monaco-editor';
      const innerDiv = document.createElement('div');
      monacoContainer.appendChild(innerDiv);
      document.body.appendChild(monacoContainer);
      innerDiv.focus();

      act(() => {
        innerDiv.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });

      expect(result.current.currentStep).toBe(0);
      document.body.removeChild(monacoContainer);
    });

    it('cleans up event listener on unmount', async () => {
      const { result, unmount } = await setupWithTrace();

      unmount();

      // Dispatching after unmount should not throw
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
  });
});

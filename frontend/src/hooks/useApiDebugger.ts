import { useState, useCallback, useEffect } from 'react';
import { ExecutionTrace, TraceStep } from '@/types/session';
import { traceCode } from '@/lib/api/trace';

export interface DebuggerState {
  trace: ExecutionTrace | null;
  currentStep: number;
  isLoading: boolean;
  error: string | null;
}

/**
 * API-based debugger hook for code tracing.
 * No session context needed — any authenticated user can trace code.
 */
export function useApiDebugger() {
  const [state, setState] = useState<DebuggerState>({
    trace: null,
    currentStep: 0,
    isLoading: false,
    error: null
  });

  const requestTrace = useCallback(async (code: string, language: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const trace = await traceCode(code, language);
      setState({
        trace,
        currentStep: 0,
        isLoading: false,
        error: trace.error || null
      });
    } catch (error: unknown) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to trace code execution'
      }));
    }
  }, []);

  const setTrace = useCallback((trace: ExecutionTrace) => {
    setState({
      trace,
      currentStep: 0,
      isLoading: false,
      error: trace.error || null
    });
  }, []);

  const stepForward = useCallback(() => {
    setState(prev => {
      if (!prev.trace || prev.currentStep >= prev.trace.steps.length - 1) {
        return prev;
      }
      return { ...prev, currentStep: prev.currentStep + 1 };
    });
  }, []);

  const stepBackward = useCallback(() => {
    setState(prev => {
      if (!prev.trace || prev.currentStep <= 0) {
        return prev;
      }
      return { ...prev, currentStep: prev.currentStep - 1 };
    });
  }, []);

  const jumpToStep = useCallback((step: number) => {
    setState(prev => {
      if (!prev.trace) return prev;
      const newStep = Math.max(0, Math.min(step, prev.trace.steps.length - 1));
      return { ...prev, currentStep: newStep };
    });
  }, []);

  const jumpToFirst = useCallback(() => {
    setState(prev => {
      if (!prev.trace) return prev;
      return { ...prev, currentStep: 0 };
    });
  }, []);

  const jumpToLast = useCallback(() => {
    setState(prev => {
      if (!prev.trace) return prev;
      return { ...prev, currentStep: prev.trace.steps.length - 1 };
    });
  }, []);

  const reset = useCallback(() => {
    setState({
      trace: null,
      currentStep: 0,
      isLoading: false,
      error: null
    });
  }, []);

  const setError = useCallback((error: string) => {
    setState(prev => ({
      ...prev,
      isLoading: false,
      error
    }));
  }, []);

  const getCurrentStep = useCallback((): TraceStep | null => {
    if (!state.trace || state.trace.steps.length === 0) {
      return null;
    }
    return state.trace.steps[state.currentStep];
  }, [state.trace, state.currentStep]);

  const getCurrentLocals = useCallback(() => {
    const step = getCurrentStep();
    return step?.locals || {};
  }, [getCurrentStep]);

  const getCurrentGlobals = useCallback(() => {
    const step = getCurrentStep();
    return step?.globals || {};
  }, [getCurrentStep]);

  const getCurrentCallStack = useCallback(() => {
    const step = getCurrentStep();
    return step?.call_stack || [];
  }, [getCurrentStep]);

  const getPreviousStep = useCallback((): TraceStep | null => {
    if (!state.trace || state.currentStep === 0) {
      return null;
    }
    return state.trace.steps[state.currentStep - 1];
  }, [state.trace, state.currentStep]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!state.trace) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if debugger is active
      if (!state.trace) return;

      // Don't intercept keyboard shortcuts if user is typing in an input field
      const target = e.target as HTMLElement;
      const isEditableElement =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        (target.closest && target.closest('.monaco-editor')); // Monaco editor check

      if (isEditableElement) {
        return; // Let the input field handle the key
      }

      switch (e.key) {
        case 'ArrowRight':
        case 'n':
          e.preventDefault();
          stepForward();
          break;
        case 'ArrowLeft':
        case 'p':
          e.preventDefault();
          stepBackward();
          break;
        case 'Home':
          e.preventDefault();
          jumpToFirst();
          break;
        case 'End':
          e.preventDefault();
          jumpToLast();
          break;
        case 'Escape':
          e.preventDefault();
          reset();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.trace, stepForward, stepBackward, jumpToFirst, jumpToLast, reset]);

  return {
    ...state,
    requestTrace,
    setTrace,
    setError,
    stepForward,
    stepBackward,
    jumpToStep,
    jumpToFirst,
    jumpToLast,
    reset,
    getCurrentStep,
    getCurrentLocals,
    getCurrentGlobals,
    getCurrentCallStack,
    getPreviousStep,
    total_steps: state.trace?.steps.length || 0,
    hasTrace: state.trace !== null,
    canStepForward: state.trace !== null && state.currentStep < (state.trace.steps.length - 1),
    canStepBackward: state.trace !== null && state.currentStep > 0
  };
}

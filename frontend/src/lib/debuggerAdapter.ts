/**
 * debuggerAdapter — converts useApiDebugger raw state to the DrawerDebug shape.
 *
 * useApiDebugger returns:
 *   - locals: Record<string, unknown> (plain object, not array)
 *   - call_stack: CallFrame[] with function_name/filename/line fields
 *
 * Drawer (T3) expects:
 *   - debug.locals: Array<{name, value, changed}>
 *   - debug.stack: Array<{frame, line}>
 *
 * Extracting this logic here (vs. inlining in page.tsx) lets T7 (projector) and
 * any future consumer import the same adapter without duplication.
 *
 * buildDrawerDebug is a convenience wrapper that accepts the hook return value directly
 * and collapses the boilerplate getCurrentStep/getPreviousStep call-site pattern used
 * identically in student/page.tsx and public-view/page.tsx.
 */

import type { TraceStep } from '@/types/session';
import type { DrawerDebug } from '@/components/workspace/Drawer';

export interface DebuggerAdapterInput {
  /** The current TraceStep, or null if no trace is active. */
  currentStep: TraceStep | null;
  /** The previous TraceStep (for computing `changed`), or null at step 0. */
  previousStep: TraceStep | null;
  /** 0-based index of the current step. */
  stepIndex: number;
  /** Total number of steps in the trace. */
  totalSteps: number;
  /** Optional test name to display in the drawer header. */
  testName?: string;
  /** Step callback forwarded from the debugger hook (delta = +1 or -1). */
  onStep?: (delta: 1 | -1) => void;
  /** Play callback forwarded from the debugger hook. */
  onPlay?: () => void;
}

/**
 * Adapt raw useApiDebugger state to the DrawerDebug props shape.
 *
 * Returns null when currentStep is null (i.e., no active trace), which lets
 * callers pass the result directly to drawerDebug without extra null checks.
 */
export function adaptDebuggerState(input: DebuggerAdapterInput): DrawerDebug | null {
  const { currentStep, previousStep, stepIndex, totalSteps, testName, onStep, onPlay } = input;

  if (!currentStep) return null;

  const previousLocals: Record<string, unknown> = previousStep?.locals ?? {};

  const locals = Object.entries(currentStep.locals).map(([name, value]) => ({
    name,
    value: String(value),
    changed: !Object.is(value, previousLocals[name]),
  }));

  const stack = currentStep.call_stack.map((frame) => ({
    frame: frame.function_name,
    line: frame.line,
  }));

  return {
    step: stepIndex,
    total: totalSteps,
    locals,
    stack,
    testName,
    onStep,
    onPlay,
  };
}

/**
 * Minimal interface for the useApiDebugger hook return that buildDrawerDebug needs.
 * Avoids importing the full hook return type which would create a circular dependency.
 */
export interface DebuggerHookSlice {
  getCurrentStep: () => import('@/types/session').TraceStep | null;
  getPreviousStep: () => import('@/types/session').TraceStep | null;
  currentStep: number;
  total_steps: number;
  stepForward: () => void;
  stepBackward: () => void;
}

/**
 * buildDrawerDebug — one-line boilerplate replacement for the identical pattern
 * used in student/page.tsx and public-view/page.tsx.
 *
 * Before (duplicated verbatim at both call sites):
 *   const currentStep = debuggerHook.getCurrentStep();
 *   const previousStep = debuggerHook.getPreviousStep();
 *   const drawerDebug = adaptDebuggerState({ currentStep, previousStep,
 *     stepIndex: debuggerHook.currentStep, totalSteps: debuggerHook.total_steps,
 *     onStep: (delta) => { if (delta === 1) debuggerHook.stepForward(); else debuggerHook.stepBackward(); },
 *     onPlay: undefined }) ?? undefined;
 *
 * After:
 *   const drawerDebug = buildDrawerDebug(debuggerHook);
 */
export function buildDrawerDebug(hook: DebuggerHookSlice): DrawerDebug | undefined {
  return adaptDebuggerState({
    currentStep: hook.getCurrentStep(),
    previousStep: hook.getPreviousStep(),
    stepIndex: hook.currentStep,
    totalSteps: hook.total_steps,
    onStep: (delta) => {
      if (delta === 1) hook.stepForward();
      else hook.stepBackward();
    },
    onPlay: undefined,
  }) ?? undefined;
}

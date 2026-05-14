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

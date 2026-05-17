/**
 * Tests for the debuggerAdapter utility.
 *
 * Contract: adapts useApiDebugger's raw state (Record<string, unknown> locals,
 * CallFrame[] call_stack) to the DrawerDebug shape expected by Drawer.
 *
 * This matters because Drawer requires arrays with specific shapes while the
 * hook returns plain objects. A mismatch would cause silent empty renders.
 *
 * @jest-environment jsdom
 */

import { adaptDebuggerState } from '../debuggerAdapter';
import type { TraceStep } from '@/types/session';

describe('adaptDebuggerState', () => {
  const makeStep = (overrides: Partial<TraceStep> = {}): TraceStep => ({
    line: 1,
    event: 'line',
    locals: {},
    globals: {},
    call_stack: [],
    stdout: '',
    ...overrides,
  });

  it('returns null when no trace is active', () => {
    const result = adaptDebuggerState({
      currentStep: null,
      previousStep: null,
      stepIndex: 0,
      totalSteps: 0,
    });
    expect(result).toBeNull();
  });

  it('converts locals Record<string, unknown> to DrawerDebugLocal[]', () => {
    /**
     * Drawer expects locals as an array of {name, value, changed}. The hook
     * returns locals as a plain object. This test verifies the conversion.
     */
    const step = makeStep({ locals: { x: 42, msg: 'hello' } });
    const result = adaptDebuggerState({
      currentStep: step,
      previousStep: null,
      stepIndex: 1,
      totalSteps: 5,
    });

    expect(result).not.toBeNull();
    expect(result!.locals).toHaveLength(2);
    expect(result!.locals).toEqual(
      expect.arrayContaining([
        { name: 'x', value: '42', changed: true },
        { name: 'msg', value: 'hello', changed: true },
      ])
    );
  });

  it('marks local as changed=false when value matches previous step', () => {
    /**
     * The changed flag drives the accent color in Drawer's local variable list.
     * A bug here would mark all variables as changed on every step.
     */
    const previous = makeStep({ locals: { x: 10, y: 20 } });
    const current = makeStep({ locals: { x: 10, y: 99 } });

    const result = adaptDebuggerState({
      currentStep: current,
      previousStep: previous,
      stepIndex: 2,
      totalSteps: 5,
    });

    expect(result!.locals.find((l) => l.name === 'x')!.changed).toBe(false);
    expect(result!.locals.find((l) => l.name === 'y')!.changed).toBe(true);
  });

  it('marks all locals as changed when previousStep is null (first step)', () => {
    const step = makeStep({ locals: { a: 1 } });
    const result = adaptDebuggerState({
      currentStep: step,
      previousStep: null,
      stepIndex: 0,
      totalSteps: 3,
    });

    expect(result!.locals[0].changed).toBe(true);
  });

  it('converts call_stack CallFrame[] to DrawerDebugFrame[]', () => {
    /**
     * Drawer expects stack frames as {frame, line}. CallFrame uses function_name.
     * A field name mismatch here would render empty call stack in the debugger.
     */
    const step = makeStep({
      call_stack: [
        { function_name: 'main', filename: 'main.py', line: 5 },
        { function_name: 'helper', filename: 'main.py', line: 12 },
      ],
    });

    const result = adaptDebuggerState({
      currentStep: step,
      previousStep: null,
      stepIndex: 0,
      totalSteps: 1,
    });

    expect(result!.stack).toEqual([
      { frame: 'main', line: 5 },
      { frame: 'helper', line: 12 },
    ]);
  });

  it('propagates step index and total correctly', () => {
    const step = makeStep();
    const result = adaptDebuggerState({
      currentStep: step,
      previousStep: null,
      stepIndex: 3,
      totalSteps: 10,
    });

    expect(result!.step).toBe(3);
    expect(result!.total).toBe(10);
  });

  it('handles empty locals and call stack gracefully', () => {
    const step = makeStep({ locals: {}, call_stack: [] });
    const result = adaptDebuggerState({
      currentStep: step,
      previousStep: null,
      stepIndex: 0,
      totalSteps: 1,
    });

    expect(result!.locals).toEqual([]);
    expect(result!.stack).toEqual([]);
  });

  it('converts non-string local values to string representations', () => {
    const step = makeStep({
      locals: {
        num: 42,
        flag: true,
        nothing: null,
        arr: [1, 2, 3],
      },
    });

    const result = adaptDebuggerState({
      currentStep: step,
      previousStep: null,
      stepIndex: 0,
      totalSteps: 1,
    });

    const localMap = Object.fromEntries(result!.locals.map((l) => [l.name, l.value]));
    expect(localMap['num']).toBe('42');
    expect(localMap['flag']).toBe('true');
    expect(localMap['nothing']).toBe('null');
    expect(localMap['arr']).toBe('1,2,3');
  });
});

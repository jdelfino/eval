import type { IOTestCase, CaseResult } from '@/types/api';

/**
 * TestRailItem — the joined shape consumed by TestRail.
 *
 * Consumers call toTestRailItems(cases, results) to produce this shape.
 * The rail itself is dumb — it only knows TestRailItem[].
 */
export type TestRailItem = {
  id: string;
  name: string;
  kind: 'io' | 'pytest';
  visible: boolean;
  state: 'idle' | 'running' | 'pass' | 'fail';
  /** Human-readable elapsed time, e.g. "5ms" or "" when idle */
  t: string;
  /** Kind-specific preview data for io tests */
  io?: { stdin: string };
  /** Kind-specific preview data for pytest tests */
  pytest?: { target: string };
};

/**
 * Map a CaseResultIO status string to a TestRailItem state.
 *
 * The backend emits: "run" | "passed" | "failed" | "error"
 */
function ioStatusToState(status: string): TestRailItem['state'] {
  if (status === 'passed') return 'pass';
  if (status === 'run') return 'running';
  // "failed" | "error" both map to fail
  return 'fail';
}

/**
 * toTestRailItems — zips IOTestCase[] definitions with CaseResult[] outcomes
 * into TestRailItem[], the canonical input to the TestRail component.
 *
 * Cases and results are joined by index (not by id/name). Pass results=undefined
 * or results=[] for the pre-run state — all items will have state='idle'.
 *
 * @param cases   - Test case definitions from the problem/student-work
 * @param results - Execution results from TestResponse.results, or omitted/empty before first run
 */
export function toTestRailItems(
  cases: IOTestCase[],
  results?: CaseResult[]
): TestRailItem[] {
  return cases.map((c, index) => {
    const result = results?.[index];

    // Resolve display name: explicit name → target_path (pytest) → "case-{index}"
    const name =
      c.name ??
      (c.kind === 'pytest' ? c.target_path : undefined) ??
      `case-${index}`;

    // Stable id: prefer the case's own order field if present, else use index
    const idBase = c.kind === 'io' && c.order !== undefined ? String(c.order) : String(index);
    const id = `${c.kind}-${idBase}-${name}`;

    // Visible flag: some consumers annotate cases with visible for instructor view
    // IOTestCase doesn't formally carry this field, but callers may extend cases with it.
    const visible = (c as unknown as Record<string, unknown>)['visible'] !== false;

    // Kind-specific preview and state
    if (c.kind === 'io') {
      let state: TestRailItem['state'] = 'idle';
      let t = '';

      if (result && result.kind === 'io') {
        state = ioStatusToState(result.status);
        t = result.time_ms > 0 ? `${result.time_ms}ms` : '';
      }

      return {
        id,
        name,
        kind: 'io',
        visible,
        state,
        t,
        io: { stdin: c.input ?? '' },
      };
    } else {
      // kind === 'pytest'
      let state: TestRailItem['state'] = 'idle';
      let t = '';

      if (result && result.kind === 'pytest') {
        state = result.passed ? 'pass' : 'fail';
        t = result.duration_ms > 0 ? `${result.duration_ms}ms` : '';
      }

      return {
        id,
        name,
        kind: 'pytest',
        visible,
        state,
        t,
        pytest: { target: c.target_path },
      };
    }
  });
}

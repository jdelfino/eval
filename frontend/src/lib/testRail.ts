import type { IOTestCase, CaseResult, CaseResultIO, TestResponse } from '@/types/api';
import type { DrawerOutput } from '@/components/workspace/Drawer';

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
 *
 * "run" means the executor ran the code with no expected output to compare —
 * the case completed successfully, so it maps to 'pass' (not 'running', which
 * would show a perpetual spinner).
 */
function ioStatusToState(status: string): TestRailItem['state'] {
  if (status === 'passed') return 'pass';
  if (status === 'run') return 'pass';
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
        state,
        t,
        pytest: { target: c.target_path },
      };
    }
  });
}

/**
 * toDrawerOutput — derives the DrawerOutput shape from a TestResponse.
 *
 * Extracts stdout lines from io results (actual field) and computes pass/fail
 * status from the summary. Returns undefined when result is null (pre-run state),
 * so callers can pass directly to drawerOutput without extra null checks.
 *
 * All four page consumers (student, public-view, ProblemCreator, SessionProblemEditor)
 * previously inlined this same derivation. Centralising here ensures consistent
 * behaviour across all surfaces.
 */
export function toDrawerOutput(result: TestResponse | null): DrawerOutput | undefined {
  if (!result) return undefined;
  const { passed, failed, errors, run, total } = result.summary;

  // Summary text: for pure run-only executions (no assertions), show "N run" instead
  // of "0/N passed" which implies a failure when the code simply ran without assertions.
  const summary =
    run > 0 && failed === 0 && passed === 0
      ? `${run} run`
      : `${passed}/${total} passed`;

  // Status: fail if any test failed OR if the executor reported errors (e.g. sandbox
  // failure, timeout). Previously only checked failed>0, causing "✓ Success" to appear
  // when the executor errored out.
  const status = failed > 0 || errors > 0 ? ('fail' as const) : ('pass' as const);

  return {
    lines: result.results.flatMap((r) => {
      // r may be undefined in a sparse results array (C2 single-run attribution fix)
      if (!r) return [];
      if (r.kind === 'io' && (r as CaseResultIO).actual) {
        return [{ stream: 'out' as const, text: (r as CaseResultIO).actual! }];
      }
      return [];
    }),
    status,
    summary,
  };
}

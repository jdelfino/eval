/**
 * Integration tests for the student workspace page wired to WorkspaceShell.
 *
 * These tests verify that the student page correctly mounts WorkspaceShell
 * (not the old CodeEditor) and that all data flows — execution, debugger,
 * autosave, and realtime updates — propagate through the new shell.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import StudentPageWrapper from '../page';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockGetStudentWork = jest.fn();
const mockGetSection = jest.fn();
const mockUpdateStudentWork = jest.fn();
const mockExecuteCode = jest.fn();
const mockJoinSession = jest.fn();
const mockUpdateCode = jest.fn();
const mockRequestTrace = jest.fn();

jest.mock('@/lib/api/student-work', () => ({
  getStudentWork: (...args: unknown[]) => mockGetStudentWork(...args),
  updateStudentWork: (...args: unknown[]) => mockUpdateStudentWork(...args),
  getOrCreateStudentWork: jest.fn(),
}));

// G4 section-pointer model: live-vs-practice gated on current_session_id.
jest.mock('@/lib/api/sections', () => ({
  getSection: (...args: unknown[]) => mockGetSection(...args),
}));

jest.mock('@/hooks/useSectionEvents', () => ({
  useSectionEvents: () => ({
    currentSessionId: 'session-1',
    currentProblem: { id: 'problem-1', title: 'Test Problem' },
    lastActivity: new Date().toISOString(),
  }),
  LIVENESS_WINDOW_MS: 60 * 60 * 1000,
}));

jest.mock('@/lib/api/execute', () => ({
  warmExecutor: jest.fn().mockResolvedValue(undefined),
  executeCode: (...args: unknown[]) => mockExecuteCode(...args),
  ioTestCasesToCaseDefs: jest.requireActual('@/lib/api/execute').ioTestCasesToCaseDefs,
  ioTestCasesToGradedCaseDefs: jest.requireActual('@/lib/api/execute').ioTestCasesToGradedCaseDefs,
}));

const mockDebuggerState = {
  trace: null,
  currentStep: 0,
  isLoading: false,
  error: null,
  requestTrace: (...args: unknown[]) => mockRequestTrace(...args),
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
  total_steps: 0,
  hasTrace: false,
  canStepForward: false,
  canStepBackward: false,
};

jest.mock('@/hooks/useApiDebugger', () => ({
  useApiDebugger: jest.fn(() => ({ ...mockDebuggerState })),
}));

const mockUseRealtimeSession = jest.fn();

jest.mock('@/hooks/useRealtimeSession', () => ({
  useRealtimeSession: () => mockUseRealtimeSession(),
}));

jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(() => ({
    get: (key: string) => (key === 'work_id' ? 'work-123' : null),
  })),
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
  })),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(() => ({
    user: { id: 'user-1', email: 'test@example.com', display_name: 'Test User' },
  })),
}));

// ─── WorkspaceShell mock — captures props for assertions ─────────────────────

import type { WorkspaceShellProps } from '@/components/workspace/WorkspaceShell';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let capturedShellProps: WorkspaceShellProps | null = null;

jest.mock('@/components/workspace/WorkspaceShell', () => ({
  __esModule: true,
  default: (props: WorkspaceShellProps) => {
    capturedShellProps = props;
    const firstTest = props.tests?.[0];
    const thirdTest = props.tests?.[2];
    const firstTab = props.editorTabs?.[0];
    return (
      <div data-testid="workspace-shell">
        {/* Expose key prop values for assertions */}
        <div data-testid="ribbon-title">{props.problemTitle}</div>
        <div data-testid="ribbon-statement">{props.statement}</div>
        <div data-testid="drawer-mode">{props.drawerMode}</div>
        {/* Expose ribbon open state */}
        {props.ribbonOpen && <div data-testid="ribbon-open">open</div>}
        {/* Run all button to simulate user action */}
        <button
          data-testid="run-all-btn"
          onClick={() => props.onRunAll?.()}
        >
          Run all
        </button>
        {/* Editor tab label */}
        <div data-testid="editor-tab-label">{firstTab?.label}</div>
        {/* Debug trigger for first test */}
        <button
          data-testid="debug-test-btn"
          onClick={() => props.onDebugTest?.(firstTest?.id ?? 'test-0')}
        >
          Debug
        </button>
        {/* Run single test trigger (first test) */}
        <button
          data-testid="run-single-btn"
          onClick={() => props.onRunTest?.(firstTest?.id ?? 'test-0')}
        >
          Run single
        </button>
        {/* Run third test trigger (index 2) — used to verify index attribution */}
        {thirdTest && (
          <button
            data-testid="run-third-btn"
            onClick={() => props.onRunTest?.(thirdTest.id)}
          >
            Run third
          </button>
        )}
        {props.drawerCloseAction && (
          <div data-testid="drawer-close-action">{props.drawerCloseAction}</div>
        )}
      </div>
    );
  },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const fakeStudentWork = {
  id: 'work-123',
  user_id: 'user-1',
  section_id: 'section-1',
  problem_id: 'problem-1',
  code: 'print("hello")',
  last_update: '2024-01-01T00:00:00Z',
  created_at: '2024-01-01T00:00:00Z',
  problem: {
    id: 'problem-1',
    namespace_id: 'ns-1',
    title: 'Two Sum',
    description: '# Two Sum\n\nGiven an array of integers.',
    starter_code: '',
    language: 'python',
    test_cases: [
      {
        kind: 'io' as const,
        name: 'case-1',
        input: '1 2',
        expected_output: '3',
        match_type: 'exact',
        order: 0,
      },
      {
        kind: 'io' as const,
        name: 'case-2',
        input: '4 5',
        expected_output: '9',
        match_type: 'exact',
        order: 1,
      },
    ],
    author_id: 'instructor-1',
    class_id: 'class-1',
    tags: ['python'],
    solution: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
};

// Fixture with 3 test cases — needed to test C2 index-attribution bug.
// The bug manifests when running test at index N>0: result[0] was attributed to row 0.
const fakeStudentWorkThreeCases = {
  ...fakeStudentWork,
  problem: {
    ...fakeStudentWork.problem,
    test_cases: [
      { kind: 'io' as const, name: 'case-1', input: '1 2', expected_output: '3', match_type: 'exact', order: 0 },
      { kind: 'io' as const, name: 'case-2', input: '4 5', expected_output: '9', match_type: 'exact', order: 1 },
      { kind: 'io' as const, name: 'case-3', input: '7 8', expected_output: '15', match_type: 'exact', order: 2 },
    ],
  },
};

const defaultRealtimeSession = {
  session: null,
  loading: false,
  error: null,
  isConnected: false,
  connectionStatus: 'disconnected',
  connectionError: null,
  updateCode: mockUpdateCode,
  joinSession: mockJoinSession,
  replacementInfo: null,
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  capturedShellProps = null;
  mockUseRealtimeSession.mockReturnValue(defaultRealtimeSession);
  mockUpdateStudentWork.mockResolvedValue(undefined);
  // Default: no pointer → practice mode.
  mockGetSection.mockResolvedValue({
    id: 'section-1',
    name: 'Test Section',
    class_id: 'class-1',
    namespace_id: 'ns-1',
    join_code: 'ABCD',
    current_session_id: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  });
  // Reset useApiDebugger to default (no active trace)
  const { useApiDebugger } = require('@/hooks/useApiDebugger');
  useApiDebugger.mockReturnValue({ ...mockDebuggerState });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('StudentPage wired to WorkspaceShell', () => {
  describe('TC1: Renders WorkspaceShell with problem data', () => {
    /**
     * Contract: after loading student work, the page mounts WorkspaceShell (not
     * CodeEditor) with the problem title, statement, and editor tab for main.py.
     * Regression guard: prop wiring mis-wire causes blank workspace.
     */
    it('renders WorkspaceShell with problem title and statement', async () => {
      mockGetStudentWork.mockResolvedValue(fakeStudentWork);

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
      });

      expect(screen.getByTestId('ribbon-title').textContent).toBe('Two Sum');
      expect(screen.getByTestId('ribbon-statement').textContent).toContain('Two Sum');
    });

    it('wires editorTabs[0].label to main.py', async () => {
      mockGetStudentWork.mockResolvedValue(fakeStudentWork);

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
      });

      expect(screen.getByTestId('editor-tab-label').textContent).toBe('main.py');
    });

    it('does not import or render CodeEditor', async () => {
      mockGetStudentWork.mockResolvedValue(fakeStudentWork);

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('code-editor')).toBeNull();
    });
  });

  describe('TC2: Run all triggers executeCode and updates rail rows', () => {
    /**
     * Contract: clicking "Run all" calls executeCode with all test cases.
     * Results thread back through the rail via toTestRailItems.
     * Regression guard: execution results not reflected in rail.
     */
    it('calls executeCode with all test cases on Run all', async () => {
      mockGetStudentWork.mockResolvedValue(fakeStudentWork);
      mockExecuteCode.mockResolvedValue({
        results: [
          { kind: 'io', name: 'case-1', status: 'passed', time_ms: 5 },
          { kind: 'io', name: 'case-2', status: 'failed', time_ms: 3 },
        ],
        summary: { total: 2, passed: 1, failed: 1, errors: 0, run: 0, time_ms: 8 },
      });

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
      });

      await act(async () => {
        screen.getByTestId('run-all-btn').click();
      });

      await waitFor(() => {
        expect(mockExecuteCode).toHaveBeenCalledTimes(1);
      });

      const [, , options] = mockExecuteCode.mock.calls[0];
      // Should have submitted both test cases
      expect(options.cases).toHaveLength(2);
    });

    it('rail shows updated state after execution completes', async () => {
      mockGetStudentWork.mockResolvedValue(fakeStudentWork);
      mockExecuteCode.mockResolvedValue({
        results: [
          { kind: 'io', name: 'case-1', status: 'passed', time_ms: 5 },
          { kind: 'io', name: 'case-2', status: 'failed', time_ms: 3 },
        ],
        summary: { total: 2, passed: 1, failed: 1, errors: 0, run: 0, time_ms: 8 },
      });

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
      });

      await act(async () => {
        screen.getByTestId('run-all-btn').click();
      });

      await waitFor(() => {
        expect(mockExecuteCode).toHaveBeenCalledTimes(1);
      });

      // After execution, capturedShellProps should have tests with pass/fail states
      await waitFor(() => {
        const tests = capturedShellProps?.tests;
        expect(tests?.some((t) => t.state === 'pass')).toBe(true);
        expect(tests?.some((t) => t.state === 'fail')).toBe(true);
      });
    });
  });

  describe('TC3: Run single triggers executeCode with one case', () => {
    /**
     * Contract: clicking "Run single" calls executeCode with exactly one case
     * matching the selected test row. Regression guard: single-run filtering broken.
     */
    it('calls executeCode with one case when running a single test', async () => {
      mockGetStudentWork.mockResolvedValue(fakeStudentWork);
      mockExecuteCode.mockResolvedValue({
        results: [{ kind: 'io', name: 'case-1', status: 'passed', time_ms: 5 }],
        summary: { total: 1, passed: 1, failed: 0, errors: 0, run: 0, time_ms: 5 },
      });

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
      });

      await act(async () => {
        screen.getByTestId('run-single-btn').click();
      });

      await waitFor(() => {
        expect(mockExecuteCode).toHaveBeenCalledTimes(1);
      });

      const [, , options] = mockExecuteCode.mock.calls[0];
      expect(options.cases).toHaveLength(1);
    });
  });

  describe('TC4: Debug from rail triggers useApiDebugger and sets drawer mode=debug', () => {
    /**
     * Contract: clicking "Debug" on a test row invokes requestTrace and sets
     * drawer mode to 'debug'. Regression guard: debug trigger wiring broken.
     */
    it('invokes requestTrace when Debug is clicked', async () => {
      mockGetStudentWork.mockResolvedValue(fakeStudentWork);
      mockRequestTrace.mockResolvedValue(undefined);

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
      });

      await act(async () => {
        screen.getByTestId('debug-test-btn').click();
      });

      await waitFor(() => {
        expect(mockRequestTrace).toHaveBeenCalledTimes(1);
      });
    });

    it('sets drawer mode to debug after requestTrace is called', async () => {
      const { useApiDebugger } = require('@/hooks/useApiDebugger');
      // Simulate debugger having an active trace
      useApiDebugger.mockReturnValue({
        ...mockDebuggerState,
        trace: { steps: [{ line: 1, event: 'line', locals: {}, globals: {}, call_stack: [], stdout: '' }], total_steps: 1, exit_code: 0 },
        hasTrace: true,
        getCurrentStep: () => ({ line: 1, event: 'line', locals: {}, globals: {}, call_stack: [], stdout: '' }),
        getCurrentLocals: () => ({}),
        getCurrentCallStack: () => [],
        getPreviousStep: () => null,
      });

      mockGetStudentWork.mockResolvedValue(fakeStudentWork);

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
      });

      expect(screen.getByTestId('drawer-mode').textContent).toBe('debug');
    });

    it('renders Exit Debug button in drawerCloseAction when hasTrace is true, and reset() is called on click', async () => {
      /**
       * Contract: when debuggerHook.hasTrace is true the student page passes a
       * drawerCloseAction that renders a [data-testid="debug-exit"] button. Clicking
       * it calls debuggerHook.reset(). Regression guard: drawerCloseAction omitted or
       * reset not wired would leave the user stuck in debug mode with no exit affordance.
       */
      const mockReset = jest.fn();
      const { useApiDebugger } = require('@/hooks/useApiDebugger');
      useApiDebugger.mockReturnValue({
        ...mockDebuggerState,
        hasTrace: true,
        reset: mockReset,
        getCurrentStep: () => ({ line: 1, event: 'line', locals: {}, globals: {}, call_stack: [], stdout: '' }),
      });

      mockGetStudentWork.mockResolvedValue(fakeStudentWork);

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
      });

      // The Exit Debug button should be rendered inside drawerCloseAction
      const exitBtn = screen.getByTestId('debug-exit');
      expect(exitBtn).toBeInTheDocument();

      await act(async () => {
        exitBtn.click();
      });

      expect(mockReset).toHaveBeenCalledTimes(1);
    });

    it('does not render Exit Debug button when hasTrace is false', async () => {
      /**
       * Contract: drawerCloseAction is undefined when hasTrace is false, so the
       * debug-exit button should not appear. Regression guard: stale close action
       * rendered when not debugging would confuse students.
       */
      mockGetStudentWork.mockResolvedValue(fakeStudentWork);

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('debug-exit')).toBeNull();
    });
  });

  describe('TC5: Run failure populates drawer mode=failure', () => {
    /**
     * Contract: when executeCode returns a failing io case and user focuses it,
     * drawer mode switches to 'failure'. Regression guard: failure inspector not shown.
     */
    it('sets drawerMode to output after a run completes (with failure)', async () => {
      mockGetStudentWork.mockResolvedValue(fakeStudentWork);
      mockExecuteCode.mockResolvedValue({
        results: [
          {
            kind: 'io',
            name: 'case-1',
            status: 'failed',
            input: '1 2',
            expected: '3',
            actual: '99',
            time_ms: 5,
          },
        ],
        summary: { total: 1, passed: 0, failed: 1, errors: 0, run: 0, time_ms: 5 },
      });

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
      });

      await act(async () => {
        screen.getByTestId('run-all-btn').click();
      });

      await waitFor(() => {
        expect(mockExecuteCode).toHaveBeenCalledTimes(1);
      });

      // After run, drawer mode should reflect the execution result (output or failure)
      // After run with a failure, drawer mode should be 'output' (result is available).
      // The mode becomes 'failure' only after the user explicitly selects the failing test.
      await waitFor(() => {
        const mode = screen.getByTestId('drawer-mode').textContent;
        expect(mode).toBe('output');
      });
    });
  });

  describe('TC6: Code change autosaves with 500ms debounce', () => {
    /**
     * Contract: when onChangeCode is called, the page debounces a PUT to
     * updateStudentWork at 500ms. Regression guard: autosave behavior lost.
     */
    it('autosaves code change in practice mode after debounce', async () => {
      jest.useFakeTimers();

      mockGetStudentWork.mockResolvedValue(fakeStudentWork);

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
      });

      // Simulate code change via the captured onChangeCode callback
      await act(async () => {
        capturedShellProps?.onChangeCode?.('main', 'print("new code")');
      });

      // Before debounce expires, no save
      expect(mockUpdateStudentWork).not.toHaveBeenCalled();

      // Advance past debounce
      await act(async () => {
        jest.advanceTimersByTime(600);
      });

      expect(mockUpdateStudentWork).toHaveBeenCalledWith(
        'work-123',
        expect.objectContaining({ code: 'print("new code")' })
      );

      jest.useRealTimers();
    });
  });

  describe('TC7: Live mode receives realtime test_cases update', () => {
    /**
     * Contract: when useRealtimeSession provides updated test_cases, the rail
     * re-renders with the new cases. Regression guard: realtime → rail broken.
     */
    it('updates rail with realtime test_cases from session', async () => {
      const realtimeSession = {
        ...defaultRealtimeSession,
        session: {
          status: 'active',
          test_cases: [
            {
              kind: 'io' as const,
              name: 'realtime-case',
              input: '42',
              expected_output: '42',
              match_type: 'exact',
              order: 0,
            },
          ],
        },
        joinSession: mockJoinSession,
      };
      mockUseRealtimeSession.mockReturnValue(realtimeSession);

      mockGetStudentWork.mockResolvedValue(fakeStudentWork);
      // Section pointer set → live mode; the page joins the pointer's session.
      mockGetSection.mockResolvedValue({
        id: 'section-1',
        name: 'Test Section',
        current_session_id: 'session-1',
      });
      mockJoinSession.mockResolvedValue({
        code: 'print("hello")',
        test_cases: [
          {
            kind: 'io' as const,
            name: 'realtime-case',
            input: '42',
            expected_output: '42',
            match_type: 'exact',
            order: 0,
          },
        ],
      });

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
      });

      // After joining, the session's test_cases should be in the rail
      await waitFor(() => {
        const tests = capturedShellProps?.tests;
        expect(tests).toBeDefined();
        expect(tests?.some((t) => t.name === 'realtime-case')).toBe(true);
      });
    });
  });

  describe('C2: Run single test at index N — result attributed to row N, not row 0', () => {
    /**
     * Contract: when running the test at index 2, the returned result (in results[0]
     * from the API) must be attributed to rail row 2, not row 0. The fix requires a
     * sparse results array where position N holds the result and positions 0..N-1 are
     * undefined. If broken, test at index 2 shows its pass/fail dot on the first row.
     */
    it('running test at index 2 sets state=pass on row 2, not row 0', async () => {
      mockGetStudentWork.mockResolvedValue(fakeStudentWorkThreeCases);
      // The API returns exactly 1 result — for the single case that was run
      mockExecuteCode.mockResolvedValue({
        results: [{ kind: 'io', name: 'case-3', status: 'passed', time_ms: 5 }],
        summary: { total: 1, passed: 1, failed: 0, errors: 0, run: 0, time_ms: 5 },
      });

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
      });

      // Wait for the 3rd test button to appear (fixture has 3 cases)
      await waitFor(() => {
        expect(screen.getByTestId('run-third-btn')).toBeInTheDocument();
      });

      await act(async () => {
        screen.getByTestId('run-third-btn').click();
      });

      await waitFor(() => {
        expect(mockExecuteCode).toHaveBeenCalledTimes(1);
      });

      // Row 2 should be 'pass'; rows 0 and 1 should remain 'idle'
      await waitFor(() => {
        const tests = capturedShellProps?.tests;
        expect(tests?.[2]?.state).toBe('pass');
        expect(tests?.[0]?.state).toBe('idle');
        expect(tests?.[1]?.state).toBe('idle');
      });
    });
  });

  describe('C3: Runtime error sets drawerMode to runtime-error', () => {
    /**
     * Contract: when executeCode rejects with a non-503 error, the student page
     * sets runtimeError state, which causes deriveDrawerMode to return 'runtime-error'.
     * If broken, runtime errors fall through to the generic ErrorAlert instead of
     * the drawer's runtime-error mode — students see the wrong UI.
     */
    it('sets drawerMode=runtime-error when execution throws a non-503 error', async () => {
      mockGetStudentWork.mockResolvedValue(fakeStudentWork);
      mockExecuteCode.mockRejectedValue(new Error('Traceback (most recent call last): NameError'));

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
      });

      await act(async () => {
        screen.getByTestId('run-all-btn').click();
      });

      await waitFor(() => {
        expect(mockExecuteCode).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        const mode = screen.getByTestId('drawer-mode').textContent;
        expect(mode).toBe('runtime-error');
      });
    });
  });
});

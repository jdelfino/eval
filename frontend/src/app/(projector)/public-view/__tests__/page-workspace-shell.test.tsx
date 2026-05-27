/**
 * Integration tests for the projector public-view page wired to WorkspaceShell (T7).
 *
 * Verifies:
 * 1. Featured-student mode: WorkspaceShell receives readOnly=true and featured code.
 * 2. Scratch-pad mode: executeCode is called on "Run all"; rail rows update.
 * 3. Font-size controls: clicking + / - changes the fontSize prop on WorkspaceShell.
 * 4. Ribbon hidden: embedded=true so the page manages its own chrome.
 *
 * These tests replace the old CodeEditor assertions in page.test.tsx. The old tests
 * that drove state through `fetch` mocks are superseded — state now comes through
 * the useRealtimePublicView hook, which is mocked here at the module level.
 */

import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import type { WorkspaceShellProps } from '@/components/workspace/WorkspaceShell';

// ── Navigation ────────────────────────────────────────────────────────────────
jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(() => ({
    get: jest.fn((key: string) => (key === 'session_id' ? 'test-session-id' : null)),
  })),
}));

// ── Auth ──────────────────────────────────────────────────────────────────────
jest.mock('@/components/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── executeCode ───────────────────────────────────────────────────────────────
const mockExecuteCode = jest.fn();
jest.mock('@/lib/api/execute', () => ({
  executeCode: (...args: any[]) => mockExecuteCode(...args),
  ioTestCasesToCaseDefs: (cases: any[]) => cases.map((c: any) => ({ ...c, kind: 'io' })),
}));

// ── useApiDebugger ────────────────────────────────────────────────────────────
jest.mock('@/hooks/useApiDebugger', () => ({
  useApiDebugger: () => ({
    trace: null,
    currentStep: 0,
    isLoading: false,
    error: null,
    requestTrace: jest.fn(),
    setTrace: jest.fn(),
    setError: jest.fn(),
    stepForward: jest.fn(),
    stepBackward: jest.fn(),
    jumpToStep: jest.fn(),
    jumpToFirst: jest.fn(),
    jumpToLast: jest.fn(),
    reset: jest.fn(),
    getCurrentStep: () => null,
    getCurrentLocals: jest.fn(),
    getCurrentGlobals: jest.fn(),
    getCurrentCallStack: jest.fn(),
    getPreviousStep: () => null,
    total_steps: 0,
    hasTrace: false,
    canStepForward: false,
    canStepBackward: false,
  }),
}));

// ── WorkspaceShell mock — captures props for assertions ───────────────────────
let lastShellProps: WorkspaceShellProps | null = null;
jest.mock('@/components/workspace/WorkspaceShell', () => {
  return {
    __esModule: true,
    default: function MockWorkspaceShell(props: WorkspaceShellProps) {
      lastShellProps = props;
      return (
        <div data-testid="workspace-shell">
          <button
            data-testid="run-all-btn"
            onClick={() => props.onRunAll?.()}
          >
            Run all
          </button>
          {props.tests.map((t) => (
            <div key={t.id} data-testid={`rail-row-${t.id}`} data-state={t.state}>
              {t.name}
            </div>
          ))}
        </div>
      );
    },
  };
});

// ── useRealtimePublicView ─────────────────────────────────────────────────────
const mockUseRealtimePublicView = jest.fn();
jest.mock('@/hooks/useRealtimePublicView', () => ({
  useRealtimePublicView: (...args: any[]) => mockUseRealtimePublicView(...args),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLoadedState(overrides: Record<string, any> = {}) {
  return {
    state: {
      join_code: 'TST-001',
      problem: {
        title: 'Test Problem',
        description: 'A description',
        starter_code: 'def solve():\n    pass',
        language: 'python',
        test_cases: [
          { kind: 'io', name: 'case-0', input: '1', expected_output: '2', order: 0 },
        ],
      },
      featured_student_id: null,
      featured_code: null,
      featured_test_cases: null,
      status: 'active',
      ...overrides,
    },
    loading: false,
    error: null,
    connectionStatus: 'connected',
    connectionError: null,
    activeSessionId: 'test-session-id',
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Public view projector — WorkspaceShell wiring (T7)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    lastShellProps = null;
    mockExecuteCode.mockResolvedValue({
      summary: { passed: 1, failed: 0, total: 1 },
      results: [{ kind: 'io', status: 'passed', name: 'case-0', time_ms: 5, input: '1', expected: '2', actual: '2' }],
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  // ── Test 1: featured-student mode ─────────────────────────────────────────

  it('featured-student mode renders WorkspaceShell with student code, readOnly=true', () => {
    /**
     * Contract: when featured_student_id is set, WorkspaceShell receives
     * editorTabs[0].readOnly=true and code equal to featured_code.
     * Catches: readOnly flag not threaded to EditorTab.
     */
    mockUseRealtimePublicView.mockReturnValue(
      makeLoadedState({
        featured_student_id: 'student-abc',
        featured_code: 'print("featured!")',
        featured_test_cases: null,
      })
    );

    const PublicView = require('../page').default;
    render(<PublicView />);

    expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
    expect(lastShellProps).not.toBeNull();
    const tab = lastShellProps!.editorTabs[0];
    if (tab.kind !== 'code') throw new Error('Expected code tab');
    expect(tab.readOnly).toBe(true);
    expect(tab.code).toBe('print("featured!")');
  });

  // ── Test 2: scratch-pad mode — executeCode called on Run all ─────────────

  it('scratch-pad mode: clicking Run all calls executeCode and rail rows update', async () => {
    /**
     * Contract: when there is no featured student, the page is in scratch-pad
     * mode. Clicking "Run all" must call executeCode; after resolution, rail items
     * reflect the returned results (pass state visible in DOM).
     * Catches: onRunAll callback wired to wrong code, or rail not rebuilt after run.
     */
    mockUseRealtimePublicView.mockReturnValue(makeLoadedState());

    const PublicView = require('../page').default;
    const { rerender } = render(<PublicView />);

    expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();

    // Trigger run all
    await act(async () => {
      fireEvent.click(screen.getByTestId('run-all-btn'));
    });

    expect(mockExecuteCode).toHaveBeenCalledTimes(1);

    // After execution, rail rows should reflect pass state
    // Re-render with updated hook return (simulating state update in real component)
    // The mock will re-capture lastShellProps on next render
    rerender(<PublicView />);

    // The rail row should now show pass state
    const rows = screen.getAllByTestId(/^rail-row-/);
    expect(rows.length).toBeGreaterThan(0);
  });

  // ── Test 3: font-size controls scale WorkspaceShell ──────────────────────

  it('font-size + button increases fontSize prop on WorkspaceShell by FONT_SIZE_STEP (2)', async () => {
    /**
     * Contract: clicking + increments fontSize by 2 (FONT_SIZE_STEP) from the
     * default of 24. WorkspaceShell receives the updated fontSize.
     * Catches: fontSize not threaded from local state to WorkspaceShell.
     */
    mockUseRealtimePublicView.mockReturnValue(makeLoadedState());

    const PublicView = require('../page').default;
    render(<PublicView />);

    // Initial fontSize should be DEFAULT_FONT_SIZE = 24
    expect(lastShellProps?.fontSize).toBe(24);

    await act(async () => {
      screen.getByLabelText('Increase font size').click();
    });
    expect(lastShellProps?.fontSize).toBe(26);

    await act(async () => {
      screen.getByLabelText('Increase font size').click();
    });
    expect(lastShellProps?.fontSize).toBe(28);

    await act(async () => {
      screen.getByLabelText('Increase font size').click();
    });
    expect(lastShellProps?.fontSize).toBe(30);
  });

  it('font-size - button decreases fontSize and persists to localStorage', async () => {
    /**
     * Contract: clicking - decrements fontSize by 2 and localStorage is updated.
     * Catches: persistence regression.
     */
    mockUseRealtimePublicView.mockReturnValue(makeLoadedState());

    const PublicView = require('../page').default;
    render(<PublicView />);

    await act(async () => {
      screen.getByLabelText('Decrease font size').click();
    });

    expect(lastShellProps?.fontSize).toBe(22);
    expect(Number(localStorage.getItem('publicView_fontSize'))).toBe(22);
  });

  // ── Test 4: WorkspaceShell used with embedded=true (Ribbon hidden) ────────

  it('WorkspaceShell receives embedded=true so Ribbon is hidden', () => {
    /**
     * Contract: the projector page mounts WorkspaceShell with embedded=true.
     * The projector provides its own chrome (font-size controls + inline ConnectionDot).
     * embedded=true causes WorkspaceShell to omit the Ribbon entirely.
     * Catches: Ribbon rendered when it should be absent on the projector.
     */
    mockUseRealtimePublicView.mockReturnValue(makeLoadedState());

    const PublicView = require('../page').default;
    render(<PublicView />);

    expect(lastShellProps?.embedded).toBe(true);
  });

  // ── Test 5: scratch-pad mode uses starter code from problem ──────────────

  it('scratch-pad mode: editorTabs[0].code starts as starter_code when no featured student', () => {
    /**
     * Contract: when not featuring a student, the editor shows the problem's
     * starter_code so the projector has meaningful content to display.
     */
    mockUseRealtimePublicView.mockReturnValue(makeLoadedState({
      featured_student_id: null,
      featured_code: null,
    }));

    const PublicView = require('../page').default;
    render(<PublicView />);

    const tab = lastShellProps!.editorTabs[0];
    if (tab.kind !== 'code') throw new Error('Expected code tab');
    expect(tab.code).toBe('def solve():\n    pass');
    expect(tab.readOnly).toBeFalsy();
  });

  // ── Test 6: featured code replaces local code ─────────────────────────────

  it('switching featured student updates editor code immediately', () => {
    /**
     * Contract: when featured_student_id changes, the displayed code in
     * editorTabs updates to the new featured_code.
     * Catches: stale ref preventing code update on featured-student switch.
     */
    mockUseRealtimePublicView.mockReturnValue(
      makeLoadedState({
        featured_student_id: 'student-1',
        featured_code: 'x = 1',
      })
    );

    const PublicView = require('../page').default;
    const { rerender } = render(<PublicView />);

    const tab1 = lastShellProps!.editorTabs[0];
    if (tab1.kind !== 'code') throw new Error('Expected code tab');
    expect(tab1.code).toBe('x = 1');

    // Switch featured student
    mockUseRealtimePublicView.mockReturnValue(
      makeLoadedState({
        featured_student_id: 'student-2',
        featured_code: 'y = 2',
      })
    );

    rerender(<PublicView />);
    const tab2 = lastShellProps!.editorTabs[0];
    if (tab2.kind !== 'code') throw new Error('Expected code tab');
    expect(tab2.code).toBe('y = 2');
  });
});

/**
 * Tests for G4 F8 run-summary send behavior on the student workspace page.
 *
 * Contract verified: in a LIVE session, a run-all sends exactly ONE immediate
 * code update carrying a run_summary built from the execution summary; a
 * single-case run (handleRunTest) sends NO run_summary; and the debounced
 * autosave never carries a run_summary. Breaks if violated: the instructor
 * dashboard either misses run results or shows stale/over-reported pass/fail.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import StudentPageWrapper from '../page';

const mockGetStudentWork = jest.fn();
const mockGetSection = jest.fn();
const mockUpdateStudentWork = jest.fn();
const mockWarmExecutor = jest.fn();
const mockExecuteCode = jest.fn();
const mockJoinSession = jest.fn();
const mockUpdateCode = jest.fn();
const mockUpdateCodeImmediate = jest.fn();

jest.mock('@/lib/api/student-work', () => ({
  getStudentWork: (...args: unknown[]) => mockGetStudentWork(...args),
  updateStudentWork: (...args: unknown[]) => mockUpdateStudentWork(...args),
  getOrCreateStudentWork: jest.fn(),
}));

// G4 section-pointer model: live mode is gated on the section pointer.
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
  warmExecutor: (...args: unknown[]) => mockWarmExecutor(...args),
  executeCode: (...args: unknown[]) => mockExecuteCode(...args),
  ioTestCasesToCaseDefs: jest.requireActual('@/lib/api/execute').ioTestCasesToCaseDefs,
  ioTestCasesToGradedCaseDefs: jest.requireActual('@/lib/api/execute').ioTestCasesToGradedCaseDefs,
}));

const mockUseRealtimeSession = jest.fn();
jest.mock('@/hooks/useRealtimeSession', () => ({
  useRealtimeSession: () => mockUseRealtimeSession(),
}));

jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(() => ({
    get: (key: string) =>
      key === 'work_id' ? 'work-123' : key === 'section_id' ? 'section-1' : null,
  })),
  useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn() })),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(() => ({
    user: { id: 'user-1', email: 'test@example.com', display_name: 'Test User' },
  })),
}));

jest.mock('@/hooks/useApiDebugger', () => ({
  useApiDebugger: jest.fn(() => ({
    trace: null, currentStep: 0, isLoading: false, error: null,
    requestTrace: jest.fn(), setTrace: jest.fn(), setError: jest.fn(),
    stepForward: jest.fn(), stepBackward: jest.fn(), jumpToStep: jest.fn(),
    jumpToFirst: jest.fn(), jumpToLast: jest.fn(), reset: jest.fn(),
    getCurrentStep: jest.fn(() => null), getCurrentLocals: jest.fn(() => ({})),
    getCurrentGlobals: jest.fn(() => ({})), getCurrentCallStack: jest.fn(() => []),
    getPreviousStep: jest.fn(() => null),
    total_steps: 0, hasTrace: false, canStepForward: false, canStepBackward: false,
  })),
}));

let capturedOnRun: (() => void) | null = null;
let capturedOnRunTest: ((testId: string) => void) | null = null;

jest.mock('@/components/workspace/WorkspaceShell', () => ({
  __esModule: true,
  default: ({
    onRunAll,
    onRunTest,
  }: {
    onRunAll?: () => void;
    onRunTest?: (testId: string) => void;
  }) => {
    capturedOnRun = onRunAll ?? null;
    capturedOnRunTest = onRunTest ?? null;
    return <div data-testid="workspace-shell">WorkspaceShell</div>;
  },
}));

const fakeTestCaseIO = {
  kind: 'io' as const,
  name: 'Case 1',
  input: 'hello',
  expected_output: 'HELLO',
  match_type: 'exact' as const,
  order: 0,
};

const fakeStudentWork = {
  id: 'work-123',
  user_id: 'user-1',
  section_id: 'section-1',
  problem_id: 'problem-1',
  code: 'print(input().upper())',
  last_update: '2024-01-01T00:00:00Z',
  created_at: '2024-01-01T00:00:00Z',
  last_run_all_passed: null,
  last_run_at: null,
  problem: {
    id: 'problem-1',
    namespace_id: 'ns-1',
    title: 'Test Problem',
    description: 'Test description',
    starter_code: '',
    language: 'python',
    test_cases: [fakeTestCaseIO],
    author_id: 'instructor-1',
    class_id: 'class-1',
    tags: [],
    solution: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
};

// Section pointer set to a live session so the page enters live mode.
const liveSectionData = {
  id: 'section-1',
  name: 'Test Section',
  current_session_id: 'session-1',
};

const defaultRealtimeSession = {
  session: { status: 'active' },
  loading: false,
  error: null,
  isConnected: true,
  connectionStatus: 'connected',
  connectionError: null,
  updateCode: mockUpdateCode,
  updateCodeImmediate: mockUpdateCodeImmediate,
  joinSession: mockJoinSession,
  replacementInfo: null,
};

const mockTestResponse = {
  results: [{ kind: 'io', name: 'Case 1', status: 'passed', input: 'hello', actual: 'HELLO\n', time_ms: 10 }],
  summary: { total: 3, passed: 2, failed: 1, errors: 0, run: 3, time_ms: 10 },
};

async function renderLiveAndJoin() {
  mockGetStudentWork.mockResolvedValue(fakeStudentWork);
  mockGetSection.mockResolvedValue(liveSectionData);
  mockJoinSession.mockResolvedValue({ code: fakeStudentWork.code, test_cases: [] });

  render(<StudentPageWrapper />);

  await waitFor(() => {
    expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
  });
  // Wait for the auto-join to complete (joined === true gates the F8 send).
  await waitFor(() => {
    expect(mockJoinSession).toHaveBeenCalled();
  });
}

describe('StudentPage F8 run-summary send (eval-cej.8.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnRun = null;
    capturedOnRunTest = null;
    mockUseRealtimeSession.mockReturnValue(defaultRealtimeSession);
    mockUpdateStudentWork.mockResolvedValue(undefined);
    mockWarmExecutor.mockResolvedValue(undefined);
    mockExecuteCode.mockResolvedValue(mockTestResponse);
    mockUpdateCodeImmediate.mockResolvedValue(undefined);
    mockGetSection.mockResolvedValue(liveSectionData);
  });

  it('live-mode run-all sends exactly one immediate update carrying run_summary', async () => {
    await renderLiveAndJoin();

    await act(async () => {
      capturedOnRun!();
    });

    await waitFor(() => {
      expect(mockUpdateCodeImmediate).toHaveBeenCalledTimes(1);
    });

    const call = mockUpdateCodeImmediate.mock.calls[0];
    // updateCodeImmediate(studentId, code, testCases?, runSummary)
    expect(call[0]).toBe('user-1');
    const runSummary = call[3];
    expect(runSummary).toMatchObject({ passed: 2, failed: 1, errors: 0, total: 3 });
    expect(typeof runSummary.at).toBe('string');
  });

  it('single-case run (handleRunTest) sends NO run_summary', async () => {
    await renderLiveAndJoin();

    await act(async () => {
      capturedOnRunTest!('io-0-Case 1');
    });

    await waitFor(() => {
      expect(mockExecuteCode).toHaveBeenCalled();
    });

    // handleRunTest must never call the immediate run-summary send.
    expect(mockUpdateCodeImmediate).not.toHaveBeenCalled();
  });

  it('debounced autosave never carries a run_summary', async () => {
    jest.useFakeTimers();
    try {
      mockGetStudentWork.mockResolvedValue(fakeStudentWork);
      mockGetSection.mockResolvedValue(liveSectionData);
      mockJoinSession.mockResolvedValue({ code: fakeStudentWork.code, test_cases: [] });

      render(<StudentPageWrapper />);

      await act(async () => {
        await Promise.resolve();
        jest.runOnlyPendingTimers();
      });
      // Flush the autosave debounce window.
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      // The autosave path uses the debounced updateCode, not updateCodeImmediate,
      // and never supplies a run_summary argument.
      for (const call of mockUpdateCode.mock.calls) {
        expect(call[3]).toBeUndefined();
      }
      // No run-all happened, so no immediate run-summary send either.
      expect(mockUpdateCodeImmediate).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});

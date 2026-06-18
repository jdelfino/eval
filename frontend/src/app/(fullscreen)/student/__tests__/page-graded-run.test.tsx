/**
 * Tests for graded run plumbing on the student workspace page.
 *
 * eval-cej.7.13 (A2b): verifies that:
 * 1. handleRun (run-all) uses ioTestCasesToGradedCaseDefs and passes studentWorkId.
 * 2. handleRunTest (single-case) does NOT pass studentWorkId.
 *
 * Contract: run-all sends student_work_id + full case data (expected_output preserved)
 * so the backend can persist solved state. Single-case debug runs must never clobber it.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import StudentPageWrapper from '../page';

const mockGetStudentWork = jest.fn();
const mockGetActiveSessions = jest.fn();
const mockUpdateStudentWork = jest.fn();
const mockWarmExecutor = jest.fn();
const mockExecuteCode = jest.fn();
const mockJoinSession = jest.fn();
const mockUpdateCode = jest.fn();

jest.mock('@/lib/api/student-work', () => ({
  getStudentWork: (...args: unknown[]) => mockGetStudentWork(...args),
  updateStudentWork: (...args: unknown[]) => mockUpdateStudentWork(...args),
}));

jest.mock('@/lib/api/sections', () => ({
  getActiveSessions: (...args: unknown[]) => mockGetActiveSessions(...args),
  getSection: jest.fn().mockResolvedValue({
    id: 'section-1',
    name: 'Test Section',
  }),
}));

jest.mock('@/lib/api/execute', () => ({
  warmExecutor: (...args: unknown[]) => mockWarmExecutor(...args),
  executeCode: (...args: unknown[]) => mockExecuteCode(...args),
  // Re-export the real helpers so page.tsx can call them during tests
  ioTestCasesToCaseDefs: jest.requireActual('@/lib/api/execute').ioTestCasesToCaseDefs,
  ioTestCasesToGradedCaseDefs: jest.requireActual('@/lib/api/execute').ioTestCasesToGradedCaseDefs,
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

// Capture callback refs from WorkspaceShell
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

const mockTestResponse = {
  results: [{ kind: 'io', name: 'Case 1', status: 'passed', input: 'hello', actual: 'HELLO\n', time_ms: 10 }],
  summary: { total: 1, passed: 1, failed: 0, errors: 0, run: 0, time_ms: 10 },
};

describe('StudentPage graded run plumbing (eval-cej.7.13)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnRun = null;
    capturedOnRunTest = null;
    mockUseRealtimeSession.mockReturnValue(defaultRealtimeSession);
    mockUpdateStudentWork.mockResolvedValue(undefined);
    mockWarmExecutor.mockResolvedValue(undefined);
    mockExecuteCode.mockResolvedValue(mockTestResponse);
  });

  describe('TC2: run-all sends studentWorkId + graded case defs', () => {
    /**
     * Contract: when workId is set, handleRun passes studentWorkId to executeCode
     * and uses ioTestCasesToGradedCaseDefs (which preserves expected_output).
     * Matters because without studentWorkId the backend cannot persist solved state,
     * and without expected_output the backend cannot confirm coverage.
     * Breaks if: studentWorkId is omitted, or ioTestCasesToCaseDefs is used instead.
     */
    it('run-all calls executeCode with studentWorkId=work-123 when workId is set', async () => {
      mockGetStudentWork.mockResolvedValue(fakeStudentWork);
      mockGetActiveSessions.mockResolvedValue([]);

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
      });

      expect(capturedOnRun).not.toBeNull();
      act(() => {
        capturedOnRun!();
      });

      await waitFor(() => {
        expect(mockExecuteCode).toHaveBeenCalled();
      });

      const [, , options] = mockExecuteCode.mock.calls[0];
      expect(options).toHaveProperty('studentWorkId', 'work-123');
    });

    it('run-all sends graded case defs with expected_output preserved', async () => {
      mockGetStudentWork.mockResolvedValue(fakeStudentWork);
      mockGetActiveSessions.mockResolvedValue([]);

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
      });

      act(() => {
        capturedOnRun!();
      });

      await waitFor(() => {
        expect(mockExecuteCode).toHaveBeenCalled();
      });

      const [, , options] = mockExecuteCode.mock.calls[0];
      expect(options.cases).toBeDefined();
      // Graded case defs preserve the canonical name and expected_output
      const ioCase = options.cases.find((c: { kind?: string }) => c.kind !== 'pytest');
      expect(ioCase).toBeDefined();
      expect(ioCase).toHaveProperty('expected_output', 'HELLO');
      // Name must NOT be renamed to 'run'
      expect(ioCase.name).not.toBe('run');
    });
  });

  describe('TC3: single-case handleRunTest does NOT send studentWorkId', () => {
    /**
     * Contract: handleRunTest (single-case debug run) must never pass studentWorkId.
     * Matters because single-case runs are not full graded runs and must not clobber
     * the persisted solved state on the backend.
     * Breaks if: studentWorkId is inadvertently forwarded from the handler.
     */
    it('handleRunTest calls executeCode WITHOUT studentWorkId', async () => {
      mockGetStudentWork.mockResolvedValue(fakeStudentWork);
      mockGetActiveSessions.mockResolvedValue([]);

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
      });

      expect(capturedOnRunTest).not.toBeNull();
      // testId for the first io test case with order=0 and name='Case 1'
      // The format from toTestRailItems is `${kind}-${order}-${name}`
      act(() => {
        capturedOnRunTest!('io-0-Case 1');
      });

      await waitFor(() => {
        expect(mockExecuteCode).toHaveBeenCalled();
      });

      const [, , options] = mockExecuteCode.mock.calls[0];
      expect(options).not.toHaveProperty('studentWorkId');
    });
  });
});

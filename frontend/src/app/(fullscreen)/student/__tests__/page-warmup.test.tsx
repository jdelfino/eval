/**
 * Tests for the executor warm-up UX on the student workspace page.
 *
 * PLAT-6nij.4: Proactive /warm calls on practice entry and warming-up message on 503.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import StudentPageWrapper from '../page';
import { ApiError } from '@/lib/api-error';

const mockGetStudentWork = jest.fn();
const mockGetSection = jest.fn();
const mockUpdateStudentWork = jest.fn();
const mockWarmExecutor = jest.fn();
const mockExecuteCode = jest.fn();
const mockJoinSession = jest.fn();
const mockUpdateCode = jest.fn();

jest.mock('@/lib/api/student-work', () => ({
  getStudentWork: (...args: unknown[]) => mockGetStudentWork(...args),
  updateStudentWork: (...args: unknown[]) => mockUpdateStudentWork(...args),
  getOrCreateStudentWork: jest.fn(),
}));

// G4 section-pointer model: live-vs-practice is gated on current_session_id.
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

// Track onRunAll callback and drawerMode from WorkspaceShell
let capturedOnRun: (() => void) | null = null;
let capturedDrawerMode: string | null = null;

jest.mock('@/components/workspace/WorkspaceShell', () => ({
  __esModule: true,
  default: ({ onRunAll, drawerMode }: { onRunAll: () => void; drawerMode?: string }) => {
    capturedOnRun = onRunAll;
    capturedDrawerMode = drawerMode ?? null;
    return (
      <div data-testid="workspace-shell">
        <div data-testid="drawer-mode">{drawerMode}</div>
        WorkspaceShell
      </div>
    );
  },
}));

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
    title: 'Test Problem',
    description: 'Test description',
    starter_code: '',
    language: 'python',
    test_cases: null,
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

describe('StudentPage warm-up UX (PLAT-6nij.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnRun = null;
    capturedDrawerMode = null;
    mockUseRealtimeSession.mockReturnValue(defaultRealtimeSession);
    mockUpdateStudentWork.mockResolvedValue(undefined);
    mockWarmExecutor.mockResolvedValue(undefined);
    // Default: no pointer → practice mode.
    mockGetSection.mockResolvedValue({ id: 'section-1', name: 'Test Section', current_session_id: null });
  });

  describe('warmExecutor called on practice mode entry', () => {
    it('calls warmExecutor when no active session is found (practice mode)', async () => {
      mockGetStudentWork.mockResolvedValue(fakeStudentWork);

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
      });

      expect(mockWarmExecutor).toHaveBeenCalledTimes(1);
    });

    it('does not call warmExecutor when the pointer matches the opened problem (live mode)', async () => {
      mockGetStudentWork.mockResolvedValue(fakeStudentWork);
      // Pointer set AND its problem == the opened work's problem → live mode
      // (no executor warm-up needed). This is the B1 problem-identity gate's
      // matching case.
      mockGetSection.mockResolvedValue({
        id: 'section-1',
        name: 'Test Section',
        current_session_id: 'session-1',
        current_problem_id: 'problem-1',
      });
      mockJoinSession.mockResolvedValue({ code: 'print("hello")', test_cases: null });
      mockUseRealtimeSession.mockReturnValue({
        ...defaultRealtimeSession,
        joinSession: mockJoinSession,
      });

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(mockGetSection).toHaveBeenCalledWith('section-1');
      });

      // Give a moment for effects to settle
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(mockWarmExecutor).not.toHaveBeenCalled();
      expect(mockJoinSession).toHaveBeenCalled();
    });

    it('stays in practice mode (and does NOT join) when the pointer is a DIFFERENT problem (B1 gate)', async () => {
      // Regression for silent cross-problem corruption: a student opens a
      // non-live published problem (problem-1) while the section pointer points
      // at a DIFFERENT live problem (problem-OTHER). The page must NOT join the
      // live session — otherwise the student's code is autosaved under the wrong
      // problem. It must enter practice mode for the opened problem instead.
      mockGetStudentWork.mockResolvedValue(fakeStudentWork); // problem_id: 'problem-1'
      mockGetSection.mockResolvedValue({
        id: 'section-1',
        name: 'Test Section',
        current_session_id: 'session-live',
        current_problem_id: 'problem-OTHER',
      });
      mockJoinSession.mockResolvedValue({ code: 'x', test_cases: null });
      mockUseRealtimeSession.mockReturnValue({
        ...defaultRealtimeSession,
        joinSession: mockJoinSession,
      });

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
      });

      // Practice mode: executor warmed, live session NOT joined.
      expect(mockWarmExecutor).toHaveBeenCalledTimes(1);
      expect(mockJoinSession).not.toHaveBeenCalled();
    });

    it('does not block page load or show errors if warmExecutor fails', async () => {
      mockGetStudentWork.mockResolvedValue(fakeStudentWork);
      mockWarmExecutor.mockRejectedValue(new Error('Network error'));

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
      });

      // Page should load successfully despite warmExecutor failing
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  describe('503 warming-up message on execute', () => {
    it('shows warming-up message when execute returns 503', async () => {
      mockGetStudentWork.mockResolvedValue(fakeStudentWork);
      mockExecuteCode.mockRejectedValue(
        new ApiError('Code execution is warming up, please try again in a few moments', 503)
      );

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
      });

      // Trigger execution
      act(() => {
        capturedOnRun?.();
      });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      const alert = screen.getByRole('alert');
      expect(alert.textContent).toMatch(/warming up/i);
    });

    it('routes non-503 errors to drawer runtime-error mode (not generic alert)', async () => {
      /**
       * C3 fix: non-503 errors now call setRuntimeError (not setError), which causes
       * drawerMode='runtime-error' and the WorkspaceShell drawer to show the error.
       * Previously, non-503 errors were shown via a generic ErrorAlert — this was wrong
       * because runtime errors (NameError, SyntaxError etc.) belong in the drawer.
       */
      mockGetStudentWork.mockResolvedValue(fakeStudentWork);
      mockExecuteCode.mockRejectedValue(
        new ApiError('internal server error', 500)
      );

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
      });

      act(() => {
        capturedOnRun?.();
      });

      // Non-503 errors should set drawerMode='runtime-error', not show a generic alert
      await waitFor(() => {
        expect(screen.getByTestId('drawer-mode').textContent).toBe('runtime-error');
      });
    });
  });
});

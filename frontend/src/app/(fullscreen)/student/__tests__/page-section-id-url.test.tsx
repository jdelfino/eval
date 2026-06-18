/**
 * Tests for section-pointer-driven live-vs-practice resolution on the student
 * page (G4 B1, eval-cej.8.12).
 *
 * The page decides live-vs-practice from the section's current_session_id
 * pointer (via getSection), NOT from a status==='active' session list. A pointer
 * for this problem → live mode + join; no pointer → practice.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import StudentPageWrapper from '../page';

const mockGetStudentWork = jest.fn();
const mockGetSection = jest.fn();
const mockUpdateStudentWork = jest.fn();
const mockJoinSession = jest.fn();
const mockUpdateCode = jest.fn();

jest.mock('@/lib/api/student-work', () => ({
  getStudentWork: (...args: unknown[]) => mockGetStudentWork(...args),
  updateStudentWork: (...args: unknown[]) => mockUpdateStudentWork(...args),
  getOrCreateStudentWork: jest.fn(),
}));

jest.mock('@/lib/api/execute', () => ({
  warmExecutor: jest.fn().mockResolvedValue(undefined),
  executeCode: jest.fn().mockResolvedValue({ results: [{ name: 'run', type: 'io', status: 'run', input: '', actual: '', time_ms: 10 }], summary: { total: 1, passed: 0, failed: 0, errors: 0, run: 1, time_ms: 10 } }),
}));

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

const mockUseRealtimeSession = jest.fn(() => ({
  session: null,
  loading: false,
  error: null,
  isConnected: false,
  connectionStatus: 'disconnected',
  connectionError: null,
  updateCode: mockUpdateCode,
  joinSession: mockJoinSession,
}));

jest.mock('@/hooks/useRealtimeSession', () => ({
  useRealtimeSession: () => mockUseRealtimeSession(),
}));

const mockUseSearchParams = jest.fn();

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockUseSearchParams(),
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

jest.mock('@/components/workspace/WorkspaceShell', () => ({
  __esModule: true,
  default: () => <div data-testid="workspace-shell">WorkspaceShell</div>,
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
    test_cases: null,
    author_id: 'instructor-1',
    class_id: 'class-1',
    tags: [],
    solution: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
};

describe('StudentPage live-vs-practice via section pointer (G4 B1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    mockGetStudentWork.mockResolvedValue(fakeStudentWork);
    mockJoinSession.mockResolvedValue({ code: '', test_cases: null });
    mockUseRealtimeSession.mockReturnValue({
      session: null,
      loading: false,
      error: null,
      isConnected: false,
      connectionStatus: 'disconnected',
      connectionError: null,
      updateCode: mockUpdateCode,
      joinSession: mockJoinSession,
    });
  });

  it('fetches the section pointer using section_id from the URL (before Step 1 completes)', async () => {
    // Delay Step 1 (getStudentWork) to confirm the pointer fetch uses the URL
    // section_id, not the work's section_id.
    let resolveWork: (value: any) => void;
    const workPromise = new Promise((resolve) => { resolveWork = resolve; });
    mockGetStudentWork.mockReturnValue(workPromise);
    mockGetSection.mockResolvedValue({ id: 'section-1', name: 'Test Section', current_session_id: null });

    mockUseSearchParams.mockReturnValue({
      get: (key: string) => {
        if (key === 'work_id') return 'work-123';
        if (key === 'section_id') return 'section-1';
        return null;
      },
    });

    render(<StudentPageWrapper />);

    // getSection (the pointer source) is called with the URL section id before
    // Step 1 resolves.
    await waitFor(() => {
      expect(mockGetSection).toHaveBeenCalledWith('section-1');
    });
    expect(mockGetStudentWork).toHaveBeenCalledWith('work-123');

    resolveWork!(fakeStudentWork);
  });

  it('enters live mode and joins the pointer session when current_session_id is set for this problem', async () => {
    /**
     * G4 B1 regression: under the pointer model the page must enter live mode
     * from the section pointer, not from a (now-empty) active-session list.
     * Catches: students stranded in practice when a session is live.
     */
    mockGetSection.mockResolvedValue({
      id: 'section-1',
      name: 'Test Section',
      current_session_id: 'session-1',
      current_problem_id: 'problem-1',
    });

    mockUseSearchParams.mockReturnValue({
      get: (key: string) => {
        if (key === 'work_id') return 'work-123';
        if (key === 'section_id') return 'section-1';
        return null;
      },
    });

    render(<StudentPageWrapper />);

    // Live mode auto-joins the pointer's session.
    await waitFor(() => {
      expect(mockJoinSession).toHaveBeenCalled();
    });
  });

  it('enters practice mode (no join) when the pointer is a DIFFERENT problem', async () => {
    /**
     * G4 B1 problem-identity gate: the section pointer is live but points at a
     * DIFFERENT problem than the one the student opened. Joining the live session
     * would autosave the student's code under the wrong problem (silent
     * cross-problem corruption). The page must stay in practice mode and NOT join.
     */
    mockGetSection.mockResolvedValue({
      id: 'section-1',
      name: 'Test Section',
      current_session_id: 'session-live',
      current_problem_id: 'problem-OTHER', // pointer's problem ≠ opened work's 'problem-1'
    });

    mockUseSearchParams.mockReturnValue({
      get: (key: string) => {
        if (key === 'work_id') return 'work-123';
        if (key === 'section_id') return 'section-1';
        return null;
      },
    });

    render(<StudentPageWrapper />);

    // Wait for the section fetch + mode resolution to settle, then assert no join.
    await waitFor(() => {
      expect(mockGetSection).toHaveBeenCalledWith('section-1');
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(mockJoinSession).not.toHaveBeenCalled();
  });

  it('enters practice mode (no join) when there is no section pointer', async () => {
    mockGetSection.mockResolvedValue({
      id: 'section-1',
      name: 'Test Section',
      current_session_id: null,
    });

    mockUseSearchParams.mockReturnValue({
      get: (key: string) => {
        if (key === 'work_id') return 'work-123';
        return null;
      },
    });

    render(<StudentPageWrapper />);

    // Practice mode renders the editor and never joins a session.
    await waitFor(() => {
      const shell = document.querySelector('[data-testid="workspace-shell"]');
      expect(shell).not.toBeNull();
    });
    expect(mockJoinSession).not.toHaveBeenCalled();
  });

  it('falls back to practice mode when getSection fails', async () => {
    mockGetSection.mockRejectedValue(new Error('Network error'));

    mockUseSearchParams.mockReturnValue({
      get: (key: string) => {
        if (key === 'work_id') return 'work-123';
        if (key === 'section_id') return 'section-1';
        return null;
      },
    });

    render(<StudentPageWrapper />);

    // Even on error, the page shows the editor (practice mode) and does not join.
    await waitFor(() => {
      const shell = document.querySelector('[data-testid="workspace-shell"]');
      expect(shell).not.toBeNull();
    });
    expect(mockJoinSession).not.toHaveBeenCalled();
  });
});

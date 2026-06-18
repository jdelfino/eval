/**
 * Tests that the student page renders ConnectionDot inline (not via HeaderSlot).
 *
 * Contract: After removing HeaderSlotContext injection, the student page must render
 * ConnectionDot directly in its body during live+joined mode, reflecting the hook's
 * connectionStatus value. Failing this means students have no connection indicator.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import StudentPageWrapper from '../page';

// ── API mocks ─────────────────────────────────────────────────────────────────

const mockGetStudentWork = jest.fn();
const mockJoinSession = jest.fn();
const mockUpdateCode = jest.fn();

jest.mock('@/lib/api/student-work', () => ({
  getStudentWork: (...args: unknown[]) => mockGetStudentWork(...args),
  updateStudentWork: jest.fn().mockResolvedValue(undefined),
  getOrCreateStudentWork: jest.fn(),
}));

jest.mock('@/lib/api/execute', () => ({
  warmExecutor: jest.fn().mockResolvedValue(undefined),
  executeCode: jest.fn().mockResolvedValue({ results: [], summary: { total: 0, passed: 0, failed: 0, errors: 0, run: 0, time_ms: 0 } }),
  ioTestCasesToCaseDefs: jest.fn((cases: unknown[]) => cases),
}));

// G4 section-pointer model: live mode is gated on the section's
// current_session_id, set to the live session here.
jest.mock('@/lib/api/sections', () => ({
  getSection: jest.fn().mockResolvedValue({
    id: 'section-1',
    name: 'CS 101',
    current_session_id: 'session-1',
    current_problem_id: 'problem-1',
  }),
}));

jest.mock('@/hooks/useSectionEvents', () => ({
  useSectionEvents: jest.fn(() => ({
    currentSessionId: 'session-1',
    currentProblem: { id: 'problem-1', title: 'Two Sum' },
    lastActivity: new Date().toISOString(),
  })),
  LIVENESS_WINDOW_MS: 60 * 60 * 1000,
}));

// ── Realtime hook mock ────────────────────────────────────────────────────────

const mockUseRealtimeSession = jest.fn();
jest.mock('@/hooks/useRealtimeSession', () => ({
  useRealtimeSession: () => mockUseRealtimeSession(),
}));

// ── Navigation ────────────────────────────────────────────────────────────────

jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(() => ({
    get: (key: string) => (key === 'work_id' ? 'work-123' : null),
  })),
  useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn() })),
}));

// ── Auth ──────────────────────────────────────────────────────────────────────

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(() => ({
    user: { id: 'user-1', email: 'test@example.com', display_name: 'Test User' },
  })),
}));

// ── Debugger ──────────────────────────────────────────────────────────────────

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

// ── Fixtures ──────────────────────────────────────────────────────────────────

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
    description: 'Test description',
    starter_code: '',
    test_cases: [],
    language: 'python',
    author_id: 'instructor-1',
    class_id: 'class-1',
    tags: [],
    solution: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
};

function makeRealtimeReturn(connectionStatus: string, extra = {}) {
  return {
    session: { id: 'session-1', status: 'active' },
    loading: false,
    error: null,
    isConnected: connectionStatus === 'connected',
    connectionStatus,
    connectionError: null,
    updateCode: mockUpdateCode,
    joinSession: mockJoinSession,
    replacementInfo: null,
    ...extra,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Student page inline ConnectionDot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStudentWork.mockResolvedValue(fakeStudentWork);
    mockJoinSession.mockResolvedValue({ code: 'print("hello")', test_cases: [] });
  });

  it('renders ConnectionDot with status="live" when realtime hook reports connected', async () => {
    mockUseRealtimeSession.mockReturnValue(makeRealtimeReturn('connected'));

    render(<StudentPageWrapper />);

    await waitFor(() => {
      expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
    });

    // ConnectionDot renders its label text for the given status
    await waitFor(() => {
      expect(screen.getByText('Live')).toBeInTheDocument();
    });
  });

  it('renders ConnectionDot with status="warming" when realtime hook reports connecting', async () => {
    mockUseRealtimeSession.mockReturnValue(makeRealtimeReturn('connecting'));

    render(<StudentPageWrapper />);

    await waitFor(() => {
      expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Warming up')).toBeInTheDocument();
    });
  });
});

describe('Student page ReconnectingBanner integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStudentWork.mockResolvedValue(fakeStudentWork);
    mockJoinSession.mockResolvedValue({ code: 'print("hello")', test_cases: [] });
  });

  /**
   * Test Case 4: when the realtime link is lost mid-session (failed) while
   * live + joined, the workspace shell AND ConnectionDot stay rendered AND the
   * reconnecting banner appears. This is the risky-integration guard: a link loss
   * must degrade gracefully (banner added) without unmounting the run/autosave shell.
   */
  it('shows the reconnecting banner while keeping shell + dot when the link fails mid-session', async () => {
    mockUseRealtimeSession.mockReturnValue(makeRealtimeReturn('failed'));

    render(<StudentPageWrapper />);

    await waitFor(() => {
      expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
    });

    // Connection indicator appears once live + joined (dot gate).
    await waitFor(() => {
      expect(screen.getByText('Offline')).toBeInTheDocument();
    });

    // Shell survives the link loss (graceful degradation, not an error boundary).
    expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();

    // Banner appears with the honest reconnecting copy.
    expect(screen.getByText(/Reconnecting to the live session/i)).toBeInTheDocument();
  });

  /**
   * G9 double-banner guard: useRealtimeSession sets BOTH connectionStatus='failed'
   * AND connectionError on a subscription error. ReconnectingBanner now OWNS the
   * lost-link surface in live+joined mode, so the legacy connectionError ErrorAlert
   * must be suppressed when it would overlap. Exactly ONE lost-link strip (the
   * ReconnectingBanner) must render, not two. Both strips render with role="alert"
   * (warn tone), so counting role="alert" pins the double-banner regression: it is
   * 2 against the buggy code and 1 against the fix.
   */
  it('shows exactly one lost-link strip (ReconnectingBanner) when failed + connectionError are both set', async () => {
    mockUseRealtimeSession.mockReturnValue(
      makeRealtimeReturn('failed', {
        connectionError: 'Failed to connect to real-time server',
      })
    );

    render(<StudentPageWrapper />);

    await waitFor(() => {
      expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
    });

    // The ReconnectingBanner owns the lost-link surface and must be present.
    await waitFor(() => {
      expect(screen.getByText(/Reconnecting to the live session/i)).toBeInTheDocument();
    });

    // Exactly one lost-link strip — not the banner AND the legacy ErrorAlert.
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  /**
   * Test Case 4 (online half): when connected, the dot renders but the banner does NOT.
   * Catches the banner leaking into the normal online workspace.
   */
  it('does not show the reconnecting banner when connected', async () => {
    mockUseRealtimeSession.mockReturnValue(makeRealtimeReturn('connected'));

    render(<StudentPageWrapper />);

    await waitFor(() => {
      expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('Live')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Reconnecting to the live session/i)).not.toBeInTheDocument();
  });

  /**
   * Test Case 5: practice mode (no live pointer → session_id stays '', the hook
   * never subscribes and connectionStatus stays 'disconnected' forever) must NOT
   * show the banner. This is the bare-`disconnected` false-fire guard, and confirms
   * the `mode === 'live' && joined` + wasConnected gate.
   */
  it('does not show the reconnecting banner in practice mode (bare disconnected)', async () => {
    // Practice mode: section pointer is null, so the page never enters live mode
    // and the realtime hook is never subscribed (status stays 'disconnected').
    const { getSection } = jest.requireMock('@/lib/api/sections') as {
      getSection: jest.Mock;
    };
    getSection.mockResolvedValueOnce({
      id: 'section-1',
      name: 'CS 101',
      current_session_id: null,
      current_problem_id: null,
    });

    const { useSectionEvents } = jest.requireMock('@/hooks/useSectionEvents') as {
      useSectionEvents: jest.Mock;
    };
    useSectionEvents.mockReturnValueOnce({
      currentSessionId: null,
      currentProblem: null,
      lastActivity: new Date().toISOString(),
    });

    mockUseRealtimeSession.mockReturnValue(makeRealtimeReturn('disconnected'));

    render(<StudentPageWrapper />);

    await waitFor(() => {
      expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
    });

    // Not live + joined → no dot, and crucially no false-fired banner.
    expect(screen.queryByText('Offline')).not.toBeInTheDocument();
    expect(screen.queryByText(/Reconnecting to the live session/i)).not.toBeInTheDocument();
  });
});

/**
 * Tests for the "Instructor moved on" banner on the student page (G4
 * section-pointer model, eval-cej.8.12 Test Cases 5/6/7).
 *
 * - Test Case 5: section_current_changed to a different session while in a
 *   session renders StudentNewProblemBanner; "Jump in" navigates via
 *   getOrCreateStudentWork; "Stay here" dismisses and keeps the student in place.
 * - Test Case 6: session_replaced / session_ended produce NO "session ended" UI.
 * - Test Case 7: no remaining SessionEndedNotification rendering on the page.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import StudentPageWrapper from '../page';
import { getOrCreateStudentWork } from '@/lib/api/student-work';

const mockGetStudentWork = jest.fn();
const mockGetSection = jest.fn();
const mockJoinSession = jest.fn();
const mockUpdateCode = jest.fn();
const mockPush = jest.fn();

jest.mock('@/lib/api/student-work', () => ({
  getStudentWork: (...args: unknown[]) => mockGetStudentWork(...args),
  updateStudentWork: jest.fn().mockResolvedValue(undefined),
  getOrCreateStudentWork: jest.fn(),
}));

jest.mock('@/lib/api/execute', () => ({
  warmExecutor: jest.fn().mockResolvedValue(undefined),
  executeCode: jest.fn().mockResolvedValue({ results: [], summary: { total: 0, passed: 0, failed: 0, errors: 0, run: 0, time_ms: 0 } }),
}));

// G4 section-pointer model: live mode is gated on the section pointer.
jest.mock('@/lib/api/sections', () => ({
  getSection: (...args: unknown[]) => mockGetSection(...args),
}));

// Controllable section pointer hook: tests set what the section channel reports.
const mockUseSectionEvents = jest.fn();
jest.mock('@/hooks/useSectionEvents', () => ({
  useSectionEvents: (...args: unknown[]) => mockUseSectionEvents(...args),
  LIVENESS_WINDOW_MS: 60 * 60 * 1000,
}));

const mockUseRealtimeSession = jest.fn();
jest.mock('@/hooks/useRealtimeSession', () => ({
  useRealtimeSession: () => mockUseRealtimeSession(),
}));

jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(() => ({
    get: (key: string) => (key === 'work_id' ? 'work-123' : key === 'section_id' ? 'section-1' : null),
  })),
  useRouter: jest.fn(() => ({ push: mockPush, replace: jest.fn() })),
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
    title: 'FizzBuzz',
    description: 'Test description',
    starter_code: '',
    test_cases: null,
    author_id: 'instructor-1',
    class_id: 'class-1',
    tags: [],
    solution: null,
    language: 'python',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
};

const baseRealtime = {
  session: { id: 'session-1', status: 'active' },
  loading: false,
  error: null,
  isConnected: true,
  connectionStatus: 'connected',
  connectionError: null,
  updateCode: mockUpdateCode,
  updateCodeImmediate: jest.fn().mockResolvedValue(undefined),
  joinSession: mockJoinSession,
};

/** Render the page already joined into session-1 (the section's current pointer). */
async function renderJoined(sectionEvents: {
  currentSessionId: string | null;
  currentProblem: { id: string; title: string } | null;
}) {
  mockGetStudentWork.mockResolvedValue(fakeStudentWork);
  mockGetSection.mockResolvedValue({
    id: 'section-1',
    name: 'Test Section',
    current_session_id: 'session-1',
  });
  mockJoinSession.mockResolvedValue({ code: 'print("hello")', test_cases: null });
  mockUseSectionEvents.mockReturnValue({
    ...sectionEvents,
    lastActivity: new Date().toISOString(),
  });

  render(<StudentPageWrapper />);

  await waitFor(() => {
    expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
  });
  await waitFor(() => {
    expect(mockJoinSession).toHaveBeenCalled();
  });
}

describe('StudentPage "Instructor moved on" banner (G4 section-pointer)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    mockUseRealtimeSession.mockReturnValue(baseRealtime);
  });

  it('shows the banner when the section pointer moves to a different session (Test Case 5)', async () => {
    // Pointer has moved on to session-2 / "Two Sum" while the student is in session-1.
    await renderJoined({
      currentSessionId: 'session-2',
      currentProblem: { id: 'problem-2', title: 'Two Sum' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('new-problem-banner')).toBeInTheDocument();
    });
    expect(screen.getByText(/Instructor moved on — Two Sum/)).toBeInTheDocument();
  });

  it('"Jump in" navigates to the new problem via getOrCreateStudentWork (Test Case 5)', async () => {
    (getOrCreateStudentWork as jest.Mock).mockResolvedValue({ id: 'work-new', section_id: 'section-1' });

    await renderJoined({
      currentSessionId: 'session-2',
      currentProblem: { id: 'problem-2', title: 'Two Sum' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('jump-in-button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('jump-in-button'));

    // Jump in resolves the new work for the destination problem.
    await waitFor(() => {
      expect(getOrCreateStudentWork).toHaveBeenCalledWith('section-1', 'problem-2');
    });

    // It performs a FULL navigation (window.location.assign), NOT a client-side
    // router.push: the page captures work_id once at mount and seeds
    // problem/code/session state from it, so a query-only push would leave the
    // student stranded on the old problem. We assert the negative (no router.push)
    // here; the actual assign target is verified by the moved-on E2E (jsdom does
    // not implement window.location navigation, so it cannot be asserted in unit).
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('"Stay here" dismisses the banner and keeps the student in place (Test Case 5)', async () => {
    await renderJoined({
      currentSessionId: 'session-2',
      currentProblem: { id: 'problem-2', title: 'Two Sum' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('new-problem-banner')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('stay-here-button'));

    await waitFor(() => {
      expect(screen.queryByTestId('new-problem-banner')).not.toBeInTheDocument();
    });
    // No navigation away — the student stays in their current session.
    expect(mockPush).not.toHaveBeenCalled();
    expect(getOrCreateStudentWork).not.toHaveBeenCalled();
  });

  it('does NOT show the banner when the pointer still matches the joined session', async () => {
    await renderJoined({
      currentSessionId: 'session-1',
      currentProblem: { id: 'problem-1', title: 'FizzBuzz' },
    });

    // Give effects a moment.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('new-problem-banner')).not.toBeInTheDocument();
  });

  it('never shows any "session ended / replaced" UI for students (Test Cases 6 & 7)', async () => {
    // Even if the realtime hook reports a completed session (legacy path), the
    // student page must NOT render an ended/replaced treatment.
    mockUseRealtimeSession.mockReturnValue({
      ...baseRealtime,
      session: { id: 'session-1', status: 'completed' },
    });

    await renderJoined({
      currentSessionId: 'session-1',
      currentProblem: { id: 'problem-1', title: 'FizzBuzz' },
    });

    expect(screen.queryByTestId('session-ended-notification')).not.toBeInTheDocument();
    expect(screen.queryByText(/session ended/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/code execution is disabled/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('join-new-session-button')).not.toBeInTheDocument();
  });
});

/**
 * Tests for the auto-join behavior on the student page.
 *
 * PLAT-6y2j.1: Remove isConnected gate from auto-join effect.
 * The joinSession call is HTTP-based, not WebSocket-dependent.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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

// G4 section-pointer model: the page enters live mode from the section's
// current_session_id pointer (set to the live session below).
jest.mock('@/lib/api/sections', () => ({
  getSection: (...args: unknown[]) => mockGetSection(...args),
}));

// Mock useSectionEvents so the page's moved-on detection sees a stable pointer
// equal to the joined session (no spurious "instructor moved on" banner).
jest.mock('@/hooks/useSectionEvents', () => ({
  useSectionEvents: () => ({
    currentSessionId: 'session-live',
    currentProblem: { id: 'problem-1', title: 'Test Problem' },
    lastActivity: new Date().toISOString(),
  }),
  LIVENESS_WINDOW_MS: 60 * 60 * 1000,
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

describe('StudentPage auto-join (PLAT-6y2j.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    mockJoinSession.mockResolvedValue({ code: 'print("hello")', test_cases: null });
    mockGetStudentWork.mockResolvedValue(fakeStudentWork);
    // Section pointer set to the live session → the page enters live mode and
    // auto-joins the pointer's session.
    mockGetSection.mockResolvedValue({
      id: 'section-1',
      name: 'Test Section',
      current_session_id: 'session-live',
    });
  });

  it('auto-joins session immediately even when isConnected is false', async () => {
    // isConnected = false (WebSocket not yet established)
    mockUseRealtimeSession.mockReturnValue({
      session: null,
      loading: false,
      error: null,
      isConnected: false,
      connectionStatus: 'connecting',
      connectionError: null,
      updateCode: mockUpdateCode,
      // executeCode removed from hook
      joinSession: mockJoinSession,
      replacementInfo: null,
    });

    render(<StudentPageWrapper />);

    await waitFor(() => {
      expect(mockJoinSession).toHaveBeenCalledWith('user-1', 'Test User');
    });
  });

  it('auto-joins session when isConnected is true', async () => {
    // isConnected = true (WebSocket connected)
    mockUseRealtimeSession.mockReturnValue({
      session: null,
      loading: false,
      error: null,
      isConnected: true,
      connectionStatus: 'connected',
      connectionError: null,
      updateCode: mockUpdateCode,
      // executeCode removed from hook
      joinSession: mockJoinSession,
      replacementInfo: null,
    });

    render(<StudentPageWrapper />);

    await waitFor(() => {
      expect(mockJoinSession).toHaveBeenCalledWith('user-1', 'Test User');
    });
  });

  it('does not auto-join when left-session flag is set', async () => {
    sessionStorage.setItem('left-session:session-live', 'true');

    mockUseRealtimeSession.mockReturnValue({
      session: null,
      loading: false,
      error: null,
      isConnected: false,
      connectionStatus: 'connecting',
      connectionError: null,
      updateCode: mockUpdateCode,
      // executeCode removed from hook
      joinSession: mockJoinSession,
      replacementInfo: null,
    });

    render(<StudentPageWrapper />);

    // Give time for effects to run
    await new Promise((r) => setTimeout(r, 100));

    expect(mockJoinSession).not.toHaveBeenCalled();
  });
});

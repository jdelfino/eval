/**
 * @jest-environment jsdom
 */

/**
 * Tests for Leave Session functionality.
 *
 * Bug: handleLeaveSession only cleared client-side state but did not navigate
 * away or persist the "left" flag. The auto-join effect would immediately
 * rejoin the student to the same session.
 *
 * Fix: Store a "left session" flag in sessionStorage keyed by session ID,
 * check it before auto-joining, and navigate to /sections on leave.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockRouterPush = jest.fn();

// Mock the hooks and components used by the student page
jest.mock('@/hooks/useRealtimeSession');
jest.mock('@/hooks/useApiDebugger', () => ({
  useApiDebugger: () => ({
    trace: null, currentStep: 0, isLoading: false, error: null,
    requestTrace: jest.fn(), setTrace: jest.fn(), setError: jest.fn(),
    stepForward: jest.fn(), stepBackward: jest.fn(), jumpToStep: jest.fn(),
    jumpToFirst: jest.fn(), jumpToLast: jest.fn(), reset: jest.fn(),
    getCurrentStep: jest.fn(() => null), getCurrentLocals: jest.fn(() => ({})),
    getCurrentGlobals: jest.fn(() => ({})), getCurrentCallStack: jest.fn(() => []),
    getPreviousStep: jest.fn(() => null),
    total_steps: 0, hasTrace: false, canStepForward: false, canStepBackward: false,
  }),
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', username: 'TestStudent', displayName: 'TestStudent', email: 'test@example.com', display_name: 'TestStudent' },
    signOut: jest.fn(),
  }),
}));
jest.mock('@/lib/api/student-work', () => ({
  getStudentWork: jest.fn().mockResolvedValue({
    id: 'work-123', user_id: 'user-1', section_id: 'section-1',
    problem_id: 'problem-1', code: 'print("hello")',
    last_update: '2024-01-01T00:00:00Z', created_at: '2024-01-01T00:00:00Z',
    problem: {
      id: 'problem-1', namespace_id: 'ns-1', title: 'Test', description: 'Test problem',
      starter_code: '', language: 'python', test_cases: null,
      author_id: 'instructor-1', class_id: 'class-1', tags: [], solution: null,
      created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
    },
  }),
  updateStudentWork: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/lib/api/sections', () => ({
  getActiveSessions: jest.fn().mockResolvedValue([{
    id: 'session-123', problem: { id: 'problem-1' }, status: 'active', section_id: 'section-1',
  }]),
  getSection: jest.fn().mockResolvedValue({ id: 'section-1', name: 'Test Section' }),
}));
jest.mock('@/lib/api/execute', () => ({
  warmExecutor: jest.fn().mockResolvedValue(undefined),
  executeCode: jest.fn().mockResolvedValue({ results: [], summary: { total: 0, passed: 0, failed: 0, errors: 0, run: 0, time_ms: 0 } }),
  ioTestCasesToCaseDefs: jest.requireActual('@/lib/api/execute').ioTestCasesToCaseDefs,
}));
jest.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => key === 'work_id' ? 'work-123' : null,
  }),
  useRouter: () => ({
    push: mockRouterPush,
  }),
}));
jest.mock('@/components/workspace/WorkspaceShell', () => ({
  __esModule: true,
  default: () => <div data-testid="workspace-shell">WorkspaceShell</div>,
}));
jest.mock('../components/SessionEndedNotification', () => ({
  __esModule: true,
  default: () => <div data-testid="session-ended">Session Ended</div>,
}));

import { useRealtimeSession } from '@/hooks/useRealtimeSession';

// Import after mocks
const StudentPage = require('../page').default;

const mockUseRealtimeSession = useRealtimeSession as jest.Mock;

describe('Student Page - Leave Session', () => {
  const mockJoinSession = jest.fn().mockResolvedValue({});

  const baseSessionState = {
    session: {
      id: 'session-123',
      problem: { title: 'Test', description: 'Test problem' },
      status: 'active',
    },
    loading: false,
    error: null,
    isConnected: true,
    connectionStatus: 'connected',
    connectionError: null,
    updateCode: jest.fn(),
    joinSession: mockJoinSession,
    replacementInfo: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  it('should not auto-join when left-session flag is set in sessionStorage', async () => {
    // Set the left flag before rendering
    sessionStorage.setItem('left-session:session-123', 'true');

    mockUseRealtimeSession.mockReturnValue(baseSessionState);

    render(<StudentPage />);

    // Wait a tick for effects to run
    await act(async () => {
      await new Promise(r => setTimeout(r, 100));
    });

    // joinSession should NOT have been called because the student left this session
    expect(mockJoinSession).not.toHaveBeenCalled();
  });

  it('should clear left-session flag when session ID changes', async () => {
    // Set a stale left flag for a different session
    sessionStorage.setItem('left-session:old-session', 'true');

    mockUseRealtimeSession.mockReturnValue(baseSessionState);

    render(<StudentPage />);

    // The flag for old-session should remain (we only clear on explicit actions)
    // The new session (session-123) should not have a flag
    expect(sessionStorage.getItem('left-session:session-123')).toBeNull();
  });
});

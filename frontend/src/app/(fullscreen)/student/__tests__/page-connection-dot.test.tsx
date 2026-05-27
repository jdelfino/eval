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
const mockGetActiveSessions = jest.fn();
const mockJoinSession = jest.fn();
const mockUpdateCode = jest.fn();

jest.mock('@/lib/api/student-work', () => ({
  getStudentWork: (...args: unknown[]) => mockGetStudentWork(...args),
  updateStudentWork: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/api/execute', () => ({
  warmExecutor: jest.fn().mockResolvedValue(undefined),
  executeCode: jest.fn().mockResolvedValue({ results: [], summary: { total: 0, passed: 0, failed: 0, errors: 0, run: 0, time_ms: 0 } }),
  ioTestCasesToCaseDefs: jest.fn((cases: unknown[]) => cases),
}));

jest.mock('@/lib/api/sections', () => ({
  getActiveSessions: (...args: unknown[]) => mockGetActiveSessions(...args),
  getSection: jest.fn().mockResolvedValue({ id: 'section-1', name: 'CS 101' }),
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

jest.mock('../components/SessionEndedNotification', () => ({
  __esModule: true,
  default: () => <div data-testid="session-ended">Session Ended</div>,
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

const fakeActiveSession = {
  id: 'session-1',
  status: 'active',
  problem: { id: 'problem-1' },
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
    mockGetActiveSessions.mockResolvedValue([fakeActiveSession]);
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

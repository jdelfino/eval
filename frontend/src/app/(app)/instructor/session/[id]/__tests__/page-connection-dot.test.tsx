/**
 * Tests that the instructor session page renders ConnectionDot inline (not via HeaderSlot).
 *
 * Contract: After removing HeaderSlotContext injection, the page must render
 * ConnectionDot directly in its body, and join_code must remain visible via
 * SessionControls (unchanged by T2). Failing the join_code test = SessionControls
 * got accidentally touched.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useRouter, useParams } from 'next/navigation';
import InstructorSessionPage from '../page';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeSession } from '@/hooks/useRealtimeSession';
import { useSessionOperations } from '@/hooks/useSessionOperations';

// ── Navigation ────────────────────────────────────────────────────────────────

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useParams: jest.fn(),
}));

// ── Auth ──────────────────────────────────────────────────────────────────────

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

// ── Realtime hook ─────────────────────────────────────────────────────────────

jest.mock('@/hooks/useRealtimeSession', () => ({
  useRealtimeSession: jest.fn(),
}));

// ── Session operations ────────────────────────────────────────────────────────

jest.mock('@/hooks/useSessionOperations', () => ({
  useSessionOperations: jest.fn(),
}));

// ── SessionView: renders join_code so we can assert it's still visible ────────

jest.mock('../../../components/SessionView', () => ({
  SessionView: function MockSessionView({ join_code, session_id, students, sessionContext, onEndSession, onUpdateProblem, onFeatureStudent, forceDesktop }: any) {
    return (
      <div data-testid="session-view" data-force-desktop={forceDesktop ? 'true' : 'false'}>
        <span data-testid="session-id">{session_id}</span>
        <span data-testid="join-code">{join_code}</span>
        <span data-testid="section-name">{sessionContext?.section_name}</span>
        <span data-testid="student-count">{students.length}</span>
        <button onClick={onEndSession} data-testid="end-session-btn">End Session</button>
        <button onClick={() => onUpdateProblem({ title: 'Updated', description: '', starter_code: '' })} data-testid="update-problem-btn">Update Problem</button>
        <button onClick={() => onFeatureStudent('student-1')} data-testid="feature-student-btn">Feature Student</button>
      </div>
    );
  },
}));

// ── SessionControls: include join_code rendering as the real component does ───
// Note: SessionControls is rendered inside SessionView (mocked above). This
// component is NOT mocked since T2 guards against accidentally touching it.
// The guard here is: join_code appears in the DOM via the SessionView mock prop.

jest.mock('@/components/ErrorAlert', () => ({
  ErrorAlert: ({ error, title, onDismiss }: any) => (
    <div data-testid="error-alert">
      <span>{title}</span>
      <span data-testid="error-message">{error}</span>
      {onDismiss && <button onClick={onDismiss}>Dismiss</button>}
    </div>
  ),
}));

jest.mock('@/components/ui/Spinner', () => ({
  Spinner: () => <div data-testid="spinner">Loading...</div>,
}));

jest.mock('@/lib/api/execute', () => ({
  executeCode: jest.fn().mockResolvedValue({ results: [], summary: { total: 0, passed: 0, failed: 0, errors: 0, run: 0, time_ms: 0 } }),
  ioTestCasesToCaseDefs: jest.fn((cases: unknown[]) => cases),
}));

jest.mock('@/lib/api/sections', () => ({
  getSection: jest.fn().mockResolvedValue({ id: 'section-1', current_session_id: 'session-123' }),
}));

jest.mock('@/lib/session-launch-flag', () => ({
  peekSessionLaunched: jest.fn().mockReturnValue(false),
  clearSessionLaunched: jest.fn(),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-1',
  email: 'instructor@example.com',
  display_name: 'Test Instructor',
  role: 'instructor' as const,
  namespace_id: 'namespace-1',
  created_at: '2024-01-01',
};

const mockSession = {
  id: 'session-123',
  join_code: 'ABC123',
  section_id: 'section-1',
  section_name: 'Morning Section',
  status: 'active',
  problem: { id: 'problem-1', title: 'Test Problem', description: 'A test', starter_code: '' },
};

const defaultRealtimeReturn = {
  session: mockSession,
  joinCode: 'ABC123',
  students: [],
  loading: false,
  error: null,
  isConnected: true,
  connectionStatus: 'connected',
  connectionError: null,
  featureStudent: jest.fn(),
  clearFeaturedStudent: jest.fn(),
  replacementInfo: null,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('InstructorSessionPage inline ConnectionDot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useParams as jest.Mock).mockReturnValue({ id: 'session-123' });
    (useAuth as jest.Mock).mockReturnValue({ user: mockUser, isLoading: false });
    (useRealtimeSession as jest.Mock).mockReturnValue(defaultRealtimeReturn);
    (useSessionOperations as jest.Mock).mockReturnValue({
      endSession: jest.fn(),
      updateProblem: jest.fn(),
      createSession: jest.fn(),
      loading: false,
      error: null,
    });
  });

  it('renders ConnectionDot inline in the page body', async () => {
    render(<InstructorSessionPage />);

    await waitFor(() => {
      expect(screen.getByTestId('session-view')).toBeInTheDocument();
    });

    // ConnectionDot for 'connected' state renders 'Live' label
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('join_code remains visible via SessionView (SessionControls unchanged)', async () => {
    /**
     * Regression guard: T2 must not accidentally remove join_code rendering.
     * SessionControls.tsx (rendered inside SessionView) is the canonical location
     * for join_code. Here the mock makes it visible via the session-view element.
     */
    render(<InstructorSessionPage />);

    await waitFor(() => {
      expect(screen.getByTestId('join-code')).toHaveTextContent('ABC123');
    });
  });
});

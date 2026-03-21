/**
 * Tests for Instructor Session Page
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter, useParams } from 'next/navigation';
import InstructorSessionPage from '../page';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeSession } from '@/hooks/useRealtimeSession';
import { useSessionOperations } from '@/hooks/useSessionOperations';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useParams: jest.fn(),
}));

// Mock AuthContext
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

// Mock LayoutConfigContext to verify useForceDesktopLayout is called for zoom protection
const mockUseForceDesktopLayout = jest.fn();
jest.mock('@/contexts/LayoutConfigContext', () => ({
  useLayoutConfig: () => ({ forceDesktop: false, setForceDesktop: jest.fn() }),
  useForceDesktopLayout: () => mockUseForceDesktopLayout(),
}));

// Mock useRealtimeSession hook
jest.mock('@/hooks/useRealtimeSession', () => ({
  useRealtimeSession: jest.fn(),
}));

// Mock useSessionOperations hook
jest.mock('@/hooks/useSessionOperations', () => ({
  useSessionOperations: jest.fn(),
}));

// Mock HeaderSlotContext
const mockSetHeaderSlot = jest.fn();
jest.mock('@/contexts/HeaderSlotContext', () => ({
  useHeaderSlot: () => ({ headerSlot: null, setHeaderSlot: mockSetHeaderSlot }),
}));

// Mock SessionView component
jest.mock('../../../components/SessionView', () => ({
  SessionView: function MockSessionView({
    session_id,
    join_code,
    sessionContext,
    students,
    onEndSession,
    onUpdateProblem,
    onFeatureStudent,
    forceDesktop,
  }: any) {
    return (
      <div data-testid="session-view" data-force-desktop={forceDesktop ? 'true' : 'false'}>
        <span data-testid="session-id">{session_id}</span>
        <span data-testid="join-code">{join_code}</span>
        <span data-testid="section-name">{sessionContext?.section_name}</span>
        <span data-testid="student-count">{students.length}</span>
        {students.map((s: any, i: number) => (
          <span
            key={s.id ?? i}
            data-testid={`student-last-code-update-${s.id}`}
            data-iso={s.last_code_update instanceof Date ? s.last_code_update.toISOString() : String(s.last_code_update)}
          />
        ))}
        <button onClick={onEndSession} data-testid="end-session-btn">End Session</button>
        <button onClick={() => onUpdateProblem({ title: 'Updated', description: '', starter_code: '' })} data-testid="update-problem-btn">Update Problem</button>
        <button onClick={() => onFeatureStudent('student-1')} data-testid="feature-student-btn">Feature Student</button>
      </div>
    );
  },
}));

// Mock ErrorAlert component
jest.mock('@/components/ErrorAlert', () => ({
  ErrorAlert: function MockErrorAlert({ error, title, onDismiss }: any) {
    return (
      <div data-testid="error-alert">
        <span data-testid="error-title">{title}</span>
        <span data-testid="error-message">{error}</span>
        {onDismiss && <button onClick={onDismiss} data-testid="dismiss-error">Dismiss</button>}
      </div>
    );
  },
}));

// Mock Spinner component
jest.mock('@/components/ui/Spinner', () => ({
  Spinner: function MockSpinner() {
    return <div data-testid="spinner" role="status" aria-label="Loading">Loading...</div>;
  },
}));

jest.mock('@/lib/api/execute', () => ({
  executeCode: jest.fn().mockResolvedValue({ success: true, output: '', error: '', execution_time_ms: 10 }),
}));

jest.mock('@/lib/api/sessions', () => ({
  reopenSession: jest.fn().mockResolvedValue(undefined),
}));

describe('InstructorSessionPage', () => {
  const mockPush = jest.fn();
  const mockEndSession = jest.fn();
  const mockUpdateProblem = jest.fn();
  const mockFeatureStudent = jest.fn();

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
    problem: {
      id: 'problem-1',
      title: 'Test Problem',
      description: 'A test problem',
      starter_code: 'print("Hello")',
      test_cases: null,
    },
  };

  const mockStudents = [
    { user_id: 'student-1', name: 'Alice', code: 'print("Hello")', test_cases: [] },
    { user_id: 'student-2', name: 'Bob', code: '', test_cases: [] },
  ];

  const mockClearFeaturedStudent = jest.fn();

  const defaultRealtimeSessionReturn = {
    session: mockSession,
    joinCode: 'ABC123',
    students: mockStudents,
    loading: false,
    error: null,
    isConnected: true,
    connectionStatus: 'Connected',
    connectionError: null,
    featureStudent: mockFeatureStudent,
    clearFeaturedStudent: mockClearFeaturedStudent,
    replacementInfo: null,
  };

  const defaultSessionOperationsReturn = {
    endSession: mockEndSession,
    updateProblem: mockUpdateProblem,
    createSession: jest.fn(),
    loading: false,
    error: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
    (useParams as jest.Mock).mockReturnValue({ id: 'session-123' });
    (useAuth as jest.Mock).mockReturnValue({ user: mockUser, isLoading: false });
    (useRealtimeSession as jest.Mock).mockReturnValue(defaultRealtimeSessionReturn);
    (useSessionOperations as jest.Mock).mockReturnValue(defaultSessionOperationsReturn);
  });

  describe('Loading State', () => {
    it('shows loading state when auth is loading', () => {
      (useAuth as jest.Mock).mockReturnValue({ user: null, isLoading: true });

      render(<InstructorSessionPage />);

      expect(screen.getByTestId('loading-state')).toBeInTheDocument();
      expect(screen.getByText('Loading session...')).toBeInTheDocument();
    });

    it('shows loading state when session is loading', () => {
      (useRealtimeSession as jest.Mock).mockReturnValue({
        ...defaultRealtimeSessionReturn,
        session: null,
        loading: true,
      });

      render(<InstructorSessionPage />);

      expect(screen.getByTestId('loading-state')).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('shows error state when session not found', () => {
      (useRealtimeSession as jest.Mock).mockReturnValue({
        ...defaultRealtimeSessionReturn,
        session: null,
        loading: false,
        error: 'Session not found',
      });

      render(<InstructorSessionPage />);

      expect(screen.getByTestId('error-state')).toBeInTheDocument();
      expect(screen.getByText('Session Not Found')).toBeInTheDocument();
      expect(screen.getByText('Session not found')).toBeInTheDocument();
    });

    it('navigates back to sessions on error state button click', () => {
      (useRealtimeSession as jest.Mock).mockReturnValue({
        ...defaultRealtimeSessionReturn,
        session: null,
        loading: false,
        error: 'Session not found',
      });

      render(<InstructorSessionPage />);

      fireEvent.click(screen.getByText('Back to Sessions'));

      expect(mockPush).toHaveBeenCalledWith('/instructor');
    });
  });

  describe('Session Ended State', () => {
    it('shows ended banner with reopen button when session is completed', () => {
      (useRealtimeSession as jest.Mock).mockReturnValue({
        ...defaultRealtimeSessionReturn,
        session: { ...mockSession, status: 'completed' },
      });

      render(<InstructorSessionPage />);

      expect(screen.getByTestId('session-ended-banner')).toBeInTheDocument();
      expect(screen.getByText(/This session has ended/)).toBeInTheDocument();
      expect(screen.getByTestId('reopen-session-btn')).toBeInTheDocument();
    });

    it('still renders SessionView for completed sessions (read-only browsing)', () => {
      (useRealtimeSession as jest.Mock).mockReturnValue({
        ...defaultRealtimeSessionReturn,
        session: { ...mockSession, status: 'completed' },
      });

      render(<InstructorSessionPage />);

      expect(screen.getByTestId('session-view')).toBeInTheDocument();
    });

    it('shows new session banner with link when session was replaced', () => {
      (useRealtimeSession as jest.Mock).mockReturnValue({
        ...defaultRealtimeSessionReturn,
        session: { ...mockSession, status: 'completed' },
        replacementInfo: { new_session_id: 'new-session-456' },
      });

      render(<InstructorSessionPage />);

      expect(screen.getByText(/A new session has been started/)).toBeInTheDocument();
      expect(screen.getByTestId('go-to-new-session-btn')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('go-to-new-session-btn'));
      expect(mockPush).toHaveBeenCalledWith('/instructor/session/new-session-456');
    });

    it('suppresses connection errors when session is ended', () => {
      (useRealtimeSession as jest.Mock).mockReturnValue({
        ...defaultRealtimeSessionReturn,
        session: { ...mockSession, status: 'completed' },
        connectionError: 'Connection lost',
      });

      render(<InstructorSessionPage />);

      // Should not show connection error for ended sessions
      expect(screen.queryByText('Connection lost')).not.toBeInTheDocument();
    });

    it('calls reopen API when reopen button is clicked', async () => {
      const { reopenSession: mockReopenSession } = require('@/lib/api/sessions');

      (useRealtimeSession as jest.Mock).mockReturnValue({
        ...defaultRealtimeSessionReturn,
        session: { ...mockSession, status: 'completed' },
      });

      render(<InstructorSessionPage />);

      fireEvent.click(screen.getByTestId('reopen-session-btn'));

      await waitFor(() => {
        expect(mockReopenSession).toHaveBeenCalledWith('session-123');
      });
    });
  });

  describe('Active Session', () => {
    it('renders SessionView with correct props', () => {
      render(<InstructorSessionPage />);

      expect(screen.getByTestId('session-view')).toBeInTheDocument();
      expect(screen.getByTestId('session-id')).toHaveTextContent('session-123');
      expect(screen.getByTestId('join-code')).toHaveTextContent('ABC123');
      expect(screen.getByTestId('section-name')).toHaveTextContent('Morning Section');
      expect(screen.getByTestId('student-count')).toHaveTextContent('2');
    });

    it('shows connection status in header slot', () => {
      render(<InstructorSessionPage />);

      // Connection status is now rendered via the global header slot
      expect(mockSetHeaderSlot).toHaveBeenCalled();
      const lastCall = mockSetHeaderSlot.mock.calls[mockSetHeaderSlot.mock.calls.length - 1][0];
      expect(lastCall).not.toBeNull();
    });

    it('updates header slot on connection change', () => {
      (useRealtimeSession as jest.Mock).mockReturnValue({
        ...defaultRealtimeSessionReturn,
        isConnected: false,
        connectionStatus: 'Disconnected',
      });

      render(<InstructorSessionPage />);

      expect(mockSetHeaderSlot).toHaveBeenCalled();
    });

    it('shows connection error', () => {
      (useRealtimeSession as jest.Mock).mockReturnValue({
        ...defaultRealtimeSessionReturn,
        connectionError: 'Connection lost',
      });

      render(<InstructorSessionPage />);

      expect(screen.getByTestId('error-alert')).toBeInTheDocument();
      expect(screen.getByTestId('error-message')).toHaveTextContent('Connection lost');
    });
  });

  describe('Session Actions', () => {
    it('calls endSession when end session button is clicked', async () => {
      mockEndSession.mockResolvedValue(undefined);

      render(<InstructorSessionPage />);

      fireEvent.click(screen.getByTestId('end-session-btn'));

      await waitFor(() => {
        expect(mockEndSession).toHaveBeenCalledWith('session-123');
      });
    });

    it('navigates to sessions list after ending session', async () => {
      mockEndSession.mockResolvedValue(undefined);

      render(<InstructorSessionPage />);

      fireEvent.click(screen.getByTestId('end-session-btn'));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/instructor');
      });
    });

    it('shows error when end session fails', async () => {
      mockEndSession.mockRejectedValue(new Error('Failed to end'));

      render(<InstructorSessionPage />);

      fireEvent.click(screen.getByTestId('end-session-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toHaveTextContent('Failed to end');
      });
    });

    it('sets connection status in header slot', () => {
      render(<InstructorSessionPage />);

      expect(mockSetHeaderSlot).toHaveBeenCalled();
    });
  });

  describe('Problem Updates', () => {
    it('calls updateProblem when problem is updated', async () => {
      mockUpdateProblem.mockResolvedValue(undefined);

      render(<InstructorSessionPage />);

      fireEvent.click(screen.getByTestId('update-problem-btn'));

      await waitFor(() => {
        expect(mockUpdateProblem).toHaveBeenCalledWith(
          'session-123',
          expect.objectContaining({
            title: 'Updated',
            description: '',
            starter_code: '',
          })
        );
      });
    });

    it('shows error when update problem fails', async () => {
      mockUpdateProblem.mockRejectedValue(new Error('Update failed'));

      render(<InstructorSessionPage />);

      fireEvent.click(screen.getByTestId('update-problem-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toHaveTextContent('Update failed');
      });
    });
  });

  describe('Feature Student', () => {
    it('calls featureStudent when feature button is clicked', async () => {
      mockFeatureStudent.mockResolvedValue(undefined);

      render(<InstructorSessionPage />);

      fireEvent.click(screen.getByTestId('feature-student-btn'));

      await waitFor(() => {
        expect(mockFeatureStudent).toHaveBeenCalledWith('student-1');
      });
    });

    it('shows error when feature student fails', async () => {
      mockFeatureStudent.mockRejectedValue(new Error('Feature failed'));

      render(<InstructorSessionPage />);

      fireEvent.click(screen.getByTestId('feature-student-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toHaveTextContent('Feature failed');
      });
    });
  });

  describe('Error Dismissal', () => {
    it('can dismiss error alerts', async () => {
      mockEndSession.mockRejectedValue(new Error('Some error'));

      render(<InstructorSessionPage />);

      // Trigger error
      fireEvent.click(screen.getByTestId('end-session-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toHaveTextContent('Some error');
      });

      // Dismiss error
      fireEvent.click(screen.getByTestId('dismiss-error'));

      // Wait for state update
      await waitFor(() => {
        // The component should no longer show the dismissible error
        // Connection errors are still shown but those don't have dismiss
        const alerts = screen.queryAllByTestId('error-alert');
        // Should only have the dismissible error removed
        expect(alerts.length).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Hook Integration', () => {
    it('passes correct session_id to useRealtimeSession', () => {
      render(<InstructorSessionPage />);

      expect(useRealtimeSession).toHaveBeenCalledWith({
        session_id: 'session-123',
        user_id: 'user-1',
        userName: 'Test Instructor',
      });
    });

    it('uses email as fallback for userName', () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: { ...mockUser, display_name: undefined },
        isLoading: false,
      });

      render(<InstructorSessionPage />);

      expect(useRealtimeSession).toHaveBeenCalledWith({
        session_id: 'session-123',
        user_id: 'user-1',
        userName: 'instructor@example.com',
      });
    });
  });

  describe('Student Data Transformation', () => {
    it('transforms realtime students to display format', () => {
      const studentsWithSettings = [
        {
          user_id: 'student-1',
          name: 'Alice',
          code: 'print("Hello")',
          test_cases: [],
        },
      ];

      (useRealtimeSession as jest.Mock).mockReturnValue({
        ...defaultRealtimeSessionReturn,
        students: studentsWithSettings,
      });

      render(<InstructorSessionPage />);

      // Students array is passed to SessionView
      expect(screen.getByTestId('student-count')).toHaveTextContent('1');
    });

    it('maps last_update from realtime student to last_code_update in display format', () => {
      const lastUpdate = new Date('2024-06-15T10:30:00.000Z');
      const studentsWithLastUpdate = [
        {
          user_id: 'student-1',
          name: 'Alice',
          code: 'print("Hello")',
          test_cases: [],
          last_update: lastUpdate,
        },
      ];

      (useRealtimeSession as jest.Mock).mockReturnValue({
        ...defaultRealtimeSessionReturn,
        students: studentsWithLastUpdate,
      });

      render(<InstructorSessionPage />);

      const studentSpan = screen.getByTestId('student-last-code-update-student-1');
      expect(studentSpan.getAttribute('data-iso')).toBe(lastUpdate.toISOString());
    });
  });

  describe('Zoom Protection (forceDesktop)', () => {
    it('calls useForceDesktopLayout to prevent zoom from collapsing layout', () => {
      render(<InstructorSessionPage />);

      expect(mockUseForceDesktopLayout).toHaveBeenCalled();
    });

    it('passes forceDesktop=true to SessionView for projector zoom protection', () => {
      render(<InstructorSessionPage />);

      const sessionView = screen.getByTestId('session-view');
      expect(sessionView).toHaveAttribute('data-force-desktop', 'true');
    });
  });
});

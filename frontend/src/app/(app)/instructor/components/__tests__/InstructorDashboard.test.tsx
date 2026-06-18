import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { InstructorDashboard } from '../InstructorDashboard';

// Mock the API modules
jest.mock('@/lib/api/instructor', () => ({
  getInstructorDashboard: jest.fn(),
}));

jest.mock('@/lib/api/sessions', () => ({
  getSessionStudents: jest.fn(),
}));

// Mock the auth context
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'test-user',
      name: 'Test User',
      role: 'instructor',
      email: 'test@example.com',
      permissions: ['content.manage', 'session.manage'],
    },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

// Mock usePermissions hook
jest.mock('@/hooks/usePermissions');

// Mock the join-code module
jest.mock('@/lib/join-code', () => ({
  formatJoinCodeForDisplay: (code: string) => code,
}));

import { getInstructorDashboard } from '@/lib/api/instructor';
import { getSessionStudents } from '@/lib/api/sessions';
import * as usePermissionsModule from '@/hooks/usePermissions';

const mockGetInstructorDashboard = getInstructorDashboard as jest.MockedFunction<typeof getInstructorDashboard>;
const mockGetSessionStudents = getSessionStudents as jest.MockedFunction<typeof getSessionStudents>;
const mockHasPermission = usePermissionsModule.hasPermission as jest.MockedFunction<typeof usePermissionsModule.hasPermission>;

// Recent timestamp → within the 60-min liveness window ("Live now").
const RECENT = new Date().toISOString();
// Stale timestamp → outside the window (pointer set but not "live now").
const STALE = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

describe('InstructorDashboard', () => {
  const mockOnStartSession = jest.fn();
  const mockOnRejoinSession = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockHasPermission.mockReturnValue(true);
    // Default: no live sessions, so students fetch not called
    mockGetSessionStudents.mockResolvedValue([]);
  });

  it('shows loading state initially', () => {
    mockGetInstructorDashboard.mockReturnValue(new Promise(() => {})); // Never resolves
    render(
      <InstructorDashboard
        onStartSession={mockOnStartSession}
        onRejoinSession={mockOnRejoinSession}
      />
    );
    expect(document.querySelector('.animate-spin')).toBeTruthy();
  });

  it('shows empty state when no classes', async () => {
    mockGetInstructorDashboard.mockResolvedValue({
      classes: [],
    });
    render(
      <InstructorDashboard
        onStartSession={mockOnStartSession}
        onRejoinSession={mockOnRejoinSession}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('Welcome to the Instructor Dashboard')).toBeInTheDocument();
    });
  });

  it('renders classes with sections in the table', async () => {
    mockGetInstructorDashboard.mockResolvedValue({
      classes: [
        {
          id: 'class-1',
          name: 'CS 101',
          sections: [
            { id: 'sec-1', name: 'Section A', join_code: 'ABC123', semester: 'Fall 2025', studentCount: 25 },
          ],
        },
      ],
    });
    render(
      <InstructorDashboard
        onStartSession={mockOnStartSession}
        onRejoinSession={mockOnRejoinSession}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('CS 101')).toBeInTheDocument();
      expect(screen.getByText('Section A')).toBeInTheDocument();
    });
    // Semester column is gone (no "Meets" equivalent — see TC3); student count still present
    expect(screen.getByText('25')).toBeInTheDocument();
  });

  it('shows error state on fetch failure', async () => {
    mockGetInstructorDashboard.mockRejectedValue(new Error('Network error'));
    render(
      <InstructorDashboard
        onStartSession={mockOnStartSession}
        onRejoinSession={mockOnRejoinSession}
      />
    );
    await waitFor(() => {
      expect(screen.getByText(/Error loading dashboard/i)).toBeInTheDocument();
    });
  });

  /**
   * TC1: Section with a current-session pointer (and recent activity) renders the
   * live strip with "Live now · 3/12 connected" given a mocked students fetch of 3
   * and studentCount 12.
   * Contract: strip keys on currentSessionId; numerator = students.length from
   *           GET /sessions/{id}/students; denominator = section.studentCount.
   * Catches: numerator/denominator swap, missing fetch, or pointer-key drift.
   */
  it('TC1: renders live strip with N/M connected when section has a recent pointer', async () => {
    mockGetInstructorDashboard.mockResolvedValue({
      classes: [
        {
          id: 'class-1',
          name: 'CS A',
          sections: [
            {
              id: 'sec-1',
              name: 'Period 3',
              join_code: 'K7M-2A9',
              semester: 'Fall 2025',
              studentCount: 12,
              currentSessionId: 'session-active-1',
              lastActivity: RECENT,
            },
          ],
        },
      ],
    });
    // 3 students joined — these are the "connected" students
    mockGetSessionStudents.mockResolvedValue([
      { id: 'ss1', session_id: 'session-active-1', user_id: 'u1', name: 'Alice', code: '', test_cases: null, joined_at: '' },
      { id: 'ss2', session_id: 'session-active-1', user_id: 'u2', name: 'Bob', code: '', test_cases: null, joined_at: '' },
      { id: 'ss3', session_id: 'session-active-1', user_id: 'u3', name: 'Carol', code: '', test_cases: null, joined_at: '' },
    ]);

    render(
      <InstructorDashboard
        onStartSession={mockOnStartSession}
        onRejoinSession={mockOnRejoinSession}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Live now/i)).toBeInTheDocument();
    });

    // Verify the connected count appears in "3/12 connected" format
    expect(screen.getByText(/3\/12 connected/i)).toBeInTheDocument();

    // Rejoin CTA should appear in the live strip
    expect(screen.getByTestId('rejoin-session-sec-1')).toBeInTheDocument();
  });

  /**
   * TC2: Students fetch failure → live card renders without the connected fraction,
   * but still shows Rejoin.
   * Contract: secondary fetch failure must not break the page.
   * Catches: home page broken by a secondary fetch.
   */
  it('TC2: live strip degrades gracefully when students fetch fails', async () => {
    mockGetInstructorDashboard.mockResolvedValue({
      classes: [
        {
          id: 'class-1',
          name: 'CS A',
          sections: [
            {
              id: 'sec-1',
              name: 'Period 3',
              join_code: 'K7M-2A9',
              semester: 'Fall 2025',
              studentCount: 12,
              currentSessionId: 'session-active-1',
              lastActivity: RECENT,
            },
          ],
        },
      ],
    });
    mockGetSessionStudents.mockRejectedValue(new Error('Network error'));

    render(
      <InstructorDashboard
        onStartSession={mockOnStartSession}
        onRejoinSession={mockOnRejoinSession}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Live now/i)).toBeInTheDocument();
    });

    // No fraction when fetch failed
    expect(screen.queryByText(/\/12 connected/i)).not.toBeInTheDocument();

    // Rejoin CTA still present
    expect(screen.getByTestId('rejoin-session-sec-1')).toBeInTheDocument();
  });

  /**
   * TC2b (G4-R3): a stale pointer (activity outside the 60-min window) shows the
   * current-problem affordance (Rejoin) WITHOUT the "Live now" pulse, and the
   * status pill is Idle. A non-stale pointer shows "Live now".
   * Contract: liveness emphasis requires recent activity in addition to the pointer.
   * Catches: stale-pointer-as-live regression.
   */
  it('TC2b: stale pointer shows current-problem affordance without the Live pulse', async () => {
    mockGetInstructorDashboard.mockResolvedValue({
      classes: [
        {
          id: 'class-1',
          name: 'CS A',
          sections: [
            {
              id: 'sec-stale',
              name: 'Period 3',
              join_code: 'K7M-2A9',
              semester: 'Fall 2025',
              studentCount: 12,
              currentSessionId: 'session-stale-1',
              lastActivity: STALE,
            },
          ],
        },
      ],
    });
    mockGetSessionStudents.mockResolvedValue([]);

    render(
      <InstructorDashboard
        onStartSession={mockOnStartSession}
        onRejoinSession={mockOnRejoinSession}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('rejoin-session-sec-stale')).toBeInTheDocument();
    });

    // Stale pointer is the "current problem" but NOT "Live now".
    expect(screen.getByText(/Current problem/i)).toBeInTheDocument();
    expect(screen.queryByText(/Live now/i)).not.toBeInTheDocument();

    // Status pill is Idle (no live emphasis) despite the pointer being set.
    expect(screen.getByTestId('status-pill-sec-stale')).toHaveTextContent('Idle');

    // No Start Session button — the pointer is set, so Rejoin is the affordance.
    expect(screen.queryByTestId('start-session-sec-stale')).not.toBeInTheDocument();
  });

  /**
   * TC3: No pass/fail/idle counts; no "Meets" column; no recent-activity/Today panel.
   * Contract: dropped affordances from v4 design spec must not creep in.
   * Catches: forbidden content rendered.
   */
  it('TC3: no pass/fail/idle counts, no Meets column, no Today/recent-activity panel', async () => {
    mockGetInstructorDashboard.mockResolvedValue({
      classes: [
        {
          id: 'class-1',
          name: 'CS 101',
          sections: [
            {
              id: 'sec-1',
              name: 'Section A',
              join_code: 'ABC123',
              semester: 'Fall 2025',
              studentCount: 25,
              currentSessionId: 'session-active-1',
              lastActivity: RECENT,
            },
          ],
        },
      ],
    });
    mockGetSessionStudents.mockResolvedValue([]);

    render(
      <InstructorDashboard
        onStartSession={mockOnStartSession}
        onRejoinSession={mockOnRejoinSession}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('CS 101')).toBeInTheDocument();
    });

    // No passing/failing/idle counts
    expect(screen.queryByText(/passing/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/failing/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/idle/i)).not.toBeInTheDocument();

    // No "Meets" column header
    expect(screen.queryByText(/meets/i)).not.toBeInTheDocument();

    // No recent activity or Today panel
    expect(screen.queryByText(/recent activity/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/this week/i)).not.toBeInTheDocument();
  });

  /**
   * TC4: Start session click opens the modal; Rejoin calls onRejoinSession with the session id.
   * Contract: session flow must survive the reskin.
   * Catches: session flow regression.
   */
  it('TC4: start session button triggers onStartSession; rejoin button triggers onRejoinSession', async () => {
    mockGetInstructorDashboard.mockResolvedValue({
      classes: [
        {
          id: 'class-1',
          name: 'CS A',
          sections: [
            // Idle section (no pointer) — should show Start
            { id: 'sec-idle', name: 'Morning Section', join_code: 'ABC', semester: '', studentCount: 10 },
            // Section with a pointer — should show Rejoin
            {
              id: 'sec-live',
              name: 'Evening Section',
              join_code: 'XYZ',
              semester: '',
              studentCount: 8,
              currentSessionId: 'session-789',
              lastActivity: RECENT,
            },
          ],
        },
      ],
    });
    mockGetSessionStudents.mockResolvedValue([]);

    render(
      <InstructorDashboard
        onStartSession={mockOnStartSession}
        onRejoinSession={mockOnRejoinSession}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('start-session-sec-idle')).toBeInTheDocument();
    });

    // Start session
    fireEvent.click(screen.getByTestId('start-session-sec-idle'));
    expect(mockOnStartSession).toHaveBeenCalledWith('sec-idle', 'Morning Section');

    // Rejoin session — should appear in the table row actions
    const rejoinBtn = screen.getByTestId('rejoin-session-sec-live');
    fireEvent.click(rejoinBtn);
    expect(mockOnRejoinSession).toHaveBeenCalledWith('session-789');
  });

  /**
   * TC5: Status pill shows "Live" for sections with a recent pointer, "Idle"
   * otherwise.
   * Contract: status derivation uses the pointer + 60-min liveness heuristic.
   * Catches: status derivation bug.
   */
  it('TC5: status pill is Live for sections with a recent pointer and Idle otherwise', async () => {
    mockGetInstructorDashboard.mockResolvedValue({
      classes: [
        {
          id: 'class-1',
          name: 'CS A',
          sections: [
            { id: 'sec-idle', name: 'Morning', join_code: 'A', semester: '', studentCount: 5 },
            { id: 'sec-live', name: 'Evening', join_code: 'B', semester: '', studentCount: 5, currentSessionId: 'sess-1', lastActivity: RECENT },
          ],
        },
      ],
    });
    mockGetSessionStudents.mockResolvedValue([]);

    render(
      <InstructorDashboard
        onStartSession={mockOnStartSession}
        onRejoinSession={mockOnRejoinSession}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Morning')).toBeInTheDocument();
    });

    // Live pill for active section, Idle pill for inactive
    expect(screen.getByTestId('status-pill-sec-live')).toHaveTextContent('Live');
    expect(screen.getByTestId('status-pill-sec-idle')).toHaveTextContent('Idle');
  });

  /**
   * TC6: Permission-gated rendering — session controls hidden without session.manage.
   * Contract: RBAC gating must survive the reskin.
   * Catches: gating loss.
   */
  it('TC6: hides Create Class and session action buttons when permissions are absent', async () => {
    mockHasPermission.mockReturnValue(false);

    mockGetInstructorDashboard.mockResolvedValue({
      classes: [
        {
          id: 'class-1',
          name: 'CS 101',
          sections: [
            { id: 'sec-1', name: 'Section A', join_code: 'ABC123', semester: 'Fall 2025', studentCount: 25 },
          ],
        },
      ],
    });

    render(
      <InstructorDashboard
        onStartSession={mockOnStartSession}
        onRejoinSession={mockOnRejoinSession}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('CS 101')).toBeInTheDocument();
    });

    // Create Class button should not be visible
    expect(screen.queryByTestId('create-class-btn')).not.toBeInTheDocument();

    // Start Session button should not be visible
    expect(screen.queryByTestId('start-session-sec-1')).not.toBeInTheDocument();
  });

  it('hides Create Class button in empty state when content.manage permission is absent', async () => {
    mockHasPermission.mockReturnValue(false);

    mockGetInstructorDashboard.mockResolvedValue({ classes: [] });

    render(
      <InstructorDashboard
        onStartSession={mockOnStartSession}
        onRejoinSession={mockOnRejoinSession}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Welcome to the Instructor Dashboard')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('create-first-class-btn')).not.toBeInTheDocument();
  });
});

/**
 * Unit tests for MySectionsPage (student sections list)
 *
 * Verifies the v4 StudentSectionListH reskin:
 * 1. "X / N solved" rendered from section problems with last_run_all_passed
 * 2. Live section renders green top-bar + accent "Jump in"; idle renders Practice CTA
 * 3. Per-section fetch failure -> card still renders name + Practice link without counts
 * 4. "Join Section" link to /sections/join present in populated and empty states
 * 5. "Practice problems →" routes to /sections/{id}
 * 6. No streak/absent badge markup
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MySectionsPage from '../page';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'student@test.com', role: 'student' } }),
}));

const mockListMySections = jest.fn();
jest.mock('@/hooks/useSections', () => ({
  useSections: () => ({
    sections: mockListMySections(),
    loading: false,
    error: null,
    fetchMySections: jest.fn().mockResolvedValue(undefined),
  }),
}));

const mockListSectionProblems = jest.fn();
jest.mock('@/lib/api/section-problems', () => ({
  listSectionProblems: (...args: unknown[]) => mockListSectionProblems(...args),
}));

const mockListSectionSessions = jest.fn();
jest.mock('@/lib/api/sections', () => ({
  listSectionSessions: (...args: unknown[]) => mockListSectionSessions(...args),
}));

jest.mock('next/link', () => {
  const MockLink = ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  );
  MockLink.displayName = 'MockLink';
  return MockLink;
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildSection(
  id: string,
  name: string,
  className: string,
  currentSessionId: string | null = null
) {
  return {
    section: {
      id,
      namespace_id: 'ns-1',
      class_id: 'class-1',
      name,
      semester: null,
      join_code: 'ABC123',
      active: true,
      current_session_id: currentSessionId,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
    class_name: className,
  };
}

function buildProblem(
  id: string,
  lastRunAllPassed: boolean | null = null
) {
  return {
    id,
    section_id: 'section-1',
    problem_id: id,
    published_by: 'instr-1',
    show_solution: false,
    published_at: '2025-01-01T00:00:00Z',
    problem: {
      id,
      namespace_id: 'ns-1',
      title: `Problem ${id}`,
      description: null,
      starter_code: null,
      test_cases: null,
      author_id: 'instr-1',
      class_id: null,
      tags: [],
      solution: null,
      language: 'python',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
    student_work:
      lastRunAllPassed !== null
        ? {
            id: `work-${id}`,
            namespace_id: 'ns-1',
            user_id: 'user-1',
            section_id: 'section-1',
            problem_id: id,
            code: '',
            test_cases: [],
            last_update: '2025-01-01T00:00:00Z',
            created_at: '2025-01-01T00:00:00Z',
            last_run_all_passed: lastRunAllPassed,
            last_run_at: lastRunAllPassed ? '2025-01-02T00:00:00Z' : null,
          }
        : undefined,
  };
}

// Recent timestamp → within the 60-min liveness window.
const RECENT = new Date().toISOString();
// Stale timestamp → outside the window (pointer set, but not "live now").
const STALE = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

// Builds the pointer session returned by listSectionSessions. id must match the
// section's current_session_id for the page to treat it as the live session.
function buildPointerSession(
  sectionId: string,
  sessionId: string,
  lastActivity: string = RECENT
) {
  return {
    id: sessionId,
    namespace_id: 'ns-1',
    section_id: sectionId,
    section_name: 'CS A',
    status: 'active' as const,
    created_at: '2025-01-01T00:00:00Z',
    last_activity: lastActivity,
    ended_at: null,
    problem: null,
    featured_student_id: null,
    featured_code: null,
    featured_test_cases: null,
    creator_id: 'instr-1',
    participants: [],
    join_code: 'ABC123',
  };
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

describe('MySectionsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * TC1: "X / N solved" is derived correctly.
   * Verifies: only rows with last_run_all_passed=true count as solved;
   * null/false do not. A regression here means the solved-state derivation is broken.
   */
  it('renders "2 / 5 solved" when 2 of 5 problems have last_run_all_passed=true', async () => {
    mockListMySections.mockReturnValue([buildSection('s1', 'CS A · Period 3', 'Lincoln HS')]);

    // 5 problems: p1 and p2 solved, p3 false, p4 null, p5 no student_work
    mockListSectionProblems.mockResolvedValue([
      buildProblem('p1', true),
      buildProblem('p2', true),
      buildProblem('p3', false),
      buildProblem('p4', null),
      buildProblem('p5'),
    ]);
    mockListSectionSessions.mockResolvedValue([]);

    render(<MySectionsPage />);

    await waitFor(() => {
      expect(screen.getByText(/2\s*\/\s*5 solved/)).toBeInTheDocument();
    });
  });

  /**
   * TC2: Live vs idle state wiring (G4 pointer model).
   * Live section: pointer set + recent activity → green top-bar and "Jump in".
   * Idle section: no pointer → "Practice problems →" is the primary CTA.
   * Catches: live flag drifting back to status='active' / getActiveSessions.
   */
  it('live section renders green top-bar + "Jump in"; idle section renders Practice CTA', async () => {
    mockListMySections.mockReturnValue([
      buildSection('s1', 'CS A · Period 3', 'Lincoln HS', 'sess-s1'),
      buildSection('s2', 'CS B · Block A', 'Lincoln HS'),
    ]);
    // s1 has a recent pointer (live), s2 has no pointer (idle)
    mockListSectionProblems.mockResolvedValue([]);
    mockListSectionSessions
      .mockImplementation((sectionId: string) => {
        if (sectionId === 's1') return Promise.resolve([buildPointerSession('s1', 'sess-s1', RECENT)]);
        return Promise.resolve([]);
      });

    render(<MySectionsPage />);

    await waitFor(() => {
      // Live section has "Jump in"
      expect(screen.getByRole('link', { name: /jump in/i })).toBeInTheDocument();
      // Both sections have "Practice problems →"
      const practiceLinks = screen.getAllByRole('link', { name: /practice problems/i });
      expect(practiceLinks.length).toBeGreaterThanOrEqual(1);
    });

    // The live top-bar is rendered (a div with data-testid or identifiable class)
    expect(screen.getByTestId('live-top-bar')).toBeInTheDocument();
  });

  /**
   * TC2c (G4-R3): a section with a pointer but STALE activity is NOT "live now":
   * no top-bar, no "Jump in". The pointer alone must not light up the card.
   * Catches: stale-pointer-as-live regression on the student sections list.
   */
  it('section with a stale pointer renders no top-bar and no "Jump in"', async () => {
    mockListMySections.mockReturnValue([
      buildSection('s1', 'CS A · Period 3', 'Lincoln HS', 'sess-stale'),
    ]);
    mockListSectionProblems.mockResolvedValue([]);
    mockListSectionSessions.mockResolvedValue([
      buildPointerSession('s1', 'sess-stale', STALE),
    ]);

    render(<MySectionsPage />);

    await waitFor(() => {
      expect(screen.getByText('CS A · Period 3')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('live-top-bar')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /jump in/i })).not.toBeInTheDocument();
  });

  /**
   * TC2b: "Jump in" link href routes to the correct section.
   * Catches: live CTA pointing to a wrong section or missing the section ID.
   */
  it('"Jump in" link href routes to /sections/{sectionId}', async () => {
    mockListMySections.mockReturnValue([
      buildSection('s-live', 'CS A · Period 3', 'Lincoln HS', 'sess-live'),
    ]);
    mockListSectionProblems.mockResolvedValue([]);
    mockListSectionSessions.mockResolvedValue([buildPointerSession('s-live', 'sess-live', RECENT)]);

    render(<MySectionsPage />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /jump in/i })).toBeInTheDocument();
    });

    const jumpInLink = screen.getByRole('link', { name: /jump in/i });
    expect(jumpInLink).toHaveAttribute('href', '/sections/s-live');
  });

  /**
   * TC3: Per-section fetch failure degrades gracefully.
   * When problems/sessions fetch rejects for one section, the card still renders
   * the section name and Practice link. The failure must not blank the page.
   */
  it('per-section fetch rejection → card still renders name + Practice link without counts', async () => {
    mockListMySections.mockReturnValue([
      buildSection('s1', 'CS A · Period 3', 'Lincoln HS'),
    ]);
    mockListSectionProblems.mockRejectedValue(new Error('network error'));
    mockListSectionSessions.mockRejectedValue(new Error('network error'));

    render(<MySectionsPage />);

    await waitFor(() => {
      // Section name still appears
      expect(screen.getByText('CS A · Period 3')).toBeInTheDocument();
      // Practice link still appears
      expect(screen.getByRole('link', { name: /practice problems/i })).toBeInTheDocument();
      // No solved count shown
      expect(screen.queryByText(/solved/)).not.toBeInTheDocument();
    });
  });

  /**
   * TC4: "Join Section" link present in both populated and empty states.
   * Catches regression where the join entry-point is removed during the reskin.
   */
  it('"Join Section" link to /sections/join present when sections are populated', async () => {
    mockListMySections.mockReturnValue([
      buildSection('s1', 'CS A · Period 3', 'Lincoln HS'),
    ]);
    mockListSectionProblems.mockResolvedValue([]);
    mockListSectionSessions.mockResolvedValue([]);

    render(<MySectionsPage />);

    await waitFor(() => {
      expect(screen.getByText('CS A · Period 3')).toBeInTheDocument();
    });

    const joinLinks = screen.getAllByRole('link', { name: /join section/i });
    expect(joinLinks.length).toBeGreaterThanOrEqual(1);
    expect(joinLinks[0]).toHaveAttribute('href', '/sections/join');
  });

  it('"Join Section" link to /sections/join present when section list is empty', () => {
    mockListMySections.mockReturnValue([]);
    mockListSectionProblems.mockResolvedValue([]);
    mockListSectionSessions.mockResolvedValue([]);

    render(<MySectionsPage />);

    const joinLinks = screen.getAllByRole('link', { name: /join.*section/i });
    expect(joinLinks.length).toBeGreaterThanOrEqual(1);
    expect(joinLinks[0]).toHaveAttribute('href', '/sections/join');
  });

  /**
   * TC5: "Practice problems →" routes to /sections/{id}.
   * Catches navigation regression after the reskin.
   */
  it('"Practice problems →" routes to /sections/{id}', async () => {
    mockListMySections.mockReturnValue([
      buildSection('s-abc', 'CS A · Period 3', 'Lincoln HS'),
    ]);
    mockListSectionProblems.mockResolvedValue([]);
    mockListSectionSessions.mockResolvedValue([]);

    render(<MySectionsPage />);

    await waitFor(() => {
      expect(screen.getByText('CS A · Period 3')).toBeInTheDocument();
    });

    const practiceLink = screen.getByRole('link', { name: /practice problems/i });
    expect(practiceLink).toHaveAttribute('href', '/sections/s-abc');
  });

  /**
   * TC6: No streak/absent badge markup.
   * Dropped affordances from v4 mock must not appear in the reskin.
   */
  it('renders no streak, stuck, or absent badge text', async () => {
    mockListMySections.mockReturnValue([
      buildSection('s1', 'CS A · Period 3', 'Lincoln HS'),
    ]);
    mockListSectionProblems.mockResolvedValue([]);
    mockListSectionSessions.mockResolvedValue([]);

    render(<MySectionsPage />);

    await waitFor(() => {
      expect(screen.getByText('CS A · Period 3')).toBeInTheDocument();
    });

    expect(screen.queryByText(/streak/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/stuck/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/absent/i)).not.toBeInTheDocument();
  });
});

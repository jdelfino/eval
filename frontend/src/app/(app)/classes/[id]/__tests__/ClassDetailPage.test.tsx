/**
 * Unit tests for ClassDetailG (classes/[id]/page.tsx).
 *
 * Contracts verified:
 * - Sections table renders Section / Code (mono) / Students / Status / Open columns — NO "Last met"
 * - "Open →" link navigates to /sections/{id}
 * - Right rail renders About text from class description
 * - Right rail renders co-instructor names from instructorNames map
 * - Regenerate-join-code button calls its handler; updated code renders in the table
 *
 * Why these matter: B2 reskin changes the layout significantly; regressions in
 * column presence, navigation wiring, or payload mapping would break instructor
 * workflows silently.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { Class, Section } from '@/types/api';

// --- Navigation mocks ---
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => ({ id: 'class-abc' }),
}));

// --- next/link mock ---
jest.mock('next/link', () => {
  return ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  );
});

// --- API mocks ---
const mockGetClass = jest.fn();
const mockApiRegenerateJoinCode = jest.fn();
const mockListSectionSessions = jest.fn();
jest.mock('@/lib/api/classes', () => ({
  getClass: (...args: unknown[]) => mockGetClass(...args),
  regenerateJoinCode: (...args: unknown[]) => mockApiRegenerateJoinCode(...args),
  // Provide no-ops for other exports used by useClasses hook
  listClasses: jest.fn(),
  createClass: jest.fn(),
  updateClass: jest.fn(),
  deleteClass: jest.fn(),
  createSection: jest.fn(),
  updateSection: jest.fn(),
}));

jest.mock('@/lib/api/sections', () => ({
  listSectionSessions: (...args: unknown[]) => mockListSectionSessions(...args),
  getActiveSessions: jest.fn().mockResolvedValue([]),
}));

// --- join-code mock ---
jest.mock('@/lib/join-code', () => ({
  formatJoinCodeForDisplay: (code: string) => code,
}));

// --- Auth mock ---
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', role: 'instructor', email: 'prof@test.com' },
  }),
}));

// --- BackButton mock ---
jest.mock('@/components/ui/BackButton', () => ({
  BackButton: ({ children }: { children: React.ReactNode }) => <a href="/classes">{children}</a>,
}));

// useClasses uses @/lib/api/classes under the hood; we mock the API layer above.
// No separate useClasses mock needed — the real hook will use the mocked API.

// --- Fixtures ---

const makeClass = (overrides: Partial<Class> = {}): Class => ({
  id: 'class-abc',
  namespace_id: 'ns-1',
  name: 'CS A — Intro',
  description: 'Python fundamentals. Fall 2025–2026.',
  created_by: 'user-1',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  ...overrides,
});

const makeSection = (overrides: Partial<Section> = {}): Section => ({
  id: 'sec-1',
  namespace_id: 'ns-1',
  class_id: 'class-abc',
  name: 'Period 1',
  semester: 'Fall 2025',
  join_code: 'K3X9P2',
  active: false,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  ...overrides,
});

const defaultApiResponse = {
  class: makeClass(),
  sections: [
    makeSection({ id: 'sec-1', name: 'Period 1', join_code: 'K3X9P2', active: false }),
    makeSection({ id: 'sec-2', name: 'Period 3', join_code: 'K7M2A9', active: true }),
  ],
  instructorNames: {},
};

// Import the page after all mocks are set up
import ClassDetailsPage from '../page';

describe('ClassDetailPage (ClassDetailG)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetClass.mockResolvedValue(defaultApiResponse);
    // Default: no active sessions for any section
    mockListSectionSessions.mockResolvedValue([]);
  });

  it('sections table has Section, Code, Students, Status, and Open columns — no "Last met"', async () => {
    /**
     * Contract: The B2 spec explicitly drops "Last met" (no data exists).
     * The table must include the five required columns and MUST NOT include "Last met".
     * Catches: dead column copied from v4 mock that has no backend data.
     */
    render(<ClassDetailsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('sections-table')).toBeInTheDocument();
    });

    const table = screen.getByTestId('sections-table');
    const headers = table.querySelectorAll('thead th');
    const headerTexts = Array.from(headers).map(h => h.textContent?.trim() ?? '');

    expect(headerTexts).toContain('Section');
    expect(headerTexts).toContain('Code');
    expect(headerTexts).toContain('Students');
    expect(headerTexts).toContain('Status');
    // "Last met" must not appear anywhere
    expect(screen.queryByText(/last met/i)).not.toBeInTheDocument();
  });

  it('Open → link navigates to /sections/{id}', async () => {
    /**
     * Contract: each section row's "Open →" is a link to /sections/{sectionId}.
     * Catches: navigation regression if the link href is wrong after grid conversion.
     */
    render(<ClassDetailsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('open-section-sec-1')).toBeInTheDocument();
    });

    const openLink1 = screen.getByTestId('open-section-sec-1');
    const openLink2 = screen.getByTestId('open-section-sec-2');

    expect(openLink1).toHaveAttribute('href', '/sections/sec-1');
    expect(openLink2).toHaveAttribute('href', '/sections/sec-2');
  });

  it('right rail renders About text from class description', async () => {
    /**
     * Contract: the About rail displays the class description from the API payload.
     * Catches: payload mis-mapping where description is dropped or rendered in wrong place.
     */
    render(<ClassDetailsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('about-section')).toBeInTheDocument();
    });

    expect(screen.getByTestId('about-section')).toHaveTextContent('Python fundamentals. Fall 2025–2026.');
  });

  it('right rail renders all co-instructor names from instructorNames map', async () => {
    /**
     * Contract: the Co-instructors rail renders each display name from the
     * instructorNames map (values). The map is keyed by user_id; only names appear.
     * Catches: payload mis-mapping where user_ids are shown instead of names.
     */
    mockGetClass.mockResolvedValue({
      ...defaultApiResponse,
      instructorNames: {
        'user-2': 'Alice Chen',
        'user-3': 'Bob Kim',
      },
    });

    render(<ClassDetailsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('co-instructors-section')).toBeInTheDocument();
    });

    expect(screen.getByTestId('co-instructors-section')).toHaveTextContent('Alice Chen');
    expect(screen.getByTestId('co-instructors-section')).toHaveTextContent('Bob Kim');
    // User IDs must not be shown as names
    expect(screen.queryByText('user-2')).not.toBeInTheDocument();
    expect(screen.queryByText('user-3')).not.toBeInTheDocument();
  });

  it('empty co-instructors shows "None yet." message', async () => {
    render(<ClassDetailsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('co-instructors-section')).toBeInTheDocument();
    });

    expect(screen.getByTestId('co-instructors-section')).toHaveTextContent('None yet.');
  });

  it('regenerate-join-code button calls handler and updated code renders', async () => {
    /**
     * Contract: clicking the regenerate button for a section calls regenerateJoinCode
     * with the section id, and the new code replaces the old one in the table.
     * Catches: join-code flow loss during the B2 reskin.
     */
    mockApiRegenerateJoinCode.mockResolvedValue(
      makeSection({ id: 'sec-1', join_code: 'NEW123' })
    );

    render(<ClassDetailsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('regenerate-code-sec-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('regenerate-code-sec-1'));

    await waitFor(() => {
      expect(mockApiRegenerateJoinCode).toHaveBeenCalledWith('sec-1');
    });

    await waitFor(() => {
      expect(screen.getByText('NEW123')).toBeInTheDocument();
    });
  });

  it('regenerate-join-code button surfaces error message on failure', async () => {
    /**
     * Contract: when regenerateJoinCode rejects, the error message is shown in the UI
     * and no navigation occurs. Catches: silent swallowing of network errors.
     */
    mockApiRegenerateJoinCode.mockRejectedValue(new Error('Network error'));

    render(<ClassDetailsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('regenerate-code-sec-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('regenerate-code-sec-1'));

    await waitFor(() => {
      expect(screen.getByTestId('regenerate-error')).toHaveTextContent('Network error');
    });
  });

  it('Status pill shows Live for sections with active sessions, Idle for others', async () => {
    /**
     * Contract (eval-cq4): Status is derived from SESSION state, not section.active flag.
     * sec-1 has an active session → Live pill; sec-2 has no active session → Idle pill.
     * Catches: the bug where section.active (enrollment flag) drove the pill instead of
     * real session state.
     */
    // sec-1 has an active session, sec-2 does not
    mockListSectionSessions.mockImplementation((sectionId: string, status?: string) => {
      if (sectionId === 'sec-1' && status === 'active') {
        return Promise.resolve([{ id: 'sess-1', status: 'active' }]);
      }
      return Promise.resolve([]);
    });

    render(<ClassDetailsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('status-pill-sec-1')).toBeInTheDocument();
    });

    expect(screen.getByTestId('status-pill-sec-1')).toHaveTextContent('Live');
    expect(screen.getByTestId('status-pill-sec-2')).toHaveTextContent('Idle');
  });
});

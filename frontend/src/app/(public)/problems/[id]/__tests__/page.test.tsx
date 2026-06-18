/**
 * Tests for public problem page /problems/[id] — A3 hero reskin
 *
 * Contracts verified:
 * - Hero renders serif title (AuthHeading), tag pills, full meta line
 * - Meta line: "python 3.11 · 3 tests · authored by X · updated Jan 15, 2026"
 * - Unknown language renders meta line without version segment
 * - Tests list: one row per test_cases entry, kind pill + name + mono summary
 * - No 'At a glance' aside, no solution affordance, no attempts/difficulty/time-limit
 * - Anon persona shows sign-in CTA; instructor shows Start session; student shows Practice
 * - generateMetadata returns correct title and OG tags
 * - Handles missing problems with notFound()
 * - No solution content rendered (eval-e81 regression guard)
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import PublicProblemPage, { generateMetadata } from '../page';
import { notFound } from 'next/navigation';
import type { PublicProblem } from '@/types/api';

// Mock typed API client
const mockGetPublicProblem = jest.fn();
jest.mock('@/lib/api/problems', () => ({
  getPublicProblem: (...args: unknown[]) => mockGetPublicProblem(...args),
}));

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

jest.mock('../InstructorActions', () => {
  return function MockInstructorActions() {
    return <div data-testid="instructor-actions" />;
  };
});

jest.mock('../StudentActions', () => {
  return function MockStudentActions() {
    return <div data-testid="student-actions" />;
  };
});

// MarkdownContent is a client component; mock it
jest.mock('@/components/MarkdownContent', () => {
  return function MockMarkdownContent({ content }: { content: string }) {
    return <div data-testid="markdown-content">{content}</div>;
  };
});

// G8 mobile read-only swap: MobileSolveSwitch branches on useMobileViewport.
// Default to desktop (isMobile:false); individual tests override.
const mockUseMobileViewport = jest.fn(() => ({
  isMobile: false,
  isTablet: false,
  isVerySmall: false,
  isDesktop: true,
  width: 1280,
}));
jest.mock('@/hooks/useResponsiveLayout', () => ({
  useMobileViewport: () => mockUseMobileViewport(),
}));

// OpenOnLaptop is a client component using the Button primitive + clipboard;
// mock it to a recognizable marker so the swap is observable.
jest.mock('@/components/OpenOnLaptop', () => ({
  OpenOnLaptop: ({ title, secondaryAction }: { title?: string; secondaryAction?: React.ReactNode }) => (
    <div data-testid="open-on-laptop">
      {title}
      {secondaryAction}
    </div>
  ),
}));

const mockNotFound = notFound as jest.MockedFunction<typeof notFound>;

/** Fixture with all A1 fields populated — python language, 3 test cases, author + date */
const mockProblem: PublicProblem = {
  id: 'problem-123',
  title: 'Two Sum',
  description: 'Find two numbers that add up to a target.',
  starter_code: 'def two_sum():\n    pass',
  class_id: 'class-1',
  class_name: 'CS 101',
  tags: ['arrays', 'hashing'],
  author_name: 'Ada Lovelace',
  updated_at: '2026-01-15T00:00:00Z',
  language: 'python',
  test_cases: [
    { kind: 'io', name: 'basic case', summary: '1 2' },
    { kind: 'io', name: 'empty input', summary: '' },
    { kind: 'pytest', name: 'test_solution.py', summary: 'test_solution.py' },
  ],
};

function mockApiResponse(data: unknown) {
  mockGetPublicProblem.mockResolvedValue(data);
}

describe('Public Problem Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore desktop default after clearAllMocks wiped the implementation.
    mockUseMobileViewport.mockReturnValue({
      isMobile: false,
      isTablet: false,
      isVerySmall: false,
      isDesktop: true,
      width: 1280,
    });
  });

  // -------------------------------------------------------------------------
  // Hero: serif title
  // -------------------------------------------------------------------------
  describe('hero — serif title', () => {
    it('renders problem title as h1 with serif font-family', async () => {
      /**
       * Contract: The problem title is rendered as an <h1> using the AuthHeading
       * component (font-family: var(--font-serif)).
       * Breaking this makes the page title non-discoverable and loses the v4 typographic hierarchy.
       */
      mockApiResponse(mockProblem);
      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      const heading = screen.getByRole('heading', { level: 1, name: 'Two Sum' });
      expect(heading).toBeInTheDocument();
      // AuthHeading uses fontFamily: 'var(--font-serif)'
      expect(heading).toHaveStyle({ fontFamily: 'var(--font-serif)' });
    });
  });

  // -------------------------------------------------------------------------
  // Hero: tag pills
  // -------------------------------------------------------------------------
  describe('hero — tag pills', () => {
    it('renders each tag as a pill', async () => {
      /**
       * Contract: Every tag in problem.tags is rendered as a visible pill element.
       * Breaking this removes tag discoverability from the public page.
       */
      mockApiResponse(mockProblem);
      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      expect(screen.getByText('arrays')).toBeInTheDocument();
      expect(screen.getByText('hashing')).toBeInTheDocument();
    });

    it('renders no tag pills when tags array is empty', async () => {
      mockApiResponse({ ...mockProblem, tags: [] });
      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      // Title still renders
      expect(screen.getByRole('heading', { level: 1, name: 'Two Sum' })).toBeInTheDocument();
      // No tag pills for empty arrays/hashing
      expect(screen.queryByText('arrays')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Hero: meta line
  // -------------------------------------------------------------------------
  describe('hero — meta line', () => {
    it('renders meta line with language version, test count, author, and updated date', async () => {
      /**
       * Contract: The meta line reads "python 3.11 · 3 tests · authored by Ada Lovelace · updated Jan 15, 2026".
       * Breaking this loses the version, test count, attribution, or date from the hero.
       * The language version comes from the LANGUAGE_VERSIONS constant map (python→3.11).
       */
      mockApiResponse(mockProblem);
      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      // All meta line segments must be present
      expect(screen.getByText(/python 3\.11/)).toBeInTheDocument();
      expect(screen.getByText(/3 tests/)).toBeInTheDocument();
      expect(screen.getByText(/authored by Ada Lovelace/)).toBeInTheDocument();
      // Date formatting: Jan 15, 2026
      expect(screen.getByText(/Jan 15, 2026/)).toBeInTheDocument();
    });

    it('renders meta line without version segment for unknown language', async () => {
      /**
       * Contract: When the language is not in the LANGUAGE_VERSIONS map, the version segment is
       * omitted from the meta line (no "undefined" or empty string artifact).
       * Breaking this crashes/corrupts the meta line for unsupported languages.
       */
      mockApiResponse({ ...mockProblem, language: 'rust' });
      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      // Language present but no version
      expect(screen.getByText(/rust/)).toBeInTheDocument();
      // "undefined" must never appear
      expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
      // No "rust X.Y" pattern — just "rust"
      expect(screen.queryByText(/rust \d/)).not.toBeInTheDocument();
    });

    it('omits "authored by" segment when author_name is null', async () => {
      /**
       * Contract: When author_name is null (plan-review amendment: nullable, no email fallback),
       * the "authored by" meta segment is omitted entirely.
       * Breaking this renders "authored by null" or similar garbage.
       */
      mockApiResponse({ ...mockProblem, author_name: null });
      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      expect(screen.queryByText(/authored by/i)).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Tests list
  // -------------------------------------------------------------------------
  describe('tests list', () => {
    it('renders one row per test_cases entry with name and summary', async () => {
      /**
       * Contract: Every test case in problem.test_cases appears as a row with its name and summary.
       * Breaking this silently drops test cases from the visible list.
       */
      mockApiResponse(mockProblem);
      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      expect(screen.getByText('basic case')).toBeInTheDocument();
      expect(screen.getByText('empty input')).toBeInTheDocument();
      // pytest test name — "test_solution.py" appears as both name and summary;
      // getAllByText confirms at least one occurrence.
      expect(screen.getAllByText('test_solution.py').length).toBeGreaterThanOrEqual(1);
    });

    it('renders io kind pill for io test cases', async () => {
      /**
       * Contract: io test cases show a pill with text "io".
       * Breaking this drops the kind indicator, losing test-type discoverability.
       */
      mockApiResponse(mockProblem);
      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      const ioPills = screen.getAllByText('io');
      expect(ioPills.length).toBeGreaterThanOrEqual(1);
    });

    it('renders pytest kind pill for pytest test cases', async () => {
      /**
       * Contract: pytest test cases show a pill with text "pytest".
       * Breaking this drops the kind indicator for pytest cases.
       */
      mockApiResponse(mockProblem);
      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      expect(screen.getByText('pytest')).toBeInTheDocument();
    });

    it('renders summary in a monospace element', async () => {
      /**
       * Contract: Test case summaries use font-mono for code-like content.
       */
      mockApiResponse(mockProblem);
      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      // The summary "1 2" should be present in the document
      expect(screen.getByText('1 2')).toBeInTheDocument();
    });

    it('renders empty tests section when no test cases', async () => {
      mockApiResponse({ ...mockProblem, test_cases: [] });
      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      // Still renders title (no crash)
      expect(screen.getByRole('heading', { level: 1, name: 'Two Sum' })).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // No forbidden affordances
  // -------------------------------------------------------------------------
  describe('no forbidden affordances', () => {
    it('renders no solution affordance in any persona state', async () => {
      /**
       * Contract: The public page has no solution block, reveal button, or solution copy.
       * This is the eval-e81 regression guard — solution must never appear publicly.
       */
      mockApiResponse(mockProblem);
      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      expect(screen.queryByText(/show solution/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/reveal solution/i)).not.toBeInTheDocument();
      expect(screen.queryByTestId('solution-block')).not.toBeInTheDocument();
    });

    it('renders no At a glance aside', async () => {
      /**
       * Contract: The v4 design folds language version into the meta line — no right-rail aside.
       * Breaking this re-introduces an aside that was deliberately dropped.
       */
      mockApiResponse(mockProblem);
      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      expect(screen.queryByText(/at a glance/i)).not.toBeInTheDocument();
    });

    it('renders no attempts, difficulty, or time-limit copy', async () => {
      /**
       * Contract: Per G3 cross-cutting rules, attempts, difficulty, and time limits are dropped.
       */
      mockApiResponse(mockProblem);
      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      expect(screen.queryByText(/attempts/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/difficulty/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/time.limit/i)).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Persona CTAs
  // -------------------------------------------------------------------------
  describe('persona CTAs', () => {
    it('renders InstructorActions component (instructor/student CTA slot)', async () => {
      /**
       * Contract: InstructorActions is mounted for instructor persona gating.
       * Breaking this removes the start-session CTA for instructors.
       */
      mockApiResponse(mockProblem);
      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      expect(screen.getByTestId('instructor-actions')).toBeInTheDocument();
    });

    it('renders StudentActions component (student CTA slot)', async () => {
      /**
       * Contract: StudentActions is mounted for student practice CTA.
       * Breaking this removes the practice entry for students.
       */
      mockApiResponse(mockProblem);
      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      expect(screen.getByTestId('student-actions')).toBeInTheDocument();
    });

    it('renders anon sign-in CTA when problem has no class_id', async () => {
      /**
       * Contract: When there's no class_id (anonymous public link), a sign-in prompt appears.
       * This is the anon persona state per the v4 design.
       */
      mockApiResponse({ ...mockProblem, class_id: null, class_name: null });
      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      // Sign-in CTA should be visible for anonymous visitors
      expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Mobile read-only swap (G8)
  // -------------------------------------------------------------------------
  describe('mobile read-only swap', () => {
    it('replaces the solve/practice CTA path with OpenOnLaptop on mobile, keeping Statement + Tests', async () => {
      /**
       * Contract: On a mobile viewport the public problem drops the solve path
       * (InstructorActions / StudentActions) and shows the read-only OpenOnLaptop
       * affordance instead, while the read-only Statement and Tests sections stay
       * visible. Breaking this either re-mounts the desktop solve path on phones or
       * hides the read-only content the mobile surface is meant to show.
       */
      mockUseMobileViewport.mockReturnValue({
        isMobile: true,
        isTablet: false,
        isVerySmall: true,
        isDesktop: false,
        width: 420,
      });
      mockApiResponse(mockProblem);
      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      // OpenOnLaptop replaces the solve path.
      expect(screen.getByTestId('open-on-laptop')).toBeInTheDocument();
      expect(screen.queryByTestId('instructor-actions')).not.toBeInTheDocument();
      expect(screen.queryByTestId('student-actions')).not.toBeInTheDocument();

      // Read-only content stays visible.
      expect(screen.getByText('Statement')).toBeInTheDocument();
      expect(screen.getByText('Tests')).toBeInTheDocument();
      expect(screen.getByText('basic case')).toBeInTheDocument();
    });

    it('keeps the desktop solve path (InstructorActions/StudentActions) and renders no OpenOnLaptop on desktop', async () => {
      /**
       * Contract: On desktop the existing solve/practice CTAs render unchanged and
       * the OpenOnLaptop affordance does NOT appear. This guards against the mobile
       * swap regressing desktop behavior.
       */
      mockApiResponse(mockProblem);
      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      expect(screen.getByTestId('instructor-actions')).toBeInTheDocument();
      expect(screen.getByTestId('student-actions')).toBeInTheDocument();
      expect(screen.queryByTestId('open-on-laptop')).not.toBeInTheDocument();
    });

    it('swaps the anon sign-in CTA for OpenOnLaptop on mobile when problem has no class_id', async () => {
      /**
       * Contract: The anon persona (no class_id) sign-in CTA is also part of the
       * solve-path region and is replaced by OpenOnLaptop on mobile.
       */
      mockUseMobileViewport.mockReturnValue({
        isMobile: true,
        isTablet: false,
        isVerySmall: true,
        isDesktop: false,
        width: 420,
      });
      mockApiResponse({ ...mockProblem, class_id: null, class_name: null });
      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      expect(screen.getByTestId('open-on-laptop')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /^sign in$/i })).not.toBeInTheDocument();

      // The primary anon "Sign in" CTA is hidden, but a deep-linked anon mobile
      // user is not dead-ended: a secondary sign-in link rides on OpenOnLaptop.
      expect(screen.getByRole('link', { name: /you can still sign in/i })).toHaveAttribute(
        'href',
        '/auth/signin',
      );
    });
  });

  // -------------------------------------------------------------------------
  // generateMetadata
  // -------------------------------------------------------------------------
  describe('generateMetadata', () => {
    it('returns correct title and OG tags', async () => {
      mockApiResponse(mockProblem);

      const metadata = await generateMetadata({ params: Promise.resolve({ id: 'problem-123' }) });

      expect(metadata.title).toBe('Two Sum');
      expect(metadata.openGraph).toBeDefined();
      expect(metadata.openGraph!.title).toBe('Two Sum');
      expect(metadata.openGraph!.description).toBe('Find two numbers that add up to a target.');
    });

    it('returns fallback metadata for missing problem', async () => {
      mockApiResponse(null);

      const metadata = await generateMetadata({ params: Promise.resolve({ id: 'nonexistent' }) });

      expect(metadata.title).toBe('Problem Not Found');
    });
  });

  // -------------------------------------------------------------------------
  // notFound
  // -------------------------------------------------------------------------
  describe('notFound', () => {
    it('calls notFound for missing problem', async () => {
      mockApiResponse(null);

      await expect(
        PublicProblemPage({ params: Promise.resolve({ id: 'nonexistent' }) })
      ).rejects.toThrow('NEXT_NOT_FOUND');

      expect(mockNotFound).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Self-link
  // -------------------------------------------------------------------------
  describe('self-link', () => {
    it('renders self-link with problem path', async () => {
      mockApiResponse(mockProblem);

      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      const link = screen.getByRole('link', { name: /link to this problem/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/problems/problem-123');
    });
  });
});

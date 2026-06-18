/**
 * Tests for the instructor private problem view (/instructor/problems/[id]).
 * @jest-environment jsdom
 *
 * Contract verified: the private view wires getProblem → title/meta/statement,
 * routes "Open in editor" to the query-param editor flow, copies the public link,
 * and drives a session launch through the shared SessionComposer (createSession +
 * navigation). The composer rail must source sections from getClassSections (so
 * co-instructor classes appear) with the live pill keyed on current_session_id, and
 * surface publish UI only for unpublished sections.
 *
 * Why it matters: this is the primary launch surface under the pointer model; data
 * wiring, editor-route, public-link URL, and launch wiring regressions would silently
 * break the instructor workflow. What breaks if violated: instructors land on a blank
 * view, lose the editor link, copy the wrong URL, or fail to start a class.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InstructorProblemViewPage from '../page';
import { getProblem } from '@/lib/api/problems';
import { getClassSections } from '@/lib/api/sections';
import { getInstructorDashboard } from '@/lib/api/instructor';
import { createSession } from '@/lib/api/sessions';
import { listProblemSections } from '@/lib/api/section-problems';

const mockRouterPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    back: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    refresh: jest.fn(),
    forward: jest.fn(),
  }),
  useParams: () => ({ id: 'problem-1' }),
}));

jest.mock('@/lib/api/problems', () => ({ getProblem: jest.fn() }));
jest.mock('@/lib/api/sections', () => ({ getClassSections: jest.fn() }));
jest.mock('@/lib/api/instructor', () => ({ getInstructorDashboard: jest.fn() }));
jest.mock('@/lib/api/sessions', () => ({ createSession: jest.fn() }));
jest.mock('@/lib/api/section-problems', () => ({ listProblemSections: jest.fn() }));

const mockGetProblem = getProblem as jest.Mock;
const mockGetClassSections = getClassSections as jest.Mock;
const mockGetInstructorDashboard = getInstructorDashboard as jest.Mock;
const mockCreateSession = createSession as jest.Mock;
const mockListProblemSections = listProblemSections as jest.Mock;

const PROBLEM = {
  id: 'problem-1',
  namespace_id: 'ns-1',
  title: 'Two Sum',
  description: 'Given an array, return indices.',
  starter_code: 'def two_sum():\n    pass',
  test_cases: [
    { kind: 'io', order: 0, input: '1', expected_output: '2' },
    { kind: 'io', order: 1, input: '3', expected_output: '4' },
    { kind: 'pytest', target_path: 'tests/test_x.py::test_a', test_code: '' },
  ],
  author_id: 'user-1',
  class_id: 'class-1',
  tags: ['arrays'],
  solution: null,
  language: 'python',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

const SECTION_A = {
  id: 'section-a',
  namespace_id: 'ns-1',
  class_id: 'class-1',
  name: 'CS 101 · Period 3',
  semester: 'Spring',
  join_code: 'ABC123',
  active: true,
  current_session_id: 'live-session-9',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

const SECTION_B = {
  id: 'section-b',
  namespace_id: 'ns-1',
  class_id: 'class-1',
  name: 'CS 101 · Period 5',
  semester: 'Spring',
  join_code: 'DEF456',
  active: true,
  current_session_id: null,
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetProblem.mockResolvedValue(PROBLEM);
  mockGetClassSections.mockResolvedValue([SECTION_A, SECTION_B]);
  mockGetInstructorDashboard.mockResolvedValue({
    classes: [
      { id: 'class-1', name: 'CS 101', sections: [{ id: 'section-a', name: 'Period 3', join_code: 'ABC123', studentCount: 22 }] },
    ],
  });
  mockListProblemSections.mockResolvedValue([]); // not published anywhere
  mockCreateSession.mockResolvedValue({ id: 'new-session-1' });
  Object.assign(navigator, {
    clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
  });
});

async function renderPage() {
  render(<InstructorProblemViewPage />);
  await waitFor(() => expect(screen.getByText('Two Sum')).toBeInTheDocument());
}

describe('InstructorProblemViewPage', () => {
  it('renders title, meta line, and statement from getProblem', async () => {
    await renderPage();

    expect(screen.getByText('Two Sum')).toBeInTheDocument();
    // 3 test cases total in the meta line
    expect(screen.getByText(/3 tests/)).toBeInTheDocument();
    expect(screen.getByText(/Given an array, return indices\./)).toBeInTheDocument();
    expect(screen.getByTestId('instructor-problem-view')).toBeInTheDocument();
  });

  it('"Open in editor" routes to /instructor/problems?edit={id}', async () => {
    await renderPage();

    fireEvent.click(screen.getByRole('button', { name: /open in editor/i }));
    expect(mockRouterPush).toHaveBeenCalledWith('/instructor/problems?edit=problem-1');
  });

  it('"Copy public link" writes ${origin}/problems/{id} to the clipboard', async () => {
    await renderPage();

    fireEvent.click(screen.getByRole('button', { name: /copy public link/i }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        `${window.location.origin}/problems/problem-1`
      );
    });
  });

  it('composer start calls createSession with selected section + problem id and navigates', async () => {
    // Already-published so no publish UI complicates the flow.
    mockListProblemSections.mockResolvedValue([{ section_id: 'section-b' }]);
    await renderPage();

    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /Period 5/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('radio', { name: /Period 5/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start session/i })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /start session/i }));

    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalledWith(
        'section-b',
        'problem-1',
        undefined, // published → show_solution omitted
        { setCurrent: true }
      );
    });
    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/instructor/session/new-session-1');
    });
  });

  it('unpublished section shows publish UI and passes show_solution only then', async () => {
    mockListProblemSections.mockResolvedValue([]); // nothing published
    await renderPage();

    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /Period 5/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('radio', { name: /Period 5/i }));

    // Publish UI from the shared hook appears for the unpublished section.
    await waitFor(() => {
      expect(screen.getByLabelText('Show solution to students')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Show solution to students'));
    fireEvent.click(screen.getByRole('button', { name: /start session/i }));

    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalledWith(
        'section-b',
        'problem-1',
        true, // show_solution passed because force-publishing
        { setCurrent: true }
      );
    });
  });

  it('generic create error → inline error, no navigation; co-instructor sections render with live pill', async () => {
    // section-a is NOT in the dashboard (co-instructor class) but IS in getClassSections.
    mockGetInstructorDashboard.mockResolvedValue({ classes: [] });
    mockListProblemSections.mockResolvedValue([{ section_id: 'section-a' }]); // published → no publish UI
    mockCreateSession.mockRejectedValue(new Error('boom'));
    await renderPage();

    // Live pill present on the section with a current_session_id.
    await waitFor(() => expect(screen.getByText('now')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('radio', { name: /Period 3/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start session/i })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /start session/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('boom');
    });
    expect(mockRouterPush).not.toHaveBeenCalledWith(expect.stringContaining('/instructor/session/'));
  });

  it('shows a not-found / error state when getProblem fails', async () => {
    mockGetProblem.mockRejectedValue(new Error('nope'));
    render(<InstructorProblemViewPage />);

    await waitFor(() => {
      expect(screen.getByText(/could not load|not found|failed/i)).toBeInTheDocument();
    });
  });
});

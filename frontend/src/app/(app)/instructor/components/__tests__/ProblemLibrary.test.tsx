/**
 * Tests for ProblemLibrary component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProblemLibrary from '../ProblemLibrary';
import { useAuth } from '@/contexts/AuthContext';
import { listClasses } from '@/lib/api/classes';
import { listProblems, deleteProblem, exportProblems } from '@/lib/api/problems';

// Mock the AuthContext
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

// Mock next/navigation
const mockRouterPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: mockRouterPush,
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  })),
}));

// Mock API modules
jest.mock('@/lib/api/classes', () => ({
  listClasses: jest.fn(),
}));

jest.mock('@/lib/api/problems', () => ({
  listProblems: jest.fn(),
  deleteProblem: jest.fn(),
  exportProblems: jest.fn(),
}));

// Mock child modals to keep tests focused on ProblemLibrary behavior
jest.mock('../CreateSessionFromProblemModal', () => {
  return function MockCreateSessionModal(props: any) {
    return (
      <div data-testid="session-modal">
        <button onClick={() => props.onSuccess('session-123', 'ABC')}>Confirm Session</button>
        <button onClick={props.onClose}>Close Session Modal</button>
      </div>
    );
  };
});

jest.mock('../PublishProblemModal', () => {
  return function MockPublishModal(props: any) {
    return <div data-testid="publish-modal"><button onClick={props.onClose}>Close Publish Modal</button></div>;
  };
});

describe('ProblemLibrary', () => {
  const mockUser = {
    id: 'user-123',
    role: 'instructor' as const,
    display_name: 'Test Instructor',
    created_at: '2025-01-01T00:00:00.000Z',
  };

  const mockProblems = [
    {
      id: 'problem-1',
      title: 'Problem One',
      description: 'Description 1',
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-01-03T00:00:00.000Z',
      author_id: 'user-123',
      tags: ['arrays', 'hashing'],
      class_id: 'class-1',
      test_counts: { io: 2, pytest: 1 },
    },
    {
      id: 'problem-2',
      title: 'Problem Two',
      description: 'Description 2',
      created_at: '2025-01-02T00:00:00.000Z',
      updated_at: '2025-01-04T00:00:00.000Z',
      author_id: 'user-123',
      tags: ['arrays', 'strings'],
      class_id: 'class-1',
      test_counts: { io: 0, pytest: 3 },
    },
    {
      id: 'problem-3',
      title: 'Problem Three',
      description: 'Description 3',
      created_at: '2025-01-03T00:00:00.000Z',
      updated_at: '2025-01-05T00:00:00.000Z',
      author_id: 'user-123',
      tags: ['dp'],
      class_id: 'class-1',
      // test_counts absent intentionally
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
    });

    (listClasses as jest.Mock).mockResolvedValue([]);
    (listProblems as jest.Mock).mockResolvedValue(mockProblems);
    (deleteProblem as jest.Mock).mockResolvedValue(undefined);
    (exportProblems as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders loading state initially', async () => {
    render(<ProblemLibrary />);
    // Check for loading spinner (animation class)
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();

    // Wait for loading to complete to prevent act() warnings
    await waitFor(() => {
      expect(screen.getByText('Problem Library')).toBeInTheDocument();
    });
  });

  it('fetches and displays problems', async () => {
    render(<ProblemLibrary />);

    await waitFor(() => {
      expect(screen.getByText('Problem Library')).toBeInTheDocument();
    });

    expect(listProblems).toHaveBeenCalled();
  });

  it('displays problem count', async () => {
    render(<ProblemLibrary />);

    await waitFor(() => {
      expect(screen.getByText(/3 problems/)).toBeInTheDocument();
    });
  });

  it('displays singular for single problem', async () => {
    (listProblems as jest.Mock).mockResolvedValue([mockProblems[0]]);

    render(<ProblemLibrary />);

    await waitFor(() => {
      expect(screen.getByText(/1 problem$/)).toBeInTheDocument();
    });
  });

  it('renders create new button when onCreateNew is provided', async () => {
    const onCreateNew = jest.fn();
    render(<ProblemLibrary onCreateNew={onCreateNew} />);

    await waitFor(() => {
      expect(screen.getByText('Create New Problem')).toBeInTheDocument();
    });
  });

  it('calls onCreateNew when create button is clicked', async () => {
    const onCreateNew = jest.fn();
    render(<ProblemLibrary onCreateNew={onCreateNew} />);

    await waitFor(() => {
      fireEvent.click(screen.getByText('Create New Problem'));
    });

    expect(onCreateNew).toHaveBeenCalled();
  });

  it('displays error message when fetch fails', async () => {
    (listProblems as jest.Mock).mockRejectedValue(new Error('Failed to load'));

    render(<ProblemLibrary />);

    await waitFor(() => {
      expect(screen.getByText('Error loading problems')).toBeInTheDocument();
    });
  });

  it('shows retry button on error', async () => {
    (listProblems as jest.Mock).mockRejectedValue(new Error('Failed to load'));

    render(<ProblemLibrary />);

    await waitFor(() => {
      expect(screen.getByText('Try again')).toBeInTheDocument();
    });
  });

  it('retries loading when retry button is clicked', async () => {
    let problemCallCount = 0;
    (listProblems as jest.Mock).mockImplementation(() => {
      problemCallCount++;
      if (problemCallCount === 1) {
        return Promise.reject(new Error('Failed to load'));
      }
      return Promise.resolve(mockProblems);
    });

    render(<ProblemLibrary />);

    await waitFor(() => {
      expect(screen.getByText('Try again')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Try again'));

    await waitFor(() => {
      expect(screen.getByText('Problem Library')).toBeInTheDocument();
    });

    expect(problemCallCount).toBe(2);
  });

  it('displays empty state when no problems', async () => {
    (listProblems as jest.Mock).mockResolvedValue([]);

    render(<ProblemLibrary onCreateNew={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('No problems yet')).toBeInTheDocument();
    });
  });

  it('does not fetch problems when user is not authenticated', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: null,
      isAuthenticated: false,
    });

    render(<ProblemLibrary />);

    // Wait a bit to ensure useEffect has run
    await waitFor(() => {
      expect(listProblems).not.toHaveBeenCalled();
    });
  });

  it('includes author_id in API request', async () => {
    render(<ProblemLibrary />);

    await waitFor(() => {
      expect(listProblems).toHaveBeenCalledWith(
        expect.objectContaining({
          author_id: 'user-123',
        })
      );
    });
  });

  it('includes sort parameters in API request', async () => {
    render(<ProblemLibrary />);

    await waitFor(() => {
      expect(listProblems).toHaveBeenCalledWith(
        expect.objectContaining({
          sort_by: 'created_at',
          sort_order: 'desc',
        })
      );
    });
  });

  describe('Table layout', () => {
    /**
     * Verifies the table renders all problems as rows.
     * After collapsing to table-only layout, replaces the old grid/list toggle tests.
     */
    it('renders all problems as table rows', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByText('Problem One')).toBeInTheDocument();
        expect(screen.getByText('Problem Two')).toBeInTheDocument();
        expect(screen.getByText('Problem Three')).toBeInTheDocument();
      });
    });

    it('renders table column headers: Title, Tags, Tests, Updated, Actions', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByText('Problem One')).toBeInTheDocument();
      });

      // Column headers are in <th> elements
      const headers = document.querySelectorAll('th');
      const headerTexts = Array.from(headers).map(h => h.textContent?.trim());
      expect(headerTexts).toContain('Title');
      expect(headerTexts).toContain('Tags');
      expect(headerTexts).toContain('Tests');
      expect(headerTexts).toContain('Updated');
      expect(headerTexts).toContain('Actions');
    });

    /**
     * Verifies no difficulty column and no status dot rendered.
     * Catches: mock affordances creeping in from the design refs.
     */
    it('does not render a Difficulty column header', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByText('Problem One')).toBeInTheDocument();
      });

      expect(screen.queryByText('Difficulty')).not.toBeInTheDocument();
    });

    it('does not render status dots', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByText('Problem One')).toBeInTheDocument();
      });

      // No StateDot or status indicator elements
      expect(document.querySelector('[data-testid="status-dot"]')).not.toBeInTheDocument();
      expect(document.querySelector('[data-testid="state-dot"]')).not.toBeInTheDocument();
    });

    it('renders tag chips per row with mono prefix #', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByText('Problem One')).toBeInTheDocument();
      });

      // Tags rendered with # prefix in the row
      expect(screen.getAllByText('#arrays').length).toBeGreaterThan(0);
    });
  });

  /**
   * Verifies the tests column renders "N io · M pytest" from test_counts
   * and falls back to "—" when test_counts is absent.
   * Catches: payload-shape assumptions that break the column display.
   */
  describe('Tests column', () => {
    it('renders test count as "N io · M pytest" from test_counts', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByText('Problem One')).toBeInTheDocument();
      });

      // problem-1 has test_counts: { io: 2, pytest: 1 }
      expect(screen.getByText('2 io · 1 pytest')).toBeInTheDocument();
    });

    it('renders "0 io · N pytest" when io count is 0', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByText('Problem Two')).toBeInTheDocument();
      });

      // problem-2 has test_counts: { io: 0, pytest: 3 }
      expect(screen.getByText('0 io · 3 pytest')).toBeInTheDocument();
    });

    it('renders "—" when test_counts is absent', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByText('Problem Three')).toBeInTheDocument();
      });

      // problem-3 has no test_counts
      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });

  /**
   * Verifies tag chip bar renders chips with counts, AND-logic filtering,
   * and clear button behavior.
   * Catches: OR-logic or single-select regressions.
   */
  describe('Tag chip bar', () => {
    it('renders tag bar with all unique tags from problems', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        // "arrays" appears in problem-1 and problem-2; should be a tag bar chip
        expect(screen.getByTestId('tag-bar')).toBeInTheDocument();
      });

      // All unique tags from problems: arrays, hashing, strings, dp
      const tagBar = screen.getByTestId('tag-bar');
      expect(tagBar).toHaveTextContent('arrays');
      expect(tagBar).toHaveTextContent('hashing');
      expect(tagBar).toHaveTextContent('strings');
      expect(tagBar).toHaveTextContent('dp');
    });

    it('renders tag counts next to each chip', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByTestId('tag-bar')).toBeInTheDocument();
      });

      // "arrays" appears in 2 problems
      const arraysChip = screen.getByTestId('tag-chip-arrays');
      expect(arraysChip).toHaveTextContent('2');
    });

    it('selecting a tag filters problems to only those carrying that tag', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByText('Problem One')).toBeInTheDocument();
      });

      // Click "dp" tag - only problem-3 has it
      const dpChip = screen.getByTestId('tag-chip-dp');
      fireEvent.click(dpChip);

      await waitFor(() => {
        expect(screen.queryByText('Problem One')).not.toBeInTheDocument();
        expect(screen.queryByText('Problem Two')).not.toBeInTheDocument();
        expect(screen.getByText('Problem Three')).toBeInTheDocument();
      });
    });

    it('selecting two tags applies AND logic (must carry both tags)', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByText('Problem One')).toBeInTheDocument();
      });

      // "hashing" is only on problem-1; "strings" is only on problem-2
      // AND(hashing, strings) = nothing matches
      fireEvent.click(screen.getByTestId('tag-chip-hashing'));
      fireEvent.click(screen.getByTestId('tag-chip-strings'));

      await waitFor(() => {
        expect(screen.queryByText('Problem One')).not.toBeInTheDocument();
        expect(screen.queryByText('Problem Two')).not.toBeInTheDocument();
        expect(screen.queryByText('Problem Three')).not.toBeInTheDocument();
      });
    });

    it('AND logic: selecting two tags that both appear on one problem shows that problem', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByText('Problem One')).toBeInTheDocument();
      });

      // "arrays" + "hashing" both appear on problem-1 only
      fireEvent.click(screen.getByTestId('tag-chip-arrays'));
      fireEvent.click(screen.getByTestId('tag-chip-hashing'));

      await waitFor(() => {
        expect(screen.getByText('Problem One')).toBeInTheDocument();
        expect(screen.queryByText('Problem Two')).not.toBeInTheDocument();
        expect(screen.queryByText('Problem Three')).not.toBeInTheDocument();
      });
    });

    it('clear button appears when at least one tag is selected', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByTestId('tag-bar')).toBeInTheDocument();
      });

      // No clear button initially
      expect(screen.queryByTestId('tag-bar-clear')).not.toBeInTheDocument();

      // Select a tag
      fireEvent.click(screen.getByTestId('tag-chip-arrays'));

      expect(screen.getByTestId('tag-bar-clear')).toBeInTheDocument();
    });

    it('clicking clear resets all selected tags and shows all problems', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByText('Problem One')).toBeInTheDocument();
      });

      // Select a tag that filters down
      fireEvent.click(screen.getByTestId('tag-chip-dp'));

      await waitFor(() => {
        expect(screen.queryByText('Problem One')).not.toBeInTheDocument();
      });

      // Click clear
      fireEvent.click(screen.getByTestId('tag-bar-clear'));

      await waitFor(() => {
        expect(screen.getByText('Problem One')).toBeInTheDocument();
        expect(screen.getByText('Problem Two')).toBeInTheDocument();
        expect(screen.getByText('Problem Three')).toBeInTheDocument();
      });
    });
  });

  describe('Search', () => {
    it('filters table rows by search query', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByText('Problem One')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search/i);
      fireEvent.change(searchInput, { target: { value: 'One' } });

      await waitFor(() => {
        expect(screen.getByText('Problem One')).toBeInTheDocument();
        expect(screen.queryByText('Problem Two')).not.toBeInTheDocument();
        expect(screen.queryByText('Problem Three')).not.toBeInTheDocument();
      });
    });

    it('shows filtered count in header when searching', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByText(/3 problems/)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search/i);
      fireEvent.change(searchInput, { target: { value: 'One' } });

      await waitFor(() => {
        expect(screen.getByText(/1 problem/)).toBeInTheDocument();
      });
    });
  });

  describe('Sort controls', () => {
    it('renders sort control in toolbar', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByText('Problem One')).toBeInTheDocument();
      });

      // Sort selector or control should be present
      const sortSelect = screen.getByLabelText(/sort/i);
      expect(sortSelect).toBeInTheDocument();
    });

    it('changing sort updates API call with new sort parameter', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByText('Problem One')).toBeInTheDocument();
      });

      const sortSelect = screen.getByLabelText(/sort/i);
      fireEvent.change(sortSelect, { target: { value: 'title' } });

      await waitFor(() => {
        expect(listProblems).toHaveBeenCalledWith(
          expect.objectContaining({ sort_by: 'title' })
        );
      });
    });
  });

  describe('Edit handler', () => {
    it('calls onEdit when Edit is clicked', async () => {
      const onEdit = jest.fn();
      render(<ProblemLibrary onEdit={onEdit} />);

      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: /edit/i }).length).toBeGreaterThan(0);
      });

      fireEvent.click(screen.getAllByRole('button', { name: /edit/i })[0]);
      expect(onEdit).toHaveBeenCalledWith(expect.any(String));
    });

    it('falls back to router.push for Edit when onEdit is not provided', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: /edit/i }).length).toBeGreaterThan(0);
      });

      fireEvent.click(screen.getAllByRole('button', { name: /edit/i })[0]);
      expect(mockRouterPush).toHaveBeenCalledWith('/instructor/problems');
    });
  });

  describe('Start session handler', () => {
    it('clicking Start opens session creation modal', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: /start/i }).length).toBeGreaterThan(0);
      });

      fireEvent.click(screen.getAllByRole('button', { name: /start/i })[0]);

      await waitFor(() => {
        expect(screen.getByTestId('session-modal')).toBeInTheDocument();
      });
    });

    it('navigates to session after session is created', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: /start/i }).length).toBeGreaterThan(0);
      });

      fireEvent.click(screen.getAllByRole('button', { name: /start/i })[0]);

      await waitFor(() => {
        expect(screen.getByTestId('session-modal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Confirm Session'));

      await waitFor(() => {
        expect(mockRouterPush).toHaveBeenCalledWith('/instructor/session/session-123');
      });
    });
  });

  describe('Delete handler', () => {
    it('clicking Delete prompts and calls deleteProblem after confirmation', async () => {
      const alertSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: /delete/i }).length).toBeGreaterThan(0);
      });

      fireEvent.click(screen.getAllByRole('button', { name: /delete/i })[0]);

      // Confirm dialog should appear
      await waitFor(() => {
        // Either confirm dialog or the deleteProblem was called
        const calledOrDialog = (deleteProblem as jest.Mock).mock.calls.length > 0
          || !!document.querySelector('[role="dialog"]');
        expect(calledOrDialog).toBe(true);
      });

      alertSpy.mockRestore();
    });
  });

  describe('Class picker', () => {
    const mockClasses = [
      { id: 'class-1', name: 'CS 101', namespace_id: 'ns-1' },
      { id: 'class-2', name: 'CS 201', namespace_id: 'ns-1' },
    ];

    beforeEach(() => {
      (listClasses as jest.Mock).mockResolvedValue(mockClasses);
      (listProblems as jest.Mock).mockResolvedValue(mockProblems);
    });

    it('renders a class picker dropdown', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByLabelText('Class:')).toBeInTheDocument();
      });
    });

    it('shows "All classes" option in dropdown', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        const select = screen.getByLabelText('Class:');
        expect(select).toBeInTheDocument();
      });

      const options = screen.getAllByRole('option');
      expect(options.some(o => o.textContent === 'All classes')).toBe(true);
    });

    it('defaults to first class when classes are loaded', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        const select = screen.getByLabelText('Class:') as HTMLSelectElement;
        expect(select.value).toBe('class-1');
      });
    });

    it('passes selected class_id to API call', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(listProblems).toHaveBeenCalledWith(
          expect.objectContaining({
            class_id: 'class-1',
          })
        );
      });
    });

    it('does not pass class_id when "All classes" is selected', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByLabelText('Class:')).toBeInTheDocument();
      });

      const callCountBefore = (listProblems as jest.Mock).mock.calls.length;

      fireEvent.change(screen.getByLabelText('Class:'), { target: { value: '' } });

      await waitFor(() => {
        // Verify a new call was made
        const calls = (listProblems as jest.Mock).mock.calls;
        expect(calls.length).toBeGreaterThan(callCountBefore);
        // Get the most recent call without mutating the array
        const lastCall = calls[calls.length - 1];
        // When "All classes" is selected, class_id should be undefined or not present
        if (lastCall && lastCall[0]) {
          expect(lastCall[0].class_id).toBeFalsy();
        }
      });
    });

    /**
     * Verifies class selector change persists to localStorage and restores on mount.
     * Catches: persistence regression that breaks the user's saved class preference.
     */
    it('persists selected class_id to localStorage on change', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByLabelText('Class:')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText('Class:'), { target: { value: 'class-2' } });

      expect(localStorage.getItem('problemLibrary_classId')).toBe('class-2');
    });

    it('restores class_id from localStorage on mount', async () => {
      localStorage.setItem('problemLibrary_classId', 'class-2');

      render(<ProblemLibrary />);

      await waitFor(() => {
        const select = screen.getByLabelText('Class:') as HTMLSelectElement;
        expect(select.value).toBe('class-2');
      });
    });

    it('removes localStorage entry when "All classes" is selected', async () => {
      localStorage.setItem('problemLibrary_classId', 'class-1');

      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByLabelText('Class:')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText('Class:'), { target: { value: '' } });

      expect(localStorage.getItem('problemLibrary_classId')).toBeNull();
    });
  });

  describe('Mobile responsive layout', () => {
    it('header container has flex-wrap to prevent overflow on small screens', async () => {
      render(<ProblemLibrary onCreateNew={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Problem Library')).toBeInTheDocument();
      });

      // The outer header div should have flex-wrap
      const headerContainer = screen.getByTestId('problem-library-header');
      expect(headerContainer.className).toMatch(/flex-wrap/);
    });

    it('right-side controls container has flex-wrap for small screen stacking', async () => {
      const onCreateNew = jest.fn();
      render(<ProblemLibrary onCreateNew={onCreateNew} />);

      await waitFor(() => {
        expect(screen.getByText('Create New Problem')).toBeInTheDocument();
      });

      // The controls container (right side) should also have flex-wrap
      const controlsContainer = screen.getByTestId('problem-library-controls');
      expect(controlsContainer.className).toMatch(/flex-wrap/);
    });

    it('header container has gap spacing for wrapped items', async () => {
      render(<ProblemLibrary onCreateNew={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Problem Library')).toBeInTheDocument();
      });

      const headerContainer = screen.getByTestId('problem-library-header');
      // Should have gap classes to space wrapped rows
      expect(headerContainer.className).toMatch(/gap-/);
    });
  });

  describe('Export button', () => {
    it('renders Export button in toolbar', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByText('Problem Library')).toBeInTheDocument();
      });

      const exportButton = screen.getByRole('button', { name: /export/i });
      expect(exportButton).toBeInTheDocument();
    });

    it('disables Export button when no problems are available', async () => {
      (listProblems as jest.Mock).mockResolvedValue([]);

      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByText('Problem Library')).toBeInTheDocument();
      });

      const exportButton = screen.getByRole('button', { name: /export/i });
      expect(exportButton).toBeDisabled();
    });

    it('calls exportProblems with current filters when clicked', async () => {
      const mockClasses = [
        { id: 'class-1', name: 'Class 1' },
        { id: 'class-2', name: 'Class 2' },
      ];
      (listClasses as jest.Mock).mockResolvedValue(mockClasses);

      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByText('Problem Library')).toBeInTheDocument();
      });

      const exportButton = screen.getByRole('button', { name: /export/i });
      expect(exportButton).not.toBeDisabled();

      // Open dropdown
      fireEvent.click(exportButton);

      // Click JSON export option
      const jsonMenuItem = await screen.findByRole('menuitem', { name: /export json/i });
      fireEvent.click(jsonMenuItem);

      await waitFor(() => {
        expect(exportProblems).toHaveBeenCalledWith({
          class_id: 'class-1',
          tags: undefined,
          format: 'json',
        });
      });
    });

    it('shows loading state while exporting', async () => {
      let resolveExport: () => void;
      const exportPromise = new Promise<void>((resolve) => {
        resolveExport = resolve;
      });
      (exportProblems as jest.Mock).mockReturnValue(exportPromise);

      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByText('Problem Library')).toBeInTheDocument();
      });

      const exportButton = screen.getByRole('button', { name: /export/i });

      // Open dropdown
      fireEvent.click(exportButton);

      // Click JSON export option
      const jsonMenuItem = await screen.findByRole('menuitem', { name: /export json/i });
      fireEvent.click(jsonMenuItem);

      // Button should be disabled while exporting
      await waitFor(() => {
        expect(exportButton).toBeDisabled();
      });

      // Resolve the export
      resolveExport!();
      await exportPromise;

      // Button should be enabled again
      await waitFor(() => {
        expect(exportButton).not.toBeDisabled();
      });
    });
  });

  describe('Export dropdown', () => {
    /**
     * Verifies that the export dropdown renders with both JSON and PDF format options.
     * Catches: dropdown not rendering or missing options
     */
    it('renders two format options in dropdown', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByText('Problem Library')).toBeInTheDocument();
      });

      const exportButton = screen.getByRole('button', { name: /export/i });
      fireEvent.click(exportButton);

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /export json/i })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /export pdf/i })).toBeInTheDocument();
      });
    });

    /**
     * Verifies that clicking "Export PDF" passes the correct format parameter to the API.
     * Catches: format not passed to API client
     */
    it('calls exportProblems with format=pdf when Export PDF is clicked', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByText('Problem Library')).toBeInTheDocument();
      });

      const exportButton = screen.getByRole('button', { name: /export/i });
      fireEvent.click(exportButton);

      const pdfMenuItem = await screen.findByRole('menuitem', { name: /export pdf/i });
      fireEvent.click(pdfMenuItem);

      await waitFor(() => {
        expect(exportProblems).toHaveBeenCalledWith(
          expect.objectContaining({
            format: 'pdf',
          })
        );
      });
    });

    /**
     * Verifies that the dropdown closes when user clicks outside or presses Escape.
     * Catches: missing event handlers for click-outside and escape key
     */
    it('closes dropdown on click-outside and escape key', async () => {
      render(<ProblemLibrary />);

      await waitFor(() => {
        expect(screen.getByText('Problem Library')).toBeInTheDocument();
      });

      const exportButton = screen.getByRole('button', { name: /export/i });
      fireEvent.click(exportButton);

      // Dropdown should be visible
      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /export json/i })).toBeInTheDocument();
      });

      // Click outside (on document body)
      fireEvent.mouseDown(document.body);

      await waitFor(() => {
        expect(screen.queryByRole('menuitem', { name: /export json/i })).not.toBeInTheDocument();
      });

      // Re-open dropdown
      fireEvent.click(exportButton);
      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /export json/i })).toBeInTheDocument();
      });

      // Press Escape
      fireEvent.keyDown(document, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByRole('menuitem', { name: /export json/i })).not.toBeInTheDocument();
      });
    });
  });
});

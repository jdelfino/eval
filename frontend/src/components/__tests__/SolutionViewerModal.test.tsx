/**
 * Unit tests for SolutionViewerModal — the consolidated instructor + student
 * reference-solution modal (G7-T5).
 *
 * Contract: one component, built on Modal + Tabs, exposes the `solution-viewer-modal`
 * testid and role="dialog" (both call sites depend on this), a code tab showing
 * the reference solution, and a diff tab that either diffs the viewer's last
 * revision against the solution or degrades to "No prior revision to compare".
 * DEC-10: no Notes tab; "no attempts" rule: the student banner carries no
 * attempt wording.
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SolutionViewerModal } from '../SolutionViewerModal';
import type { Revision } from '@/types/api';

const mockGetRevisions = jest.fn();
jest.mock('@/lib/api/sessions', () => ({
  getRevisions: (...args: unknown[]) => mockGetRevisions(...args),
}));

const SOLUTION = 'def two_sum(nums, target):\n    return None';

function makeRevision(overrides: Partial<Revision> = {}): Revision {
  return {
    id: 'rev-1',
    namespace_id: 'ns-1',
    session_id: 'session-1',
    user_id: 'user-1',
    timestamp: '2026-02-20T10:00:00Z',
    is_diff: false,
    diff: null,
    full_code: 'def two_sum(nums, target):\n    pass',
    base_revision_id: null,
    execution_result: null,
    student_work_id: null,
    ...overrides,
  };
}

describe('SolutionViewerModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRevisions.mockResolvedValue([]);
  });

  it('renders nothing when closed', () => {
    render(
      <SolutionViewerModal
        open={false}
        onClose={jest.fn()}
        problemTitle="Two Sum"
        solution={SOLUTION}
        variant="instructor"
      />
    );
    expect(screen.queryByTestId('solution-viewer-modal')).not.toBeInTheDocument();
  });

  it('renders the solution-viewer-modal testid, role=dialog, and the solution code on the code tab', () => {
    render(
      <SolutionViewerModal
        open
        onClose={jest.fn()}
        problemTitle="Two Sum"
        solution={SOLUTION}
        variant="instructor"
      />
    );

    expect(screen.getByTestId('solution-viewer-modal')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    const dialog = screen.getByRole('dialog');
    const code = within(dialog).getByText(/def two_sum/);
    expect(code.textContent).toContain('return None');
  });

  it('renders the problem title in the Modal heading', () => {
    render(
      <SolutionViewerModal
        open
        onClose={jest.fn()}
        problemTitle="Two Sum"
        solution={SOLUTION}
        variant="instructor"
      />
    );
    expect(
      screen.getByRole('heading', { name: /Reference solution · Two Sum/i })
    ).toBeInTheDocument();
  });

  it('has no Notes tab (DEC-10) — only code and diff tabs', () => {
    render(
      <SolutionViewerModal
        open
        onClose={jest.fn()}
        problemTitle="Two Sum"
        solution={SOLUTION}
        variant="student"
      />
    );

    const tabs = screen.getAllByRole('tab');
    const labels = tabs.map((t) => t.textContent);
    expect(labels.some((l) => /note/i.test(l ?? ''))).toBe(false);
    expect(tabs).toHaveLength(2);
  });

  it('student banner contains no "attempt" wording (no-attempts rule)', () => {
    render(
      <SolutionViewerModal
        open
        onClose={jest.fn()}
        problemTitle="Two Sum"
        solution={SOLUTION}
        variant="student"
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText(/attempt/i)).not.toBeInTheDocument();
    expect(within(dialog).getByText(/You solved this/i)).toBeInTheDocument();
  });

  it('diff tab renders a diff (solution vs last revision) when revisions are present', async () => {
    mockGetRevisions.mockResolvedValue([
      makeRevision({ full_code: 'def two_sum(nums, target):\n    pass' }),
    ]);

    render(
      <SolutionViewerModal
        open
        onClose={jest.fn()}
        problemTitle="Two Sum"
        solution={SOLUTION}
        variant="instructor"
        sessionId="session-1"
        userId="student-7"
      />
    );

    await waitFor(() => {
      expect(mockGetRevisions).toHaveBeenCalledWith('session-1', 'student-7');
    });

    await userEvent.click(screen.getByRole('tab', { name: /vs\. last revision/i }));

    const dialog = screen.getByRole('dialog');
    await waitFor(() => {
      // The removed line (last revision) and added line (solution) both appear.
      expect(within(dialog).getByText(/-\s+pass/)).toBeInTheDocument();
    });
    expect(within(dialog).getByText(/\+\s+return None/)).toBeInTheDocument();
  });

  it('diff tab shows "No prior revision to compare" when there are no revisions', async () => {
    mockGetRevisions.mockResolvedValue([]);

    render(
      <SolutionViewerModal
        open
        onClose={jest.fn()}
        problemTitle="Two Sum"
        solution={SOLUTION}
        variant="instructor"
        sessionId="session-1"
        userId="student-7"
      />
    );

    await userEvent.click(screen.getByRole('tab', { name: /vs\. last revision/i }));

    expect(
      await screen.findByText(/No prior revision to compare/i)
    ).toBeInTheDocument();
  });

  it('diff tab shows the graceful fallback when no session context is provided (student variant)', async () => {
    render(
      <SolutionViewerModal
        open
        onClose={jest.fn()}
        problemTitle="Two Sum"
        solution={SOLUTION}
        variant="student"
      />
    );

    // With no sessionId, no fetch happens at all.
    expect(mockGetRevisions).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('tab', { name: /vs\. last revision/i }));

    expect(
      await screen.findByText(/No prior revision to compare/i)
    ).toBeInTheDocument();
  });

  it('diff tab degrades gracefully when the revisions fetch errors', async () => {
    mockGetRevisions.mockRejectedValue(new Error('boom'));

    render(
      <SolutionViewerModal
        open
        onClose={jest.fn()}
        problemTitle="Two Sum"
        solution={SOLUTION}
        variant="instructor"
        sessionId="session-1"
        userId="student-7"
      />
    );

    await waitFor(() => expect(mockGetRevisions).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('tab', { name: /vs\. last revision/i }));

    expect(
      await screen.findByText(/No prior revision to compare/i)
    ).toBeInTheDocument();
  });

  it('calls onClose from the close button', async () => {
    const onClose = jest.fn();
    render(
      <SolutionViewerModal
        open
        onClose={onClose}
        problemTitle="Two Sum"
        solution={SOLUTION}
        variant="instructor"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});

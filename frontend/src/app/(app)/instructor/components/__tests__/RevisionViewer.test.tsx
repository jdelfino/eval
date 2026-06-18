/**
 * Unit tests for the reworked RevisionViewer / ReplayModal (G7-T6).
 *
 * Verifies the Replay modal renders on the Modal primitive with a revision list
 * + diff pane, derives pass/fail from execution_result, supports prev/next nav,
 * and dismisses via Escape/backdrop (a11y the old inline 900×600 div lacked).
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RevisionViewer from '../RevisionViewer';
import type { TestResponse } from '@/types/api';

const mockGetRevisions = jest.fn();
jest.mock('@/lib/api/sessions', () => ({
  getRevisions: (...args: unknown[]) => mockGetRevisions(...args),
}));

function passResult(): TestResponse {
  return {
    results: [],
    summary: { total: 2, passed: 2, failed: 0, errors: 0, run: 2, time_ms: 10 },
  };
}

function failResult(): TestResponse {
  return {
    results: [],
    summary: { total: 2, passed: 1, failed: 1, errors: 0, run: 2, time_ms: 10 },
  };
}

const REVISIONS = [
  {
    id: 'rev-1',
    timestamp: '2026-02-18T09:00:00Z',
    full_code: 'print(1)',
    execution_result: failResult(),
  },
  {
    id: 'rev-2',
    timestamp: '2026-02-18T09:01:00Z',
    full_code: 'print(2)',
    execution_result: passResult(),
  },
];

function renderViewer(onClose = jest.fn()) {
  render(
    <RevisionViewer
      session_id="session-1"
      studentId="student-1"
      studentName="Alice"
      problemTitle="FizzBuzz"
      onClose={onClose}
    />
  );
  return onClose;
}

describe('RevisionViewer (ReplayModal)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRevisions.mockResolvedValue(REVISIONS);
  });

  it('renders inside the Modal with a revision list and a diff pane', async () => {
    /**
     * Contract: the reworked viewer renders on the Modal primitive (role=dialog)
     * with the two-column revision-list + diff layout. Catches: rework wiring loss.
     */
    renderViewer();

    expect(await screen.findByTestId('replay-modal')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Instructor title carries the student name AND the problem title.
    expect(
      screen.getByRole('heading', { name: /Replay · Alice — FizzBuzz/i })
    ).toBeInTheDocument();
    // One list entry per revision + a diff block.
    expect(screen.getByTestId('replay-revision-0')).toBeInTheDocument();
    expect(screen.getByTestId('replay-revision-1')).toBeInTheDocument();
    expect(screen.getByLabelText('revision diff')).toBeInTheDocument();
  });

  it('falls back to a name-only title when problemTitle is absent', async () => {
    render(
      <RevisionViewer
        session_id="session-1"
        studentId="student-1"
        studentName="Alice"
        onClose={jest.fn()}
      />
    );

    expect(
      await screen.findByRole('heading', { name: 'Replay · Alice' })
    ).toBeInTheDocument();
  });

  it('selecting a revision updates the diff and prev/next nav moves selection', async () => {
    /**
     * Contract: clicking a revision row and using prev/next changes the selected
     * revision (reflected in the diff). Catches: nav / selection wiring loss.
     */
    renderViewer();

    // Opens on the last revision (rev-2 → "+ print(2)" in the diff vs rev-1).
    const diff = await screen.findByLabelText('revision diff');
    await waitFor(() => expect(diff.textContent).toContain('print(2)'));

    // Select the first revision: diff is now r1 (no predecessor → all added).
    await userEvent.click(screen.getByTestId('replay-revision-0'));
    await waitFor(() => expect(diff.textContent).toContain('print(1)'));

    // Next advances back to the second revision.
    await userEvent.click(screen.getByTestId('replay-next'));
    await waitFor(() => expect(diff.textContent).toContain('print(2)'));

    // Prev returns to the first.
    await userEvent.click(screen.getByTestId('replay-prev'));
    await waitFor(() => expect(diff.textContent).toContain('print(1)'));
  });

  it('derives pass/fail pill + failure detail from execution_result', async () => {
    /**
     * Contract: the verdict pill and failure-detail block reflect the selected
     * revision's execution_result summary. Catches: status rendering drift.
     */
    renderViewer();

    // Opens on rev-2 (passing) → no failure detail.
    await screen.findByTestId('replay-modal');
    await waitFor(() =>
      expect(screen.queryByTestId('replay-failure-detail')).not.toBeInTheDocument()
    );

    // Select rev-1 (failing) → failure detail appears with the counts.
    await userEvent.click(screen.getByTestId('replay-revision-0'));
    const detail = await screen.findByTestId('replay-failure-detail');
    expect(detail.textContent).toContain('1/2 tests passed');
  });

  it('closes via the Escape key (a11y the inline version lacked)', async () => {
    /**
     * Contract: the Modal-based viewer dismisses on Escape via onClose. Catches:
     * missing dismiss/focus behavior from the old inline modal.
     */
    const onClose = renderViewer();
    await screen.findByTestId('replay-modal');

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes via a backdrop click', async () => {
    const onClose = renderViewer();
    const dialog = await screen.findByRole('dialog');

    // The role=dialog node is the backdrop; clicking it (target === currentTarget)
    // triggers onClose.
    await userEvent.click(dialog);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows an empty state (not a spinner) when there are no revisions', async () => {
    mockGetRevisions.mockResolvedValue([]);
    renderViewer();

    expect(await screen.findByTestId('replay-empty')).toBeInTheDocument();
    expect(screen.queryByText(/Loading revision history/i)).not.toBeInTheDocument();
  });

  it('fetches revisions filtered to the student (instructor variant)', async () => {
    renderViewer();
    await waitFor(() =>
      expect(mockGetRevisions).toHaveBeenCalledWith('session-1', 'student-1')
    );
  });
});

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GroupNavigationHeader from '../GroupNavigationHeader';
import { AnalysisGroup } from '../../hooks/useAnalysisGroups';

const makeGroup = (overrides: Partial<AnalysisGroup> = {}): AnalysisGroup => ({
  id: '0',
  label: 'Missing base case',
  studentIds: ['s1', 's2'],
  recommendedStudentId: 's1',
  ...overrides,
});

const allGroup: AnalysisGroup = {
  id: 'all',
  label: 'All Submissions',
  studentIds: [],
  recommendedStudentId: null,
};

const groups: AnalysisGroup[] = [
  allGroup,
  makeGroup({ id: '0', label: 'Missing base case', studentIds: ['s1', 's2'] }),
  makeGroup({ id: '1', label: 'Off-by-one error', studentIds: ['s3'] }),
];

describe('GroupNavigationHeader', () => {
  it('renders group label and position indicator', () => {
    render(
      <GroupNavigationHeader
        groups={groups}
        activeGroupIndex={1}
        onNavigate={jest.fn()}
        onDismiss={jest.fn()}
      />
    );

    expect(screen.getByText('Missing base case')).toBeInTheDocument();
    expect(screen.getByText(/2 of 3/)).toBeInTheDocument();
  });

  it('renders student count for non-all groups', () => {
    render(
      <GroupNavigationHeader
        groups={groups}
        activeGroupIndex={1}
        onNavigate={jest.fn()}
        onDismiss={jest.fn()}
      />
    );

    expect(screen.getByText(/2 students/)).toBeInTheDocument();
  });

  it('does not render student count for "All Submissions" group', () => {
    render(
      <GroupNavigationHeader
        groups={groups}
        activeGroupIndex={0}
        onNavigate={jest.fn()}
        onDismiss={jest.fn()}
      />
    );

    expect(screen.queryByText(/students/)).not.toBeInTheDocument();
  });

  it('disables prev button on first group', () => {
    render(
      <GroupNavigationHeader
        groups={groups}
        activeGroupIndex={0}
        onNavigate={jest.fn()}
        onDismiss={jest.fn()}
      />
    );

    const prevButton = screen.getByRole('button', { name: /previous/i });
    expect(prevButton).toBeDisabled();
  });

  it('disables next button on last group', () => {
    render(
      <GroupNavigationHeader
        groups={groups}
        activeGroupIndex={2}
        onNavigate={jest.fn()}
        onDismiss={jest.fn()}
      />
    );

    const nextButton = screen.getByRole('button', { name: /next/i });
    expect(nextButton).toBeDisabled();
  });

  it('calls onNavigate with correct direction when clicking arrows', async () => {
    const user = userEvent.setup();
    const onNavigate = jest.fn();

    render(
      <GroupNavigationHeader
        groups={groups}
        activeGroupIndex={1}
        onNavigate={onNavigate}
        onDismiss={jest.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /previous/i }));
    expect(onNavigate).toHaveBeenCalledWith('prev');

    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(onNavigate).toHaveBeenCalledWith('next');
  });

  it('hides dismiss button for "All Submissions" group', () => {
    render(
      <GroupNavigationHeader
        groups={groups}
        activeGroupIndex={0}
        onNavigate={jest.fn()}
        onDismiss={jest.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument();
  });

  it('calls onDismiss with group id when clicking dismiss', async () => {
    const user = userEvent.setup();
    const onDismiss = jest.fn();

    render(
      <GroupNavigationHeader
        groups={groups}
        activeGroupIndex={1}
        onNavigate={jest.fn()}
        onDismiss={onDismiss}
      />
    );

    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledWith('0');
  });

  it('shows completion summary only for "all" group', () => {
    const completionEstimate = { finished: 10, inProgress: 3, notStarted: 2 };

    const { rerender } = render(
      <GroupNavigationHeader
        groups={groups}
        activeGroupIndex={0}
        onNavigate={jest.fn()}
        onDismiss={jest.fn()}
        completionEstimate={completionEstimate}
      />
    );

    expect(screen.getByTestId('completion-summary')).toBeInTheDocument();
    expect(screen.getByText(/10 finished/)).toBeInTheDocument();
    expect(screen.getByText(/3 in progress/)).toBeInTheDocument();
    expect(screen.getByText(/2 not started/)).toBeInTheDocument();

    // Not shown for non-all group
    rerender(
      <GroupNavigationHeader
        groups={groups}
        activeGroupIndex={1}
        onNavigate={jest.fn()}
        onDismiss={jest.fn()}
        completionEstimate={completionEstimate}
      />
    );

    expect(screen.queryByTestId('completion-summary')).not.toBeInTheDocument();
  });

  it('shows overallNote only for "all" group', () => {
    const { rerender } = render(
      <GroupNavigationHeader
        groups={groups}
        activeGroupIndex={0}
        onNavigate={jest.fn()}
        onDismiss={jest.fn()}
        overallNote="Most students did well"
      />
    );

    expect(screen.getByTestId('overall-note')).toBeInTheDocument();
    expect(screen.getByText('Most students did well')).toBeInTheDocument();

    // Not shown for non-all group
    rerender(
      <GroupNavigationHeader
        groups={groups}
        activeGroupIndex={1}
        onNavigate={jest.fn()}
        onDismiss={jest.fn()}
        overallNote="Most students did well"
      />
    );

    expect(screen.queryByTestId('overall-note')).not.toBeInTheDocument();
  });
});

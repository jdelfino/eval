/**
 * Tests for JoinSectionForm
 *
 * Verifies:
 * 1. Auto-formats join-code input using formatJoinCodeInput
 * 2. Live section preview via getStudentRegistrationInfo (debounced 400ms, format-valid only)
 * 3. Preview silently suppressed on lookup failure
 * 4. Stale preview responses are ignored (race condition guard)
 * 5. Submit flow: calls onSubmit with code, shows success Banner, error-to-message mapping, retry
 * 6. Cancel links to /sections; submit disabled while empty/submitting
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JoinSectionForm from '../JoinSectionForm';

// Mock getStudentRegistrationInfo from the registration API client
const mockGetStudentRegistrationInfo = jest.fn();
jest.mock('@/lib/api/registration', () => ({
  getStudentRegistrationInfo: (...args: unknown[]) => mockGetStudentRegistrationInfo(...args),
}));

// Mock next/link to render a plain anchor
jest.mock('next/link', () => {
  const MockLink = ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  );
  MockLink.displayName = 'MockLink';
  return MockLink;
});

function buildRegistrationInfo(overrides?: Partial<{ className: string; sectionName: string; semester: string | null }>) {
  const { className = 'CS 101', sectionName = 'Section A', semester = 'Fall 2025' } = overrides ?? {};
  return {
    class: {
      id: 'class-1',
      namespace_id: 'ns-1',
      name: className,
      description: null,
      created_by: 'user-1',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
    section: {
      id: 'section-1',
      namespace_id: 'ns-1',
      class_id: 'class-1',
      name: sectionName,
      semester,
      join_code: 'ABC123',
      active: true,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
  };
}

describe('JoinSectionForm', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockGetStudentRegistrationInfo.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Test case 2: auto-formats input
  it('auto-formats join-code input: type abc123 → field value ABC-123', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<JoinSectionForm onSubmit={onSubmit} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'abc123');

    expect(input).toHaveValue('ABC-123');
  });

  // Test case 3: live preview appears for valid format code
  it('shows section preview after 400ms for a format-valid code (6 chars)', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const info = buildRegistrationInfo();
    mockGetStudentRegistrationInfo.mockResolvedValue(info);

    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<JoinSectionForm onSubmit={onSubmit} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'ABC123');

    // API should NOT be called yet (debounced)
    expect(mockGetStudentRegistrationInfo).not.toHaveBeenCalled();

    // Advance debounce timer
    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(mockGetStudentRegistrationInfo).toHaveBeenCalledWith('ABC-123');
    });

    await waitFor(() => {
      expect(screen.getByText('CS 101')).toBeInTheDocument();
      expect(screen.getByText(/Section A/)).toBeInTheDocument();
    });
  });

  // Test case 4: no preview call for partial codes
  it('does not call API for partial codes (fewer than 6 chars)', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<JoinSectionForm onSubmit={onSubmit} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'ABC-1');

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(mockGetStudentRegistrationInfo).not.toHaveBeenCalled();
  });

  // Test case 5: preview lookup failure is silent (no error Banner shown)
  it('silently suppresses preview errors — no danger Banner on lookup failure', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockGetStudentRegistrationInfo.mockRejectedValue(new Error('Not found'));

    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<JoinSectionForm onSubmit={onSubmit} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'ABC123');

    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(mockGetStudentRegistrationInfo).toHaveBeenCalled();
    });

    // No error Banner should appear
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // Test case 6: stale preview response ignored
  it('ignores stale preview responses when the code has changed', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    let resolveFirst!: (v: unknown) => void;
    const firstCall = new Promise((res) => { resolveFirst = res; });

    const secondInfo = buildRegistrationInfo({ className: 'CS 202', sectionName: 'Section B' });

    mockGetStudentRegistrationInfo
      .mockImplementationOnce(() => firstCall)
      .mockResolvedValueOnce(secondInfo);

    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<JoinSectionForm onSubmit={onSubmit} />);

    const input = screen.getByRole('textbox');

    // Type first code
    await user.type(input, 'ABC123');
    await act(async () => { jest.advanceTimersByTime(400); });

    // Change code before first resolves
    await user.clear(input);
    await user.type(input, 'XYZ456');
    await act(async () => { jest.advanceTimersByTime(400); });

    // Resolve first (stale) call with different data
    const staleInfo = buildRegistrationInfo({ className: 'CS 101', sectionName: 'Section A' });
    await act(async () => { resolveFirst(staleInfo); });

    // Allow second call to resolve
    await waitFor(() => {
      expect(mockGetStudentRegistrationInfo).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      // Only second (current) info should be shown
      expect(screen.queryByText('CS 101')).not.toBeInTheDocument();
      expect(screen.getByText('CS 202')).toBeInTheDocument();
    });
  });

  // Test case 7: submit calls onSubmit and shows success Banner
  it('calls onSubmit with the entered code and shows success Banner on success', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<JoinSectionForm onSubmit={onSubmit} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'ABC123');

    const submitBtn = screen.getByRole('button', { name: /join section/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('ABC-123');
    });

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  // Test case 7: error mapping - invalid join code
  it('shows "Invalid join code" danger Banner on not-found/invalid error', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onSubmit = jest.fn().mockRejectedValue(new Error('not found'));
    render(<JoinSectionForm onSubmit={onSubmit} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'ABC123');

    const submitBtn = screen.getByRole('button', { name: /join section/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByText(/invalid join code/i)).toBeInTheDocument();
  });

  // Test case 7: error mapping - already a member
  it('shows "already a member" message in danger Banner when already enrolled', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onSubmit = jest.fn().mockRejectedValue(new Error('already a member'));
    render(<JoinSectionForm onSubmit={onSubmit} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'ABC123');

    await user.click(screen.getByRole('button', { name: /join section/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByText(/already a member/i)).toBeInTheDocument();
  });

  // Test case 7: retry action re-submits
  it('retry action in error Banner re-submits with the last submitted code', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onSubmit = jest.fn()
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValueOnce(undefined);

    render(<JoinSectionForm onSubmit={onSubmit} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'ABC123');
    await user.click(screen.getByRole('button', { name: /join section/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole('button', { name: /try again/i });
    await user.click(retryBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(2);
    });
  });

  // Test case 8: Cancel links to /sections
  it('Cancel link points to /sections', () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<JoinSectionForm onSubmit={onSubmit} />);

    const cancelLink = screen.getByRole('link', { name: /cancel/i });
    expect(cancelLink).toHaveAttribute('href', '/sections');
  });

  // Test case 8: submit disabled while empty
  it('submit button disabled when join code is empty', () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<JoinSectionForm onSubmit={onSubmit} />);

    const submitBtn = screen.getByRole('button', { name: /join section/i });
    expect(submitBtn).toBeDisabled();
  });

  // Preview shows semester when present
  it('preview shows class name and section with semester', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const info = buildRegistrationInfo({ className: 'Bio 101', sectionName: 'Period 3', semester: 'Spring 2026' });
    mockGetStudentRegistrationInfo.mockResolvedValue(info);

    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<JoinSectionForm onSubmit={onSubmit} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'ABC123');

    await act(async () => { jest.advanceTimersByTime(400); });

    await waitFor(() => {
      expect(screen.getByText('Bio 101')).toBeInTheDocument();
      expect(screen.getByText(/Period 3.*Spring 2026/)).toBeInTheDocument();
    });
  });

  // Preview cleared when code becomes invalid
  it('clears preview immediately when code becomes format-invalid', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const info = buildRegistrationInfo();
    mockGetStudentRegistrationInfo.mockResolvedValue(info);

    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<JoinSectionForm onSubmit={onSubmit} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'ABC123');
    await act(async () => { jest.advanceTimersByTime(400); });
    await waitFor(() => { expect(screen.getByText('CS 101')).toBeInTheDocument(); });

    // Delete a character to make it format-invalid
    await user.type(input, '{backspace}');

    await waitFor(() => {
      expect(screen.queryByText('CS 101')).not.toBeInTheDocument();
    });
  });
});

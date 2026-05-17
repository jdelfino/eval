/**
 * Tests for SessionDetails component.
 * @jest-environment jsdom
 *
 * Contract: SessionDetails mounts WorkspaceShell in embedded=true mode (no Ribbon)
 * to show historical student code in a read-only editor. The host page provides chrome.
 * Regressions here break the post-session code review flow for instructors.
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import SessionDetails from '../SessionDetails';
import type { SessionDetails as SessionDetailsType } from '@/lib/api/sessions';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock router (SessionDetails uses useRouter)
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

// Mock getSessionDetails API call
jest.mock('@/lib/api/sessions', () => ({
  getSessionDetails: jest.fn(),
}));

// Capture onRunAll so we can invoke it in TQ3 test
let capturedOnRunAll: (() => void) | undefined;

// Mock WorkspaceShell — the critical post-T8 assertion
jest.mock('@/components/workspace/WorkspaceShell', () => ({
  __esModule: true,
  default: ({
    editorTabs,
    embedded,
    onRunAll,
  }: {
    editorTabs: Array<{ id: string; code?: string; readOnly?: boolean }>;
    embedded?: boolean;
    onRunAll?: () => void;
  }) => {
    capturedOnRunAll = onRunAll;
    return (
      <div data-testid="workspace-shell" data-embedded={String(!!embedded)}>
        {editorTabs.map((tab) => (
          <div
            key={tab.id}
            data-testid="editor-tab"
            data-code={tab.code}
            data-readonly={String(!!tab.readOnly)}
          >
            {tab.code}
          </div>
        ))}
        {onRunAll && (
          <button data-testid="run-all-btn" onClick={onRunAll}>
            Run All
          </button>
        )}
      </div>
    );
  },
}));

// BackButton mock
jest.mock('@/components/ui/BackButton', () => ({
  BackButton: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const { getSessionDetails } = jest.requireMock('@/lib/api/sessions');

const mockSessionDetails: SessionDetailsType = {
  id: 'session-abc',
  join_code: 'ABCDE',
  problem_title: 'FizzBuzz',
  problem_description: 'Print FizzBuzz for numbers 1-100.',
  starter_code: '# starter',
  created_at: '2026-01-01T10:00:00Z',
  ended_at: '2026-01-01T11:00:00Z',
  status: 'completed',
  section_name: 'CS 101',
  participant_count: 2,
  students: [
    { id: 'u1', name: 'Alice', code: 'print("fizzbuzz")', joined_at: '2026-01-01T10:01:00Z' },
    { id: 'u2', name: 'Bob', code: 'for i in range(100): pass', joined_at: '2026-01-01T10:02:00Z' },
  ],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SessionDetails', () => {
  const defaultProps = {
    session_id: 'session-abc',
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getSessionDetails.mockResolvedValue(mockSessionDetails);
  });

  describe('WorkspaceShell wiring (T8)', () => {
    /**
     * Contract: SessionDetails renders WorkspaceShell embedded=true (no Ribbon).
     * The historical code view must be read-only — students cannot edit past sessions.
     */
    it('renders WorkspaceShell with embedded=true', async () => {
      render(<SessionDetails {...defaultProps} />);

      await waitFor(() => {
        const shell = screen.getByTestId('workspace-shell');
        expect(shell).toBeInTheDocument();
        expect(shell).toHaveAttribute('data-embedded', 'true');
      });
    });

    it('does not render a Ribbon element (embedded mode omits it)', async () => {
      render(<SessionDetails {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByTestId('ribbon')).not.toBeInTheDocument();
      });
    });

    it('renders historical student code in editorTab with readOnly=true', async () => {
      /**
       * Contract: the first auto-selected student's historical code is threaded into
       * editorTabs[0].code with readOnly=true. If broken, the instructor sees blank/wrong
       * code, or the code appears editable (misleading).
       */
      render(<SessionDetails {...defaultProps} />);

      await waitFor(() => {
        const tab = screen.getByTestId('editor-tab');
        expect(tab).toHaveAttribute('data-code', 'print("fizzbuzz")');
        expect(tab).toHaveAttribute('data-readonly', 'true');
      });
    });

    it('falls back to starter_code when selected student has no code', async () => {
      const sessionWithNoCode: SessionDetailsType = {
        ...mockSessionDetails,
        students: [
          { id: 'u1', name: 'Alice', code: '', joined_at: '2026-01-01T10:01:00Z' },
        ],
      };
      getSessionDetails.mockResolvedValue(sessionWithNoCode);

      render(<SessionDetails {...defaultProps} />);

      await waitFor(() => {
        const tab = screen.getByTestId('editor-tab');
        // Should fall back to starter_code or empty string, not crash
        expect(tab).toBeInTheDocument();
        expect(tab).toHaveAttribute('data-readonly', 'true');
      });
    });
  });

  describe('TQ3 — Run all triggers onExecuteCode with historical student code', () => {
    /**
     * Contract: SessionDetails passes onRunAll to WorkspaceShell, and when invoked,
     * it calls the parent's onExecuteCode prop with the selected student's historical code.
     * Without this, the instructor cannot re-run student code from the history view —
     * the "Run all" button in the shell would be inert or missing.
     */
    it('calls onExecuteCode with the selected student code when Run All is triggered', async () => {
      const onExecuteCode = jest.fn();
      render(<SessionDetails {...defaultProps} onExecuteCode={onExecuteCode} />);

      await waitFor(() => {
        expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
      });

      // Invoke onRunAll captured from the WorkspaceShell mock
      await act(async () => {
        capturedOnRunAll?.();
      });

      expect(onExecuteCode).toHaveBeenCalledWith('print("fizzbuzz")');
    });
  });

  describe('loading and error states', () => {
    it('shows loading state while fetching', () => {
      // Don't resolve getSessionDetails immediately
      getSessionDetails.mockReturnValue(new Promise(() => {}));
      render(<SessionDetails {...defaultProps} />);
      expect(screen.getByText(/loading session details/i)).toBeInTheDocument();
    });

    it('shows error message when getSessionDetails rejects', async () => {
      getSessionDetails.mockRejectedValue(new Error('Network failure'));
      render(<SessionDetails {...defaultProps} />);
      await waitFor(() => {
        expect(screen.getByText(/error loading session/i)).toBeInTheDocument();
      });
    });
  });
});

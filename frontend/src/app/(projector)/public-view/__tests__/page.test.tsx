/**
 * Integration tests for the public instructor view component.
 *
 * These tests drive state through the useRealtimePublicView hook mock (not fetch).
 * The page no longer polls via fetch — it uses the realtime hook exclusively.
 *
 * Covers:
 * - Loading / error / no-session early returns
 * - Featured code display (readOnly mode)
 * - Scratch-pad display (editable mode)
 * - Header slot (join code + connection status)
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import type { WorkspaceShellProps } from '@/components/workspace/WorkspaceShell';

// ── Navigation ────────────────────────────────────────────────────────────────
jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(() => ({
    get: jest.fn((key: string) => (key === 'session_id' ? 'test-session-id' : null))
  })),
}));

// ── Auth ──────────────────────────────────────────────────────────────────────
jest.mock('@/components/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── executeCode ───────────────────────────────────────────────────────────────
jest.mock('@/lib/api/execute', () => ({
  executeCode: jest.fn().mockResolvedValue({
    summary: { passed: 0, failed: 0, total: 0 },
    results: [],
  }),
  ioTestCasesToCaseDefs: (cases: any[]) => cases,
}));

// ── useApiDebugger ────────────────────────────────────────────────────────────
jest.mock('@/hooks/useApiDebugger', () => ({
  useApiDebugger: () => ({
    trace: null,
    currentStep: 0,
    isLoading: false,
    error: null,
    requestTrace: jest.fn(),
    setTrace: jest.fn(),
    setError: jest.fn(),
    stepForward: jest.fn(),
    stepBackward: jest.fn(),
    jumpToStep: jest.fn(),
    jumpToFirst: jest.fn(),
    jumpToLast: jest.fn(),
    reset: jest.fn(),
    getCurrentStep: () => null,
    getCurrentLocals: jest.fn(),
    getCurrentGlobals: jest.fn(),
    getCurrentCallStack: jest.fn(),
    getPreviousStep: () => null,
    total_steps: 0,
    hasTrace: false,
    canStepForward: false,
    canStepBackward: false,
  }),
}));

// ── WorkspaceShell mock ───────────────────────────────────────────────────────
let lastShellProps: WorkspaceShellProps | null = null;

jest.mock('@/components/workspace/WorkspaceShell', () => {
  return {
    __esModule: true,
    default: function MockWorkspaceShell(props: WorkspaceShellProps) {
      lastShellProps = props;
      const tab = props.editorTabs[0];
      return (
        <div data-testid="workspace-shell">
          <div data-testid="code-title">{tab.label}</div>
          <div data-testid="code-content">{'code' in tab ? tab.code : ''}</div>
        </div>
      );
    },
  };
});

// ── useRealtimePublicView ─────────────────────────────────────────────────────
const mockUseRealtimePublicView = jest.fn();
jest.mock('@/hooks/useRealtimePublicView', () => ({
  useRealtimePublicView: (...args: any[]) => mockUseRealtimePublicView(...args),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeHookState(overrides: Record<string, any> = {}) {
  return {
    state: null,
    loading: false,
    error: null,
    connectionStatus: 'connected',
    connectionError: null,
    activeSessionId: null,
    ...overrides,
  };
}

function makeLoadedState(stateOverrides: Record<string, any> = {}) {
  return makeHookState({
    activeSessionId: 'test-session-id',
    state: {
      join_code: 'ABC-123',
      problem: {
        title: 'Test Problem',
        description: 'A test problem',
        starter_code: 'def solve():\n    pass',
        language: 'python',
        test_cases: [],
      },
      featured_student_id: null,
      featured_code: null,
      featured_test_cases: null,
      status: 'active',
      ...stateOverrides,
    },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PublicInstructorView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    lastShellProps = null;
    mockUseRealtimePublicView.mockReturnValue(makeHookState({ loading: true }));
  });

  afterEach(() => {
    localStorage.clear();
  });

  test('shows loading state initially', () => {
    mockUseRealtimePublicView.mockReturnValue(makeHookState({ loading: true }));
    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  test('shows error state when hook returns an error', async () => {
    mockUseRealtimePublicView.mockReturnValue(
      makeHookState({ error: 'Session not found' })
    );
    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);
    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Session not found')).toBeInTheDocument();
    });
  });

  test('displays featured code in WorkspaceShell when featured_code is set', async () => {
    mockUseRealtimePublicView.mockReturnValue(
      makeLoadedState({
        featured_student_id: 'student-1',
        featured_code: 'print("Hello, World!")',
      })
    );

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    await waitFor(() => {
      expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
    });

    expect(screen.getByTestId('code-content')).toHaveTextContent('print("Hello, World!")');
    expect(screen.getByTestId('code-title')).toHaveTextContent('Featured Code');
  });

  test('shows featured code editor when featured_code set but featured_student_id is null (Show Solution)', async () => {
    // Instructor "Show Solution" sets featured_code without a student ID.
    mockUseRealtimePublicView.mockReturnValue(
      makeLoadedState({
        featured_student_id: null,
        featured_code: 'def solution():\n    return 42',
      })
    );

    const PublicInstructorView = require('../page').default;
    await act(async () => {
      render(<PublicInstructorView />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
    });

    expect(screen.getByTestId('code-content')).toHaveTextContent('def solution():');
    expect(screen.getByTestId('code-title')).toHaveTextContent('Featured Code');
  });

  test('shows starter code in scratch-pad when no featured submission', async () => {
    mockUseRealtimePublicView.mockReturnValue(
      makeLoadedState({
        featured_student_id: null,
        featured_code: null,
      })
    );

    const PublicInstructorView = require('../page').default;
    await act(async () => {
      render(<PublicInstructorView />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('code-content')).toHaveTextContent('def solve():');
    });
    expect(screen.getByTestId('code-title')).toHaveTextContent('Starter Code');
  });

  test('shows Scratch Pad when no featured submission and no starter code', async () => {
    mockUseRealtimePublicView.mockReturnValue(
      makeLoadedState({
        featured_student_id: null,
        featured_code: null,
        problem: {
          title: 'Test Problem',
          description: 'desc',
          starter_code: null,
          language: 'python',
          test_cases: [],
        },
      })
    );

    const PublicInstructorView = require('../page').default;
    await act(async () => {
      render(<PublicInstructorView />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
    });
    expect(screen.getByTestId('code-title')).toHaveTextContent('Scratch Pad');
  });

  test('featured-student mode: editorTabs[0].readOnly = true', async () => {
    mockUseRealtimePublicView.mockReturnValue(
      makeLoadedState({
        featured_student_id: 'student-1',
        featured_code: 'x = 1',
      })
    );

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    await waitFor(() => {
      expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
    });

    expect(lastShellProps).not.toBeNull();
    const tab = lastShellProps!.editorTabs[0];
    if (tab.kind !== 'code') throw new Error('Expected code tab');
    expect(tab.readOnly).toBe(true);
  });

  test('scratch-pad mode: editorTabs[0].readOnly is falsy', async () => {
    mockUseRealtimePublicView.mockReturnValue(makeLoadedState());

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    await waitFor(() => {
      expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
    });

    expect(lastShellProps).not.toBeNull();
    const tab = lastShellProps!.editorTabs[0];
    if (tab.kind !== 'code') throw new Error('Expected code tab');
    expect(tab.readOnly).toBeFalsy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('PublicInstructorView without session_id', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    const { useSearchParams } = require('next/navigation');
    (useSearchParams as jest.Mock).mockReturnValue({
      get: jest.fn(() => null)
    });
  });

  test('shows no session message when session_id is missing', async () => {
    // Hook is not called when there's no identifier — early return
    mockUseRealtimePublicView.mockReturnValue(
      makeHookState({ loading: true })
    );

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    await waitFor(() => {
      expect(screen.getByText('No Session')).toBeInTheDocument();
    });
  });
});

/**
 * Tests for public-view font size controls.
 *
 * Separated from page.test.tsx because this file mocks useRealtimePublicView
 * directly (module-level mock), while the main test file drives state through
 * the hook mock too.
 *
 * After T7, font size is forwarded as a prop to WorkspaceShell (not CodeEditor).
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import type { WorkspaceShellProps } from '@/components/workspace/WorkspaceShell';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(() => ({
    get: jest.fn((key: string) => (key === 'session_id' ? 'test-session-id' : null))
  })),
}));

// Mock ProtectedRoute to bypass auth
jest.mock('@/components/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock executeCode
jest.mock('@/lib/api/execute', () => ({
  executeCode: jest.fn().mockResolvedValue({ summary: { passed: 0, failed: 0, total: 0 }, results: [] }),
  ioTestCasesToCaseDefs: (cases: any[]) => cases,
}));

// Mock useApiDebugger hook
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

// Track props passed to WorkspaceShell
let lastShellProps: WorkspaceShellProps | null = null;

// Mock WorkspaceShell component
jest.mock('@/components/workspace/WorkspaceShell', () => {
  return {
    __esModule: true,
    default: function MockWorkspaceShell(props: WorkspaceShellProps) {
      lastShellProps = props;
      return (
        <div data-testid="workspace-shell">
          <div data-testid="code-title">{props.editorTabs[0]?.label}</div>
          <div data-testid="code-content">{'code' in props.editorTabs[0] ? props.editorTabs[0].code : ''}</div>
        </div>
      );
    },
  };
});

// Mock useRealtimePublicView to return a loaded state
const mockUseRealtimePublicView = jest.fn();
jest.mock('@/hooks/useRealtimePublicView', () => ({
  useRealtimePublicView: (...args: any[]) => mockUseRealtimePublicView(...args),
}));

const loadedState = {
  state: {
    join_code: 'ABC-123',
    problem: {
      title: 'Test Problem',
      description: 'A test problem',
      starter_code: null,
      language: 'python',
      test_cases: [],
    },
    featured_student_id: null,
    featured_code: null,
    featured_test_cases: null,
    status: 'active',
  },
  loading: false,
  error: null,
  connectionStatus: 'connected',
  connectionError: null,
  activeSessionId: 'test-session-id',
};

describe('PublicInstructorView font size controls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    lastShellProps = null;
    mockUseRealtimePublicView.mockReturnValue(loadedState);
  });

  afterEach(() => {
    localStorage.clear();
  });

  test('renders font size increase and decrease buttons', () => {
    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    expect(screen.getByLabelText('Increase font size')).toBeInTheDocument();
    expect(screen.getByLabelText('Decrease font size')).toBeInTheDocument();
  });

  test('passes default fontSize of 24 to WorkspaceShell', () => {
    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    expect(lastShellProps).toBeTruthy();
    expect(lastShellProps!.fontSize).toBe(24);
  });

  test('increases fontSize when + button is clicked', async () => {
    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    expect(lastShellProps!.fontSize).toBe(24);

    await act(async () => {
      screen.getByLabelText('Increase font size').click();
    });

    expect(lastShellProps!.fontSize).toBe(26);
  });

  test('decreases fontSize when - button is clicked', async () => {
    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    expect(lastShellProps!.fontSize).toBe(24);

    await act(async () => {
      screen.getByLabelText('Decrease font size').click();
    });

    expect(lastShellProps!.fontSize).toBe(22);
  });

  test('persists fontSize to localStorage when changed', async () => {
    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    await act(async () => {
      screen.getByLabelText('Increase font size').click();
    });

    const stored = localStorage.getItem('publicView_fontSize');
    expect(stored).not.toBeNull();
    expect(Number(stored)).toBe(26);
  });

  test('loads fontSize from localStorage on mount', () => {
    localStorage.setItem('publicView_fontSize', '32');

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    expect(lastShellProps).toBeTruthy();
    expect(lastShellProps!.fontSize).toBe(32);
  });

  test('does not increase fontSize beyond maximum', async () => {
    localStorage.setItem('publicView_fontSize', '48');

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    expect(lastShellProps!.fontSize).toBe(48);

    await act(async () => {
      screen.getByLabelText('Increase font size').click();
    });

    expect(lastShellProps!.fontSize).toBe(48);
  });

  test('does not decrease fontSize below minimum', async () => {
    localStorage.setItem('publicView_fontSize', '12');

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    expect(lastShellProps!.fontSize).toBe(12);

    await act(async () => {
      screen.getByLabelText('Decrease font size').click();
    });

    expect(lastShellProps!.fontSize).toBe(12);
  });
});

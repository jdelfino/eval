/**
 * @jest-environment jsdom
 *
 * Tests for section-mode public view page (/public-view?section_id=X).
 *
 * When section_id is provided instead of session_id, the page:
 * - Shows a "Waiting for session..." state when no active session
 * - Shows the session content when an active session is tracked
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import type { WorkspaceShellProps } from '@/components/workspace/WorkspaceShell';

// ---- Navigation mock (section_id param) ----
const mockSearchParamsGet = jest.fn();
jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(() => ({
    get: mockSearchParamsGet,
  })),
}));

// ---- Auth ----
jest.mock('@/components/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ---- Header slot ----
const mockSetHeaderSlot = jest.fn();
jest.mock('@/contexts/HeaderSlotContext', () => ({
  useHeaderSlot: () => ({ setHeaderSlot: mockSetHeaderSlot }),
}));

// ---- ConnectionStatus ----
jest.mock('@/components/ConnectionStatus', () => ({
  ConnectionStatus: () => null,
}));

// ---- executeCode ----
jest.mock('@/lib/api/execute', () => ({
  executeCode: jest.fn().mockResolvedValue({ summary: { passed: 0, failed: 0, total: 0 }, results: [] }),
  ioTestCasesToCaseDefs: (cases: any[]) => cases,
}));

// ---- Debugger ----
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

// ---- WorkspaceShell ----
jest.mock('@/components/workspace/WorkspaceShell', () => {
  return {
    __esModule: true,
    default: function MockWorkspaceShell(props: WorkspaceShellProps) {
      const tab = props.editorTabs[0];
      return (
        <div data-testid="workspace-shell">
          <div data-testid="code-title">{tab?.label}</div>
          <div data-testid="code-content">{'code' in tab ? tab.code : ''}</div>
        </div>
      );
    },
  };
});

// ---- Mock the useRealtimePublicView hook ----
let mockHookState: {
  state: any;
  loading: boolean;
  error: string | null;
  connectionStatus: string;
  connectionError: string | null;
  activeSessionId: string | null;
} = {
  state: null,
  loading: false,
  error: null,
  connectionStatus: 'connected',
  connectionError: null,
  activeSessionId: null,
};

const mockUseRealtimePublicView = jest.fn((_args: unknown) => mockHookState);
jest.mock('@/hooks/useRealtimePublicView', () => ({
  useRealtimePublicView: (args: unknown) => mockUseRealtimePublicView(args),
}));

describe('PublicInstructorView — section mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: section_id provided, no session_id
    mockSearchParamsGet.mockImplementation((key: string) => {
      if (key === 'section_id') return 'section-abc';
      return null;
    });
    mockHookState = {
      state: null,
      loading: false,
      error: null,
      connectionStatus: 'connected',
      connectionError: null,
      activeSessionId: null,
    };
    mockUseRealtimePublicView.mockImplementation(() => mockHookState);
  });

  it('passes section_id to useRealtimePublicView when section_id is in URL', async () => {
    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    await waitFor(() => {
      expect(mockUseRealtimePublicView).toHaveBeenCalledWith(
        expect.objectContaining({ section_id: 'section-abc' })
      );
    });
  });

  it('shows waiting state when section_id is provided but no active session', async () => {
    mockHookState = {
      state: null,
      loading: false,
      error: null,
      connectionStatus: 'connected',
      connectionError: null,
      activeSessionId: null,
    };
    mockUseRealtimePublicView.mockReturnValue(mockHookState);

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    await waitFor(() => {
      expect(screen.getByText(/Waiting for session/i)).toBeInTheDocument();
    });
  });

  it('shows session content when active session is tracked', async () => {
    mockHookState = {
      state: {
        problem: { title: 'Test Problem', description: 'desc', starter_code: 'x=1', language: 'python', test_cases: [] },
        featured_student_id: null,
        featured_code: null,
        featured_test_cases: null,
        join_code: 'TST-001',
        status: 'active',
      },
      loading: false,
      error: null,
      connectionStatus: 'connected',
      connectionError: null,
      activeSessionId: 'session-xyz',
    };
    mockUseRealtimePublicView.mockReturnValue(mockHookState);

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    await waitFor(() => {
      expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
    });
  });

  it('shows loading state while hook is loading', async () => {
    mockHookState = {
      state: null,
      loading: true,
      error: null,
      connectionStatus: 'connecting',
      connectionError: null,
      activeSessionId: null,
    };
    mockUseRealtimePublicView.mockReturnValue(mockHookState);

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows "No Session" when neither session_id nor section_id is provided', async () => {
    mockSearchParamsGet.mockImplementation(() => null);

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    await waitFor(() => {
      expect(screen.getByText('No Session')).toBeInTheDocument();
    });
  });
});

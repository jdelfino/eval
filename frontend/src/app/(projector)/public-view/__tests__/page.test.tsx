/**
 * Unit tests for the public instructor view component
 * Tests behavior of the public display page including:
 * - Loading state from API
 * - Polling-based updates
 * - State management
 * - Header slot integration (join code + connection status)
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';

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

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock useHeaderSlot to capture setHeaderSlot calls
const mockSetHeaderSlot = jest.fn();
jest.mock('@/contexts/HeaderSlotContext', () => ({
  useHeaderSlot: () => ({ setHeaderSlot: mockSetHeaderSlot }),
}));

// Mock useApiDebugger hook
const mockDebuggerHook = {
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
  getCurrentStep: jest.fn(),
  getCurrentLocals: jest.fn(),
  getCurrentGlobals: jest.fn(),
  getCurrentCallStack: jest.fn(),
  getPreviousStep: jest.fn(),
  total_steps: 0,
  hasTrace: false,
  canStepForward: false,
  canStepBackward: false,
};
jest.mock('@/hooks/useApiDebugger', () => ({
  useApiDebugger: () => mockDebuggerHook,
}));

// Track props passed to CodeEditor
let lastCodeEditorProps: any = null;

// Mock CodeEditor component
jest.mock('@/app/(fullscreen)/student/components/CodeEditor', () => {
  return function MockCodeEditor(props: any) {
    lastCodeEditorProps = props;
    return (
      <div data-testid="code-editor">
        <div data-testid="code-title">{props.title}</div>
        <div data-testid="code-content">{props.code}</div>
        {props.debugger && <div data-testid="debugger-present">Debugger</div>}
      </div>
    );
  };
});

describe('PublicInstructorView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  test('shows loading state initially', async () => {
    // Set up fetch to never resolve (to test loading state)
    mockFetch.mockImplementation(() => new Promise(() => {}));

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  test('fetches and displays session state from API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        session_id: 'test-session-id',
        join_code: 'ABC-123',
        problem: {
          title: 'Test Problem',
          description: 'A test problem description',
        },
        featured_student_id: 'student-1',
        featured_code: 'print("Hello, World!")',
        hasFeaturedSubmission: true,
      }),
    });

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    // Wait for fetch to complete
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/sessions/test-session-id/public-state');
    });

    // Verify featured code is shown
    await waitFor(() => {
      expect(screen.getByTestId('code-content')).toHaveTextContent('print("Hello, World!")');
    });
  });

  test('passes debugger prop to CodeEditor when featured submission exists', async () => {
    lastCodeEditorProps = null;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        session_id: 'test-session-id',
        join_code: 'ABC-123',
        problem: {
          title: 'Test Problem',
          description: 'A test problem description',
        },
        featured_student_id: 'student-1',
        featured_code: 'print("test")',
        hasFeaturedSubmission: true,
      }),
    });

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    // Wait for code editor to render
    await waitFor(() => {
      expect(screen.getByTestId('code-editor')).toBeInTheDocument();
    });

    // Verify debugger prop is passed
    expect(lastCodeEditorProps).toBeTruthy();
    expect(lastCodeEditorProps.debugger).toBeTruthy();
    expect(lastCodeEditorProps.debugger.requestTrace).toBeDefined();

    // Verify the visual indicator is present
    expect(screen.getByTestId('debugger-present')).toBeInTheDocument();
  });

  test('shows featured code editor when featured_code is set but featured_student_id is null (Show Solution)', async () => {
    // When instructor clicks "Show Solution", the state has featured_code set but
    // featured_student_id is null (no specific student). The projector must display
    // the solution code using the "Featured Code" editor, not the scratch pad.
    lastCodeEditorProps = null;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        session_id: 'test-session-id',
        join_code: 'ABC-123',
        problem: {
          title: 'Test Problem',
          description: 'A test problem',
          starter_code: 'def solve():\n    pass',
        },
        featured_student_id: null,
        featured_code: 'def solution():\n    return 42',
        hasFeaturedSubmission: false,
      }),
    });

    const PublicInstructorView = require('../page').default;
    await act(async () => {
      render(<PublicInstructorView />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('code-editor')).toBeInTheDocument();
    });

    // Should show the solution code (not starter code)
    expect(screen.getByTestId('code-content')).toHaveTextContent('def solution():');
    // Should use the "Featured Code" title, not "Starter Code" or "Scratch Pad"
    expect(screen.getByTestId('code-title')).toHaveTextContent('Featured Code');
  });

  test('shows empty editor when no featured submission and no starter code', async () => {
    lastCodeEditorProps = null;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        session_id: 'test-session-id',
        join_code: 'ABC-123',
        problem: null,
        featured_student_id: null,
        featured_code: null,
        hasFeaturedSubmission: false,
      }),
    });

    const PublicInstructorView = require('../page').default;
    await act(async () => {
      render(<PublicInstructorView />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('code-editor')).toBeInTheDocument();
    });
    expect(screen.getByTestId('code-title')).toHaveTextContent('Scratch Pad');
    expect(lastCodeEditorProps.readOnly).toBeFalsy();
  });

  test('shows starter code in editor when no featured submission but problem has starter_code', async () => {
    lastCodeEditorProps = null;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        session_id: 'test-session-id',
        join_code: 'ABC-123',
        problem: {
          title: 'Test Problem',
          description: 'A test problem',
          starter_code: 'def solve():\n    pass',
        },
        featured_student_id: null,
        featured_code: null,
        hasFeaturedSubmission: false,
      }),
    });

    const PublicInstructorView = require('../page').default;
    await act(async () => {
      render(<PublicInstructorView />);
    });

    // Should show starter code in the editor
    await waitFor(() => {
      expect(screen.getByTestId('code-content')).toHaveTextContent('def solve():');
    });
    expect(screen.getByTestId('code-title')).toHaveTextContent('Starter Code');

    // Should be editable (not read-only)
    expect(lastCodeEditorProps.readOnly).toBeFalsy();
  });

  test('does not restore starter code when editor is cleared', async () => {
    lastCodeEditorProps = null;

    const mockState = {
      session_id: 'test-session-id',
      join_code: 'ABC-123',
      problem: {
        title: 'Test Problem',
        description: 'A test problem',
        starter_code: 'def solve():\n    pass',
      },
      featured_student_id: null,
      featured_code: null,
      hasFeaturedSubmission: false,
    };
    // Provide mock for both initial load and any polling
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockState,
    });

    const PublicInstructorView = require('../page').default;
    await act(async () => {
      render(<PublicInstructorView />);
    });

    // Should initially show starter code
    await waitFor(() => {
      expect(screen.getByTestId('code-content')).toHaveTextContent('def solve():');
    });

    // Simulate user editing then clearing all code via onChange
    await act(async () => {
      lastCodeEditorProps.onChange('some code');
    });
    await act(async () => {
      lastCodeEditorProps.onChange('');
    });

    // Should show empty editor, not starter code
    expect(screen.getByTestId('code-content').textContent).toBe('');
  });

  test('shows error state when API fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Session not found' }),
    });

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Session not found')).toBeInTheDocument();
    });
  });

  test('polls for updates periodically', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        session_id: 'test-session-id',
        join_code: 'ABC-123',
        problem: null,
        featured_student_id: null,
        featured_code: null,
        hasFeaturedSubmission: false,
      }),
    });

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    // Wait for initial fetch
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // Advance timers by 4 seconds (2 poll cycles at 2s interval)
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    // Should have polled additional times
    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThan(1);
    });
  });
});

describe('PublicInstructorView header slot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  test('displays join code in header slot when session loads', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        session_id: 'test-session-id',
        join_code: 'ABC-123',
        problem: {
          title: 'Test Problem',
          description: 'A test problem description',
        },
        featured_student_id: null,
        featured_code: null,
        hasFeaturedSubmission: false,
      }),
    });

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    // Wait for fetch to complete and state to update
    await waitFor(() => {
      expect(screen.getByTestId('code-editor')).toBeInTheDocument();
    });

    // Find the setHeaderSlot call that included the join code
    // (filter out null cleanup calls)
    const slotCalls = mockSetHeaderSlot.mock.calls.filter(
      (call: any[]) => call[0] !== null
    );
    expect(slotCalls.length).toBeGreaterThan(0);

    // Render the last non-null slot content to check for join code
    const lastSlotContent = slotCalls[slotCalls.length - 1][0];
    const { container } = render(lastSlotContent);
    expect(container.textContent).toContain('ABC-123');
  });

  test('passes outputCollapsible={true} to CodeEditor', async () => {
    lastCodeEditorProps = null;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        session_id: 'test-session-id',
        join_code: 'ABC-123',
        problem: {
          title: 'Test Problem',
          description: 'A test problem description',
        },
        featured_student_id: 'student-1',
        featured_code: 'print("hello")',
        hasFeaturedSubmission: true,
      }),
    });

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    await waitFor(() => {
      expect(screen.getByTestId('code-editor')).toBeInTheDocument();
    });

    expect(lastCodeEditorProps).toBeTruthy();
    expect(lastCodeEditorProps.outputCollapsible).toBe(true);
  });
});

// Separate describe block with different navigation mock for no-session_id case
describe('PublicInstructorView without session_id', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Override the mock to return null for session_id
    const { useSearchParams } = require('next/navigation');
    (useSearchParams as jest.Mock).mockReturnValue({
      get: jest.fn(() => null)
    });
  });

  test('shows no session message when session_id is missing', async () => {
    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    await waitFor(() => {
      expect(screen.getByText('No Session')).toBeInTheDocument();
    });
  });
});

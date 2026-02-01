/**
 * Unit tests for the public instructor view component
 * Tests behavior of the public display page including:
 * - Loading state from API
 * - Realtime updates via Supabase broadcast
 * - Conditional polling (only when disconnected)
 * - State management
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(() => ({
    get: jest.fn((key: string) => (key === 'sessionId' ? 'test-session-id' : null))
  })),
}));

// Mock Supabase client for broadcast
const mockSubscribe = jest.fn();
const mockChannel = jest.fn((_channelName?: string) => ({
  on: jest.fn().mockReturnThis(),
  subscribe: mockSubscribe,
}));
const mockRemoveChannel = jest.fn();

jest.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: jest.fn(() => ({
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  })),
}));

// Mock ProtectedRoute to bypass auth
jest.mock('@/components/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

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
  totalSteps: 0,
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

// Helper to simulate broadcast subscription status
const simulateSubscribed = () => {
  const lastCall = mockSubscribe.mock.calls[mockSubscribe.mock.calls.length - 1];
  if (lastCall && lastCall[0]) {
    lastCall[0]('SUBSCRIBED');
  }
};

describe('PublicInstructorView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Default: subscription succeeds
    mockSubscribe.mockImplementation((callback) => {
      callback('SUBSCRIBED');
    });
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
        sessionId: 'test-session-id',
        joinCode: 'ABC-123',
        problem: {
          title: 'Test Problem',
          description: 'A test problem description',
        },
        featuredStudentId: 'student-1',
        featuredCode: 'print("Hello, World!")',
        hasFeaturedSubmission: true,
      }),
    });

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    // Wait for fetch to complete
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/sessions/test-session-id/public-state');
    });

    // Verify content is displayed
    await waitFor(() => {
      expect(screen.getByText('ABC-123')).toBeInTheDocument();
    });

    // Verify problem description is displayed
    await waitFor(() => {
      expect(screen.getByText('A test problem description')).toBeInTheDocument();
    });

    // Verify featured code is shown
    await waitFor(() => {
      expect(screen.getByTestId('code-content')).toHaveTextContent('print("Hello, World!")');
    });
  });

  test('renders problem description with markdown support', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sessionId: 'test-session-id',
        joinCode: 'ABC-123',
        problem: {
          title: 'Test Problem',
          description: '## Markdown Header\n\nThis has **bold** text.',
        },
        featuredStudentId: null,
        featuredCode: null,
        hasFeaturedSubmission: false,
      }),
    });

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    // Wait for content to load
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    // Verify markdown is rendered (h2 for ## header, strong for **bold**)
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Markdown Header' })).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('bold')).toBeInTheDocument();
    });
  });

  test('passes debugger prop to CodeEditor when featured submission exists', async () => {
    lastCodeEditorProps = null;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sessionId: 'test-session-id',
        joinCode: 'ABC-123',
        problem: {
          title: 'Test Problem',
          description: 'A test problem description',
        },
        featuredStudentId: 'student-1',
        featuredCode: 'print("test")',
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

  test('shows empty editor when no featured submission and no starter code', async () => {
    lastCodeEditorProps = null;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sessionId: 'test-session-id',
        joinCode: 'ABC-123',
        problem: null,
        featuredStudentId: null,
        featuredCode: null,
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

  test('shows starter code in editor when no featured submission but problem has starterCode', async () => {
    lastCodeEditorProps = null;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sessionId: 'test-session-id',
        joinCode: 'ABC-123',
        problem: {
          title: 'Test Problem',
          description: 'A test problem',
          starterCode: 'def solve():\n    pass',
        },
        featuredStudentId: null,
        featuredCode: null,
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

  test('subscribes to broadcast channel with correct session ID', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sessionId: 'test-session-id',
        joinCode: 'ABC-123',
        problem: null,
        featuredStudentId: null,
        featuredCode: null,
        hasFeaturedSubmission: false,
      }),
    });

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    // Wait for initial fetch
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    // Verify broadcast channel was created with correct session ID
    expect(mockChannel).toHaveBeenCalledWith('session:test-session-id');
  });

  test('updates state when featured_student_changed broadcast message is received', async () => {
    // Track the broadcast callback
    let broadcastCallback: ((payload: any) => void) | null = null;

    // Create a chainable mock for .on()
    const createChainableMock = () => {
      const mock: any = {
        on: jest.fn((type, options, callback) => {
          if (type === 'broadcast' && options?.event === 'featured_student_changed') {
            broadcastCallback = callback;
          }
          return mock;
        }),
        subscribe: jest.fn((callback) => {
          callback('SUBSCRIBED');
        }),
      };
      return mock;
    };

    mockChannel.mockImplementation(createChainableMock);

    // First fetch returns initial state
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sessionId: 'test-session-id',
        joinCode: 'ABC-123',
        problem: null,
        featuredStudentId: null,
        featuredCode: null,
        hasFeaturedSubmission: false,
      }),
    });

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    // Wait for loading to complete and content to render
    await waitFor(() => {
      expect(screen.getByTestId('code-editor')).toBeInTheDocument();
    });

    // Verify initial fetch happened
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Simulate broadcast message
    await act(async () => {
      if (broadcastCallback) {
        broadcastCallback({
          payload: {
            sessionId: 'test-session-id',
            featuredStudentId: 'student-2',
            featuredCode: 'print("Updated code")',
          },
        });
      }
    });

    // Verify state was updated from broadcast (not from re-fetch)
    await waitFor(() => {
      expect(screen.getByTestId('code-content')).toHaveTextContent('print("Updated code")');
    });

    // Should NOT have re-fetched - broadcast updates state directly
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('updates problem state when problem_updated broadcast message is received', async () => {
    // Track the broadcast callbacks
    let problemUpdatedCallback: ((payload: any) => void) | null = null;

    // Create a chainable mock for .on()
    const createChainableMock = () => {
      const mock: any = {
        on: jest.fn((type, options, callback) => {
          if (type === 'broadcast' && options?.event === 'problem_updated') {
            problemUpdatedCallback = callback;
          }
          return mock;
        }),
        subscribe: jest.fn((callback) => {
          callback('SUBSCRIBED');
        }),
      };
      return mock;
    };

    mockChannel.mockImplementation(createChainableMock);

    // First fetch returns initial state with a problem
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sessionId: 'test-session-id',
        joinCode: 'ABC-123',
        problem: {
          title: 'Original Problem',
          description: 'Original description',
        },
        featuredStudentId: null,
        featuredCode: null,
        hasFeaturedSubmission: false,
      }),
    });

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    // Wait for loading to complete and content to render
    await waitFor(() => {
      expect(screen.getByText('Original description')).toBeInTheDocument();
    });

    // Verify initial fetch happened
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Simulate problem_updated broadcast message
    await act(async () => {
      if (problemUpdatedCallback) {
        problemUpdatedCallback({
          payload: {
            sessionId: 'test-session-id',
            problem: {
              title: 'Updated Problem',
              description: 'Updated description from broadcast',
            },
            timestamp: Date.now(),
          },
        });
      }
    });

    // Verify state was updated from broadcast (not from re-fetch)
    await waitFor(() => {
      expect(screen.getByText('Updated description from broadcast')).toBeInTheDocument();
    });

    // Should NOT have re-fetched - broadcast updates state directly
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('does not poll when broadcast channel is connected', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        sessionId: 'test-session-id',
        joinCode: 'ABC-123',
        problem: null,
        featuredStudentId: null,
        featuredCode: null,
        hasFeaturedSubmission: false,
      }),
    });

    // Subscription succeeds (isConnected = true)
    mockSubscribe.mockImplementation((callback) => {
      callback('SUBSCRIBED');
    });

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    // Wait for initial fetch
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // Advance timers by 4 seconds (2 poll cycles)
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    // Should still be only 1 fetch - no polling when connected
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('polls when broadcast channel fails to connect', async () => {
    // Reset mocks
    mockChannel.mockReset();

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        sessionId: 'test-session-id',
        joinCode: 'ABC-123',
        problem: null,
        featuredStudentId: null,
        featuredCode: null,
        hasFeaturedSubmission: false,
      }),
    });

    // Create channel mock that reports disconnected state
    mockChannel.mockImplementation(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn((callback) => {
        // Report disconnected state
        callback('CHANNEL_ERROR');
      }),
    }));

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.getByTestId('code-editor')).toBeInTheDocument();
    });

    const initialFetchCount = mockFetch.mock.calls.length;

    // Advance timers by 2 seconds - should trigger poll due to disconnected state
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    // Should have polled at least once more
    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThan(initialFetchCount);
    });
  });

  // Note: Testing reconnection behavior is complex due to React state timing.
  // The polling logic is covered by the connected/disconnected tests above.
});

describe('PublicInstructorView collapsible header', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockSubscribe.mockImplementation((callback) => {
      callback('SUBSCRIBED');
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  const renderWithState = async (overrides = {}) => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sessionId: 'test-session-id',
        joinCode: 'ABC-123',
        problem: {
          title: 'Test Problem',
          description: 'A test problem description',
        },
        featuredStudentId: null,
        featuredCode: null,
        hasFeaturedSubmission: false,
        ...overrides,
      }),
    });

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
  };

  test('renders a toggle button for the header', async () => {
    await renderWithState();

    await waitFor(() => {
      const toggleButton = screen.getByRole('button', { name: /collapse problem header/i });
      expect(toggleButton).toBeInTheDocument();
    });
  });

  test('shows problem description by default (expanded)', async () => {
    await renderWithState();

    await waitFor(() => {
      expect(screen.getByText('A test problem description')).toBeInTheDocument();
    });

    // Join code visible in header bar
    expect(screen.getByText('ABC-123')).toBeInTheDocument();
  });

  test('hides problem description when collapsed', async () => {
    const { fireEvent } = require('@testing-library/react');
    await renderWithState();

    await waitFor(() => {
      expect(screen.getByText('A test problem description')).toBeInTheDocument();
    });

    // Click to collapse
    const toggleButton = screen.getByRole('button', { name: /collapse problem header/i });
    await act(async () => {
      fireEvent.click(toggleButton);
    });

    // Description should be hidden
    expect(screen.queryByText('A test problem description')).not.toBeInTheDocument();
  });

  test('shows problem title and join code in collapsed state', async () => {
    const { fireEvent } = require('@testing-library/react');
    await renderWithState();

    await waitFor(() => {
      expect(screen.getByText('A test problem description')).toBeInTheDocument();
    });

    // Click to collapse
    const toggleButton = screen.getByRole('button', { name: /collapse problem header/i });
    await act(async () => {
      fireEvent.click(toggleButton);
    });

    // Problem title still visible in collapsed bar
    expect(screen.getByText('Test Problem')).toBeInTheDocument();
    // Join code still visible in compact form
    expect(screen.getByText('ABC-123')).toBeInTheDocument();
  });

  test('renders join code with text-4xl class for projector visibility', async () => {
    await renderWithState();

    await waitFor(() => {
      const joinCodeElement = screen.getByText('ABC-123');
      expect(joinCodeElement).toBeInTheDocument();
      expect(joinCodeElement.className).toContain('text-4xl');
    });
  });

  test('passes fontSize prop to CodeEditor for projector scaling', async () => {
    lastCodeEditorProps = null;

    await renderWithState({
      featuredStudentId: 'student-1',
      featuredCode: 'print("hello")',
      hasFeaturedSubmission: true,
    });

    await waitFor(() => {
      expect(screen.getByTestId('code-editor')).toBeInTheDocument();
    });

    expect(lastCodeEditorProps).toBeTruthy();
    expect(lastCodeEditorProps.fontSize).toBe(24);
  });

  test('re-expands when toggle is clicked again', async () => {
    const { fireEvent } = require('@testing-library/react');
    await renderWithState();

    await waitFor(() => {
      expect(screen.getByText('A test problem description')).toBeInTheDocument();
    });

    // Collapse
    const toggleButton = screen.getByRole('button', { name: /collapse problem header/i });
    await act(async () => {
      fireEvent.click(toggleButton);
    });

    expect(screen.queryByText('A test problem description')).not.toBeInTheDocument();

    // Expand
    const expandButton = screen.getByRole('button', { name: /expand problem header/i });
    await act(async () => {
      fireEvent.click(expandButton);
    });

    // Description visible again
    await waitFor(() => {
      expect(screen.getByText('A test problem description')).toBeInTheDocument();
    });
  });
});

// Separate describe block with different navigation mock for no-sessionId case
describe('PublicInstructorView without sessionId', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Override the mock to return null for sessionId
    const { useSearchParams } = require('next/navigation');
    (useSearchParams as jest.Mock).mockReturnValue({
      get: jest.fn(() => null)
    });
  });

  test('shows no session message when sessionId is missing', async () => {
    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    await waitFor(() => {
      expect(screen.getByText('No Session')).toBeInTheDocument();
    });
  });
});

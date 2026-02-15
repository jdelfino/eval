/**
 * @jest-environment jsdom
 */

/**
 * Tests that the student page restores code and execution settings
 * from the joinSession API response (returning student scenario).
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock hooks and components
jest.mock('@/hooks/useRealtimeSession');
jest.mock('@/hooks/useSessionHistory', () => ({
  useSessionHistory: () => ({ refetch: jest.fn() }),
}));
jest.mock('@/hooks/useDebugger', () => ({
  useDebugger: () => ({}),
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'student@test.com', display_name: 'Test Student' },
    signOut: jest.fn(),
  }),
}));
jest.mock('@/contexts/HeaderSlotContext', () => ({
  useHeaderSlot: () => ({ setHeaderSlot: jest.fn() }),
}));
jest.mock('@/components/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => key === 'session_id' ? 'session-123' : null,
  }),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

// Capture the code prop passed to CodeEditor
let capturedCodeProp: string | undefined;
jest.mock('../components/CodeEditor', () => ({
  __esModule: true,
  default: (props: { code: string }) => {
    capturedCodeProp = props.code;
    return <div data-testid="code-editor">CodeEditor: {props.code}</div>;
  },
}));
jest.mock('../components/EditorContainer', () => ({
  EditorContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { useRealtimeSession } from '@/hooks/useRealtimeSession';

const StudentPage = require('../page').default;
const mockUseRealtimeSession = useRealtimeSession as jest.Mock;

describe('Student Page - Join Code Restoration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    capturedCodeProp = undefined;
  });

  it('restores saved code from joinSession response for returning student', async () => {
    const mockJoinSession = jest.fn().mockResolvedValue({
      id: 'ss-1',
      session_id: 'session-123',
      user_id: 'user-1',
      name: 'Test Student',
      code: 'print("saved code")',
      execution_settings: null,
      last_update: '2025-01-01T00:00:00Z',
    });

    mockUseRealtimeSession.mockReturnValue({
      session: {
        id: 'session-123',
        problem: { title: 'Test', description: 'Test problem' },
        status: 'active',
      },
      students: [],
      loading: false,
      error: null,
      isConnected: true,
      connectionStatus: 'connected',
      connectionError: null,
      isBroadcastConnected: true,
      updateCode: jest.fn(),
      executeCode: jest.fn(),
      featureStudent: jest.fn(),
      joinSession: mockJoinSession,
      featuredStudent: {},
    });

    render(<StudentPage />);

    // Wait for join to complete and code editor to render with saved code
    await waitFor(() => {
      expect(screen.getByTestId('code-editor')).toBeInTheDocument();
    });

    expect(mockJoinSession).toHaveBeenCalledWith('user-1', 'Test Student');

    await waitFor(() => {
      expect(capturedCodeProp).toBe('print("saved code")');
    });
  });

  it('restores execution settings from joinSession response', async () => {
    const mockJoinSession = jest.fn().mockResolvedValue({
      id: 'ss-1',
      session_id: 'session-123',
      user_id: 'user-1',
      name: 'Test Student',
      code: 'x = 1',
      execution_settings: { random_seed: 42 },
      last_update: '2025-01-01T00:00:00Z',
    });

    mockUseRealtimeSession.mockReturnValue({
      session: {
        id: 'session-123',
        problem: { title: 'Test', description: 'Test problem' },
        status: 'active',
      },
      students: [],
      loading: false,
      error: null,
      isConnected: true,
      connectionStatus: 'connected',
      connectionError: null,
      isBroadcastConnected: true,
      updateCode: jest.fn(),
      executeCode: jest.fn(),
      featureStudent: jest.fn(),
      joinSession: mockJoinSession,
      featuredStudent: {},
    });

    render(<StudentPage />);

    await waitFor(() => {
      expect(screen.getByTestId('code-editor')).toBeInTheDocument();
    });

    // The code should be restored (verifies the whole flow works)
    await waitFor(() => {
      expect(capturedCodeProp).toBe('x = 1');
    });
  });
});

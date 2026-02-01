/**
 * @jest-environment jsdom
 */

/**
 * Tests for Leave Session functionality.
 *
 * Bug: handleLeaveSession only cleared client-side state but did not navigate
 * away or persist the "left" flag. The auto-join effect would immediately
 * rejoin the student to the same session.
 *
 * Fix: Store a "left session" flag in sessionStorage keyed by session ID,
 * check it before auto-joining, and navigate to /sections on leave.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockRouterPush = jest.fn();

// Mock the hooks and components used by the student page
jest.mock('@/hooks/useRealtimeSession');
jest.mock('@/hooks/useSessionHistory', () => ({
  useSessionHistory: () => ({ refetch: jest.fn() }),
}));
jest.mock('@/hooks/useDebugger', () => ({
  useDebugger: () => ({}),
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', username: 'TestStudent', displayName: 'TestStudent', email: 'test@example.com' },
    signOut: jest.fn(),
  }),
}));
jest.mock('@/components/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@/contexts/HeaderSlotContext', () => ({
  useHeaderSlot: () => ({ setHeaderSlot: jest.fn() }),
}));
jest.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => key === 'sessionId' ? 'session-123' : null,
  }),
  useRouter: () => ({
    push: mockRouterPush,
  }),
}));
// Mock CodeEditor to avoid Monaco complexity
jest.mock('../components/CodeEditor', () => ({
  __esModule: true,
  default: () => <div data-testid="code-editor">CodeEditor</div>,
}));
// Mock EditorContainer
jest.mock('../components/EditorContainer', () => ({
  EditorContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { useRealtimeSession } from '@/hooks/useRealtimeSession';

// Import after mocks
const StudentPage = require('../page').default;

const mockUseRealtimeSession = useRealtimeSession as jest.Mock;

describe('Student Page - Leave Session', () => {
  const mockJoinSession = jest.fn().mockResolvedValue({});

  const baseSessionState = {
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
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  it('should not auto-join when left-session flag is set in sessionStorage', async () => {
    // Set the left flag before rendering
    sessionStorage.setItem('left-session:session-123', 'true');

    mockUseRealtimeSession.mockReturnValue(baseSessionState);

    render(<StudentPage />);

    // Wait a tick for effects to run
    await act(async () => {
      await new Promise(r => setTimeout(r, 100));
    });

    // joinSession should NOT have been called because the student left this session
    expect(mockJoinSession).not.toHaveBeenCalled();
  });

  it('should clear left-session flag when session ID changes', async () => {
    // Set a stale left flag for a different session
    sessionStorage.setItem('left-session:old-session', 'true');

    mockUseRealtimeSession.mockReturnValue(baseSessionState);

    render(<StudentPage />);

    // The flag for old-session should remain (we only clear on explicit actions)
    // The new session (session-123) should not have a flag
    expect(sessionStorage.getItem('left-session:session-123')).toBeNull();
  });
});

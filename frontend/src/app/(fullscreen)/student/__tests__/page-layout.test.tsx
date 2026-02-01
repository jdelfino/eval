/**
 * @jest-environment jsdom
 */

/**
 * Tests for student page viewport layout
 *
 * The student session page should fill the viewport like an app/codespace.
 * No page-level header or toolbar — the editor should be the main content,
 * with connection status shown in the global app navbar via HeaderSlotContext.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

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
    user: { id: 'user-1', username: 'TestStudent' },
    signOut: jest.fn(),
  }),
}));
const mockSetHeaderSlot = jest.fn();
jest.mock('@/contexts/HeaderSlotContext', () => ({
  useHeaderSlot: () => ({ setHeaderSlot: mockSetHeaderSlot }),
}));
jest.mock('@/components/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => key === 'sessionId' ? 'session-123' : null,
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
jest.mock('../components/CodeEditor', () => ({
  __esModule: true,
  default: () => <div data-testid="code-editor">CodeEditor</div>,
}));
jest.mock('../components/EditorContainer', () => ({
  EditorContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { useRealtimeSession } from '@/hooks/useRealtimeSession';

const StudentPage = require('../page').default;

const mockUseRealtimeSession = useRealtimeSession as jest.Mock;

describe('Student Page - Viewport Layout', () => {
  const activeSessionState = {
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
    joinSession: jest.fn().mockResolvedValue({}),
    featuredStudent: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  it('should have overflow-hidden on main to prevent page-level scrolling', async () => {
    mockUseRealtimeSession.mockReturnValue(activeSessionState);

    render(<StudentPage />);

    await waitFor(() => {
      expect(screen.getByTestId('code-editor')).toBeInTheDocument();
    });

    const main = screen.getByTestId('code-editor').closest('main');
    expect(main).toHaveClass('overflow-hidden');
  });

  it('should use h-full instead of h-screen to fit within AppShell', async () => {
    mockUseRealtimeSession.mockReturnValue(activeSessionState);

    render(<StudentPage />);

    await waitFor(() => {
      expect(screen.getByTestId('code-editor')).toBeInTheDocument();
    });

    const main = screen.getByTestId('code-editor').closest('main');
    expect(main).toHaveClass('h-full');
    expect(main).not.toHaveClass('h-screen');
  });

  it('should not render a page-level header or Leave Session button', async () => {
    mockUseRealtimeSession.mockReturnValue(activeSessionState);

    render(<StudentPage />);

    await waitFor(() => {
      expect(screen.getByTestId('code-editor')).toBeInTheDocument();
    });

    expect(screen.queryByText('Live Coding Session')).not.toBeInTheDocument();
    expect(screen.queryByText('Leave Session')).not.toBeInTheDocument();
  });

  it('should set connection status in the global header slot', async () => {
    mockUseRealtimeSession.mockReturnValue(activeSessionState);

    render(<StudentPage />);

    await waitFor(() => {
      expect(screen.getByTestId('code-editor')).toBeInTheDocument();
    });

    expect(mockSetHeaderSlot).toHaveBeenCalled();
  });
});

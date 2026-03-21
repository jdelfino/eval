/**
 * Tests for the auto-join behavior on the student page.
 *
 * PLAT-6y2j.1: Remove isConnected gate from auto-join effect.
 * The joinSession call is HTTP-based, not WebSocket-dependent.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import StudentPageWrapper from '../page';

const mockGetStudentWork = jest.fn();
const mockGetActiveSessions = jest.fn();
const mockUpdateStudentWork = jest.fn();
const mockJoinSession = jest.fn();
const mockUpdateCode = jest.fn();
const mockExecuteCode = jest.fn();

jest.mock('@/lib/api/student-work', () => ({
  getStudentWork: (...args: unknown[]) => mockGetStudentWork(...args),
  updateStudentWork: (...args: unknown[]) => mockUpdateStudentWork(...args),
}));

jest.mock('@/lib/api/execute', () => ({
  warmExecutor: jest.fn().mockResolvedValue(undefined),
  executeCode: jest.fn().mockResolvedValue({ success: true, output: '', error: '', execution_time_ms: 10 }),
}));

jest.mock('@/lib/api/sections', () => ({
  getActiveSessions: (...args: unknown[]) => mockGetActiveSessions(...args),
  getSection: jest.fn().mockResolvedValue({
    id: 'section-1',
    name: 'Test Section',
  }),
}));

const mockUseRealtimeSession = jest.fn();

jest.mock('@/hooks/useRealtimeSession', () => ({
  useRealtimeSession: () => mockUseRealtimeSession(),
}));

jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(() => ({
    get: (key: string) => (key === 'work_id' ? 'work-123' : null),
  })),
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
  })),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(() => ({
    user: { id: 'user-1', email: 'test@example.com', display_name: 'Test User' },
  })),
}));

jest.mock('@/contexts/HeaderSlotContext', () => ({
  useHeaderSlot: jest.fn(() => ({
    setHeaderSlot: jest.fn(),
  })),
}));

jest.mock('@/hooks/useApiDebugger', () => ({
  useApiDebugger: jest.fn(() => ({})),
}));

jest.mock('../components/CodeEditor', () => ({
  __esModule: true,
  default: () => <div data-testid="code-editor">CodeEditor</div>,
}));

jest.mock('../components/EditorContainer', () => ({
  EditorContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="editor-container">{children}</div>
  ),
}));

jest.mock('../components/SessionEndedNotification', () => ({
  __esModule: true,
  default: () => <div data-testid="session-ended">Session Ended</div>,
}));

const fakeStudentWork = {
  id: 'work-123',
  user_id: 'user-1',
  section_id: 'section-1',
  problem_id: 'problem-1',
  code: 'print("hello")',
  execution_settings: null,
  last_update: '2024-01-01T00:00:00Z',
  created_at: '2024-01-01T00:00:00Z',
  problem: {
    id: 'problem-1',
    namespace_id: 'ns-1',
    title: 'Test Problem',
    description: 'Test description',
    starter_code: '',
    test_cases: null,
    execution_settings: {},
    author_id: 'instructor-1',
    class_id: 'class-1',
    tags: [],
    solution: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
};

const activeSession = {
  id: 'session-live',
  problem: { id: 'problem-1' },
  status: 'active',
  section_id: 'section-1',
};

describe('StudentPage auto-join (PLAT-6y2j.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    mockJoinSession.mockResolvedValue({ code: 'print("hello")', execution_settings: null });
    mockGetStudentWork.mockResolvedValue(fakeStudentWork);
    mockGetActiveSessions.mockResolvedValue([activeSession]);
  });

  it('auto-joins session immediately even when isConnected is false', async () => {
    // isConnected = false (WebSocket not yet established)
    mockUseRealtimeSession.mockReturnValue({
      session: null,
      loading: false,
      error: null,
      isConnected: false,
      connectionStatus: 'connecting',
      connectionError: null,
      updateCode: mockUpdateCode,
      // executeCode removed from hook
      joinSession: mockJoinSession,
      replacementInfo: null,
    });

    render(<StudentPageWrapper />);

    await waitFor(() => {
      expect(mockJoinSession).toHaveBeenCalledWith('user-1', 'Test User');
    });
  });

  it('auto-joins session when isConnected is true', async () => {
    // isConnected = true (WebSocket connected)
    mockUseRealtimeSession.mockReturnValue({
      session: null,
      loading: false,
      error: null,
      isConnected: true,
      connectionStatus: 'connected',
      connectionError: null,
      updateCode: mockUpdateCode,
      // executeCode removed from hook
      joinSession: mockJoinSession,
      replacementInfo: null,
    });

    render(<StudentPageWrapper />);

    await waitFor(() => {
      expect(mockJoinSession).toHaveBeenCalledWith('user-1', 'Test User');
    });
  });

  it('does not auto-join when left-session flag is set', async () => {
    sessionStorage.setItem('left-session:session-live', 'true');

    mockUseRealtimeSession.mockReturnValue({
      session: null,
      loading: false,
      error: null,
      isConnected: false,
      connectionStatus: 'connecting',
      connectionError: null,
      updateCode: mockUpdateCode,
      // executeCode removed from hook
      joinSession: mockJoinSession,
      replacementInfo: null,
    });

    render(<StudentPageWrapper />);

    // Give time for effects to run
    await new Promise((r) => setTimeout(r, 100));

    expect(mockJoinSession).not.toHaveBeenCalled();
  });
});

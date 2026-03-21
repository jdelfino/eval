/**
 * Tests for the executor warm-up UX on the student workspace page.
 *
 * PLAT-6nij.4: Proactive /warm calls on practice entry and warming-up message on 503.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import StudentPageWrapper from '../page';

const mockGetStudentWork = jest.fn();
const mockGetActiveSessions = jest.fn();
const mockUpdateStudentWork = jest.fn();
const mockWarmExecutor = jest.fn();
const mockJoinSession = jest.fn();
const mockUpdateCode = jest.fn();

jest.mock('@/lib/api/student-work', () => ({
  getStudentWork: (...args: unknown[]) => mockGetStudentWork(...args),
  updateStudentWork: (...args: unknown[]) => mockUpdateStudentWork(...args),
}));

jest.mock('@/lib/api/sections', () => ({
  getActiveSessions: (...args: unknown[]) => mockGetActiveSessions(...args),
  getSection: jest.fn().mockResolvedValue({
    id: 'section-1',
    name: 'Test Section',
  }),
}));

jest.mock('@/lib/api/execute', () => ({
  warmExecutor: (...args: unknown[]) => mockWarmExecutor(...args),
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

jest.mock('@/hooks/useCaseRunner', () => ({
  useCaseRunner: jest.fn(() => ({
    caseResults: {},
    selectedCase: null,
    isRunning: false,
    error: null,
    selectCase: jest.fn(),
    runCase: jest.fn(),
    runAllCases: jest.fn(),
    clearResults: jest.fn(),
  })),
}));

jest.mock('../components/CodeEditor', () => ({
  __esModule: true,
  default: () => {
    return <div data-testid="code-editor">CodeEditor</div>;
  },
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
  last_update: '2024-01-01T00:00:00Z',
  created_at: '2024-01-01T00:00:00Z',
  problem: {
    id: 'problem-1',
    namespace_id: 'ns-1',
    title: 'Test Problem',
    description: 'Test description',
    starter_code: '',
    language: 'python',
    test_cases: null,
    author_id: 'instructor-1',
    class_id: 'class-1',
    tags: [],
    solution: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
};

const defaultRealtimeSession = {
  session: null,
  loading: false,
  error: null,
  isConnected: false,
  connectionStatus: 'disconnected',
  connectionError: null,
  updateCode: mockUpdateCode,
  joinSession: mockJoinSession,
  replacementInfo: null,
};

describe('StudentPage warm-up UX (PLAT-6nij.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRealtimeSession.mockReturnValue(defaultRealtimeSession);
    mockUpdateStudentWork.mockResolvedValue(undefined);
    mockWarmExecutor.mockResolvedValue(undefined);
  });

  describe('warmExecutor called on practice mode entry', () => {
    it('calls warmExecutor when no active session is found (practice mode)', async () => {
      mockGetStudentWork.mockResolvedValue(fakeStudentWork);
      mockGetActiveSessions.mockResolvedValue([]);

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('code-editor')).toBeInTheDocument();
      });

      expect(mockWarmExecutor).toHaveBeenCalledTimes(1);
    });

    it('does not call warmExecutor when active session is found (live mode)', async () => {
      mockGetStudentWork.mockResolvedValue(fakeStudentWork);
      mockGetActiveSessions.mockResolvedValue([
        {
          id: 'session-1',
          problem: { id: 'problem-1' },
          status: 'active',
          section_id: 'section-1',
        },
      ]);
      mockJoinSession.mockResolvedValue({ code: 'print("hello")', execution_settings: null });
      mockUseRealtimeSession.mockReturnValue({
        ...defaultRealtimeSession,
        joinSession: mockJoinSession,
      });

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(mockGetActiveSessions).toHaveBeenCalledWith('section-1');
      });

      // Give a moment for effects to settle
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(mockWarmExecutor).not.toHaveBeenCalled();
    });

    it('does not block page load or show errors if warmExecutor fails', async () => {
      mockGetStudentWork.mockResolvedValue(fakeStudentWork);
      mockGetActiveSessions.mockResolvedValue([]);
      mockWarmExecutor.mockRejectedValue(new Error('Network error'));

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('code-editor')).toBeInTheDocument();
      });

      // Page should load successfully despite warmExecutor failing
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

});

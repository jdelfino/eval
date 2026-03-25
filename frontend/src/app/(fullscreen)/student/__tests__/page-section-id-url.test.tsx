/**
 * Tests for section_id URL param optimization on the student page.
 *
 * PLAT-6y2j.1: Pass section_id in URL so getActiveSessions can start
 * immediately in parallel with getStudentWork (Step 1), instead of waiting
 * for Step 1 to complete first.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
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
  executeCode: jest.fn().mockResolvedValue({ results: [{ name: 'run', type: 'io', status: 'run', input: '', actual: '', time_ms: 10 }], summary: { total: 1, passed: 0, failed: 0, errors: 0, run: 1, time_ms: 10 } }),
}));

jest.mock('@/lib/api/sections', () => ({
  getActiveSessions: (...args: unknown[]) => mockGetActiveSessions(...args),
  getSection: jest.fn().mockResolvedValue({
    id: 'section-1',
    name: 'Test Section',
  }),
}));

const mockUseRealtimeSession = jest.fn(() => ({
  session: null,
  loading: false,
  error: null,
  isConnected: false,
  connectionStatus: 'disconnected',
  connectionError: null,
  updateCode: mockUpdateCode,
  joinSession: mockJoinSession,
  replacementInfo: null,
}));

jest.mock('@/hooks/useRealtimeSession', () => ({
  useRealtimeSession: () => mockUseRealtimeSession(),
}));

const mockUseSearchParams = jest.fn();

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockUseSearchParams(),
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
  last_update: '2024-01-01T00:00:00Z',
  created_at: '2024-01-01T00:00:00Z',
  problem: {
    id: 'problem-1',
    namespace_id: 'ns-1',
    title: 'Test Problem',
    description: 'Test description',
    starter_code: '',
    test_cases: null,
    author_id: 'instructor-1',
    class_id: 'class-1',
    tags: [],
    solution: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
};

describe('StudentPage section_id URL param (PLAT-6y2j.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    mockGetStudentWork.mockResolvedValue(fakeStudentWork);
    mockGetActiveSessions.mockResolvedValue([]);
    mockJoinSession.mockResolvedValue({ code: '', execution_settings: null });
    mockUseRealtimeSession.mockReturnValue({
      session: null,
      loading: false,
      error: null,
      isConnected: false,
      connectionStatus: 'disconnected',
      connectionError: null,
      updateCode: mockUpdateCode,
      joinSession: mockJoinSession,
      replacementInfo: null,
    });
  });

  it('starts fetching active sessions immediately when section_id is in URL (before Step 1 completes)', async () => {
    // Delay Step 1 (getStudentWork) to simulate it being slow
    let resolveWork: (value: any) => void;
    const workPromise = new Promise((resolve) => { resolveWork = resolve; });
    mockGetStudentWork.mockReturnValue(workPromise);
    mockGetActiveSessions.mockResolvedValue([]);

    // URL has both work_id and section_id
    mockUseSearchParams.mockReturnValue({
      get: (key: string) => {
        if (key === 'work_id') return 'work-123';
        if (key === 'section_id') return 'section-1';
        return null;
      },
    });

    render(<StudentPageWrapper />);

    // getActiveSessions should be called immediately (before Step 1 resolves)
    // because section_id is available from the URL
    await waitFor(() => {
      expect(mockGetActiveSessions).toHaveBeenCalledWith('section-1');
    });

    // Step 1 hasn't resolved yet (we haven't called resolveWork)
    expect(mockGetStudentWork).toHaveBeenCalledWith('work-123');

    // Now resolve Step 1
    resolveWork!(fakeStudentWork);
  });

  it('still works when section_id is NOT in URL (falls back to Step 1 sequential flow)', async () => {
    // No section_id in URL — old behavior: wait for Step 1 to get sectionId
    mockUseSearchParams.mockReturnValue({
      get: (key: string) => {
        if (key === 'work_id') return 'work-123';
        return null;
      },
    });

    render(<StudentPageWrapper />);

    // getStudentWork resolves and provides sectionId
    await waitFor(() => {
      expect(mockGetStudentWork).toHaveBeenCalledWith('work-123');
    });

    // getActiveSessions should eventually be called with section-1 from student work
    await waitFor(() => {
      expect(mockGetActiveSessions).toHaveBeenCalledWith('section-1');
    });
  });

  it('falls back to practice mode when getActiveSessions fails (section_id from URL)', async () => {
    mockGetActiveSessions.mockRejectedValue(new Error('Network error'));

    mockUseSearchParams.mockReturnValue({
      get: (key: string) => {
        if (key === 'work_id') return 'work-123';
        if (key === 'section_id') return 'section-1';
        return null;
      },
    });

    render(<StudentPageWrapper />);

    // Even on error, the page should eventually show the editor (practice mode)
    await waitFor(() => {
      expect(mockGetActiveSessions).toHaveBeenCalledWith('section-1');
    });

    // After Step 1 also resolves, mode should be practice
    await waitFor(() => {
      const editor = document.querySelector('[data-testid="code-editor"]');
      expect(editor).not.toBeNull();
    });
  });
});

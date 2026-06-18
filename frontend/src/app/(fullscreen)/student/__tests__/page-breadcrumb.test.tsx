/**
 * Tests for the breadcrumb navigation in the student editor page.
 *
 * The breadcrumb should appear at the top of the main content area when
 * sectionId is known, showing "Section Name / Problem Title" with the
 * section name linking back to /sections/{sectionId}.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import StudentPageWrapper from '../page';

// Mocks
const mockGetStudentWork = jest.fn();
const mockGetActiveSessions = jest.fn();
const mockGetSection = jest.fn();
const mockUpdateStudentWork = jest.fn();
const mockJoinSession = jest.fn();
const mockUpdateCode = jest.fn();

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
  getSection: (...args: unknown[]) => mockGetSection(...args),
}));

const mockUseRealtimeSession = jest.fn(() => ({
  session: null as any,
  loading: false,
  error: null,
  isConnected: false,
  connectionStatus: 'disconnected',
  connectionError: null,
  updateCode: mockUpdateCode,
  joinSession: mockJoinSession,
  replacementInfo: null as any,
}));

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

jest.mock('@/hooks/useApiDebugger', () => ({
  useApiDebugger: jest.fn(() => ({
    trace: null, currentStep: 0, isLoading: false, error: null,
    requestTrace: jest.fn(), setTrace: jest.fn(), setError: jest.fn(),
    stepForward: jest.fn(), stepBackward: jest.fn(), jumpToStep: jest.fn(),
    jumpToFirst: jest.fn(), jumpToLast: jest.fn(), reset: jest.fn(),
    getCurrentStep: jest.fn(() => null), getCurrentLocals: jest.fn(() => ({})),
    getCurrentGlobals: jest.fn(() => ({})), getCurrentCallStack: jest.fn(() => []),
    getPreviousStep: jest.fn(() => null),
    total_steps: 0, hasTrace: false, canStepForward: false, canStepBackward: false,
  })),
}));

jest.mock('@/components/workspace/WorkspaceShell', () => ({
  __esModule: true,
  default: () => <div data-testid="workspace-shell">WorkspaceShell</div>,
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
    title: 'Two Sum',
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

const fakeSection = {
  id: 'section-1',
  name: 'CS 101 - Section A',
  class_id: 'class-1',
  namespace_id: 'ns-1',
  join_code: 'ABCD',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('StudentPage breadcrumb', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('renders breadcrumb with section name and problem title after data loads', async () => {
    mockGetStudentWork.mockResolvedValue(fakeStudentWork);
    mockGetActiveSessions.mockResolvedValue([]);
    mockGetSection.mockResolvedValue(fakeSection);

    render(<StudentPageWrapper />);

    await waitFor(() => {
      expect(screen.getByText('CS 101 - Section A')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Two Sum')).toBeInTheDocument();
    });
  });

  it('section name in breadcrumb links to /sections/{sectionId}', async () => {
    mockGetStudentWork.mockResolvedValue(fakeStudentWork);
    mockGetActiveSessions.mockResolvedValue([]);
    mockGetSection.mockResolvedValue(fakeSection);

    render(<StudentPageWrapper />);

    await waitFor(() => {
      const sectionLink = screen.getByRole('link', { name: 'CS 101 - Section A' });
      expect(sectionLink).toHaveAttribute('href', '/sections/section-1');
    });
  });

  it('problem title shows as current page (not a link)', async () => {
    mockGetStudentWork.mockResolvedValue(fakeStudentWork);
    mockGetActiveSessions.mockResolvedValue([]);
    mockGetSection.mockResolvedValue(fakeSection);

    render(<StudentPageWrapper />);

    await waitFor(() => {
      expect(screen.getByText('Two Sum')).toBeInTheDocument();
    });

    // The problem title should not be a link
    const problemTitleEl = screen.getByText('Two Sum');
    expect(problemTitleEl.tagName).not.toBe('A');
    expect(problemTitleEl.closest('a')).toBeNull();
  });

  it('stays in loading until the section pointer resolves, then shows the section name', async () => {
    // G4 B1: the page resolves live-vs-practice from getSection().current_session_id,
    // so mode (and thus the workspace shell) cannot settle until getSection resolves.
    let resolveSection: (value: any) => void;
    const sectionPromise = new Promise((resolve) => {
      resolveSection = resolve;
    });
    mockGetStudentWork.mockResolvedValue(fakeStudentWork);
    mockGetSection.mockReturnValue(sectionPromise);

    render(<StudentPageWrapper />);

    // While getSection is pending, the page is still loading (no shell yet).
    await waitFor(() => {
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('workspace-shell')).not.toBeInTheDocument();

    // Resolve section → mode settles (practice), shell + breadcrumb render.
    resolveSection!({ ...fakeSection, current_session_id: null });
    await waitFor(() => {
      expect(screen.getByText('CS 101 - Section A')).toBeInTheDocument();
    });
  });

  it('gracefully degrades if getSection fails: shows "Section" fallback', async () => {
    mockGetStudentWork.mockResolvedValue(fakeStudentWork);
    mockGetActiveSessions.mockResolvedValue([]);
    mockGetSection.mockRejectedValue(new Error('Network error'));

    render(<StudentPageWrapper />);

    await waitFor(() => {
      expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
    });

    // Breadcrumb should still render with fallback text
    expect(screen.getByText('Section')).toBeInTheDocument();
  });

  it('fetches section using the sectionId from student work', async () => {
    mockGetStudentWork.mockResolvedValue(fakeStudentWork);
    mockGetActiveSessions.mockResolvedValue([]);
    mockGetSection.mockResolvedValue(fakeSection);

    render(<StudentPageWrapper />);

    await waitFor(() => {
      expect(mockGetSection).toHaveBeenCalledWith('section-1');
    });
  });
});

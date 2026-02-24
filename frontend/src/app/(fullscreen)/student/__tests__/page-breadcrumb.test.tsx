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
const mockExecuteStudentWork = jest.fn();
const mockJoinSession = jest.fn();
const mockUpdateCode = jest.fn();
const mockExecuteCode = jest.fn();

jest.mock('@/lib/api/student-work', () => ({
  getStudentWork: (...args: unknown[]) => mockGetStudentWork(...args),
  updateStudentWork: (...args: unknown[]) => mockUpdateStudentWork(...args),
  executeStudentWork: (...args: unknown[]) => mockExecuteStudentWork(...args),
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
  executeCode: mockExecuteCode,
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
    title: 'Two Sum',
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
      executeCode: mockExecuteCode,
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

  it('shows fallback "Section" text while section name is loading', async () => {
    // Delay getSection to simulate loading
    let resolveSection: (value: any) => void;
    const sectionPromise = new Promise((resolve) => {
      resolveSection = resolve;
    });
    mockGetStudentWork.mockResolvedValue(fakeStudentWork);
    mockGetActiveSessions.mockResolvedValue([]);
    mockGetSection.mockReturnValue(sectionPromise);

    render(<StudentPageWrapper />);

    // After student work loads but before section loads, breadcrumb shows fallback
    await waitFor(() => {
      expect(screen.getByTestId('code-editor')).toBeInTheDocument();
    });

    // The breadcrumb should show a fallback while waiting
    expect(screen.getByText('Section')).toBeInTheDocument();

    // Resolve section
    resolveSection!(fakeSection);
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
      expect(screen.getByTestId('code-editor')).toBeInTheDocument();
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

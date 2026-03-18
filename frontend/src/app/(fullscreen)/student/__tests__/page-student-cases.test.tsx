/**
 * Tests for student case CRUD operations on the student workspace page.
 *
 * PLAT-x0ii: Student case CRUD callbacks are no-op stubs — add/edit/delete broken
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import StudentPageWrapper from '../page';

// Mock dependencies
const mockGetStudentWork = jest.fn();
const mockGetActiveSessions = jest.fn();
const mockUpdateStudentWork = jest.fn();
const mockJoinSession = jest.fn();
const mockUpdateCode = jest.fn();

jest.mock('@/lib/api/student-work', () => ({
  getStudentWork: (...args: unknown[]) => mockGetStudentWork(...args),
  updateStudentWork: (...args: unknown[]) => mockUpdateStudentWork(...args),
}));

jest.mock('@/lib/api/execute', () => ({
  warmExecutor: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/api/sections', () => ({
  getActiveSessions: (...args: unknown[]) => mockGetActiveSessions(...args),
  getSection: jest.fn().mockResolvedValue({
    id: 'section-1',
    name: 'Test Section',
    class_id: 'class-1',
    namespace_id: 'ns-1',
    join_code: 'ABCD',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
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

const mockCaseRunner = {
  caseResults: {},
  selectedCase: null,
  isRunning: false,
  error: null,
  selectCase: jest.fn(),
  runCase: jest.fn(),
  runAllCases: jest.fn(),
  clearResults: jest.fn(),
};

jest.mock('@/hooks/useCaseRunner', () => ({
  useCaseRunner: jest.fn(() => mockCaseRunner),
}));

// Capture CodeEditor props for assertions
let lastCodeEditorProps: any = null;

jest.mock('../components/CodeEditor', () => ({
  __esModule: true,
  default: (props: any) => {
    lastCodeEditorProps = props;
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
  test_cases: [
    { name: 'my-case', input: 'hello', match_type: 'exact', order: 0 },
  ],
  last_update: '2024-01-01T00:00:00Z',
  created_at: '2024-01-01T00:00:00Z',
  problem: {
    id: 'problem-1',
    namespace_id: 'ns-1',
    title: 'Test Problem',
    description: 'Test description',
    starter_code: '',
    test_cases: [
      { name: 'instructor-case', input: 'hi', expected_output: 'Hello', match_type: 'exact', order: 0 },
    ],
    author_id: 'instructor-1',
    class_id: 'class-1',
    tags: [],
    solution: null,
    language: 'python',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
};

describe('StudentPage student case CRUD (PLAT-x0ii)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastCodeEditorProps = null;
    mockGetStudentWork.mockResolvedValue(fakeStudentWork);
    mockGetActiveSessions.mockResolvedValue([]);
    mockUpdateStudentWork.mockResolvedValue(undefined);
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

  describe('props passed to CodeEditor', () => {
    it('passes onAddCase handler to CodeEditor', async () => {
      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('code-editor')).toBeInTheDocument();
      });

      expect(lastCodeEditorProps).not.toBeNull();
      expect(typeof lastCodeEditorProps.onAddCase).toBe('function');
    });

    it('passes onUpdateStudentCase handler to CodeEditor', async () => {
      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('code-editor')).toBeInTheDocument();
      });

      expect(lastCodeEditorProps).not.toBeNull();
      expect(typeof lastCodeEditorProps.onUpdateStudentCase).toBe('function');
    });

    it('passes onDeleteStudentCase handler to CodeEditor', async () => {
      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('code-editor')).toBeInTheDocument();
      });

      expect(lastCodeEditorProps).not.toBeNull();
      expect(typeof lastCodeEditorProps.onDeleteStudentCase).toBe('function');
    });
  });

  describe('onAddCase handler', () => {
    it('adds a new student case to studentCases with correct structure', async () => {
      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('code-editor')).toBeInTheDocument();
      });

      const initialStudentCases = lastCodeEditorProps.studentCases;
      expect(initialStudentCases).toHaveLength(1);

      // Call the onAddCase handler
      act(() => {
        lastCodeEditorProps.onAddCase();
      });

      await waitFor(() => {
        expect(lastCodeEditorProps.studentCases).toHaveLength(2);
      });

      const newCase = lastCodeEditorProps.studentCases[1];
      expect(newCase).toMatchObject({
        input: '',
        match_type: 'exact',
        order: 1,
      });
      // name should be a non-empty string
      expect(typeof newCase.name).toBe('string');
      expect(newCase.name.length).toBeGreaterThan(0);
    });

    it('generates a unique name for the new student case', async () => {
      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('code-editor')).toBeInTheDocument();
      });

      act(() => {
        lastCodeEditorProps.onAddCase();
      });

      await waitFor(() => {
        expect(lastCodeEditorProps.studentCases).toHaveLength(2);
      });

      const names = lastCodeEditorProps.studentCases.map((c: any) => c.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });

  describe('onUpdateStudentCase handler', () => {
    it('updates an existing student case by name', async () => {
      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('code-editor')).toBeInTheDocument();
      });

      expect(lastCodeEditorProps.studentCases[0].name).toBe('my-case');
      expect(lastCodeEditorProps.studentCases[0].input).toBe('hello');

      act(() => {
        lastCodeEditorProps.onUpdateStudentCase('my-case', { input: 'world' });
      });

      await waitFor(() => {
        expect(lastCodeEditorProps.studentCases[0].input).toBe('world');
      });

      // Other fields should be preserved
      expect(lastCodeEditorProps.studentCases[0].name).toBe('my-case');
      expect(lastCodeEditorProps.studentCases[0].match_type).toBe('exact');
    });

    it('does not modify other cases when updating one', async () => {
      const workWithMultipleCases = {
        ...fakeStudentWork,
        test_cases: [
          { name: 'case-a', input: 'a', match_type: 'exact', order: 0 },
          { name: 'case-b', input: 'b', match_type: 'exact', order: 1 },
        ],
      };
      mockGetStudentWork.mockResolvedValue(workWithMultipleCases);

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('code-editor')).toBeInTheDocument();
      });

      act(() => {
        lastCodeEditorProps.onUpdateStudentCase('case-a', { input: 'updated' });
      });

      await waitFor(() => {
        expect(lastCodeEditorProps.studentCases[0].input).toBe('updated');
      });

      expect(lastCodeEditorProps.studentCases[1].input).toBe('b');
    });

    it('ignores update for non-existent case name', async () => {
      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('code-editor')).toBeInTheDocument();
      });

      const casesBefore = [...lastCodeEditorProps.studentCases];

      act(() => {
        lastCodeEditorProps.onUpdateStudentCase('nonexistent', { input: 'x' });
      });

      await waitFor(() => {
        // Should still have same length
        expect(lastCodeEditorProps.studentCases).toHaveLength(casesBefore.length);
      });

      // Original case should be unchanged
      expect(lastCodeEditorProps.studentCases[0].input).toBe('hello');
    });
  });

  describe('onDeleteStudentCase handler', () => {
    it('removes a student case by name', async () => {
      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('code-editor')).toBeInTheDocument();
      });

      expect(lastCodeEditorProps.studentCases).toHaveLength(1);

      act(() => {
        lastCodeEditorProps.onDeleteStudentCase('my-case');
      });

      await waitFor(() => {
        expect(lastCodeEditorProps.studentCases).toHaveLength(0);
      });
    });

    it('removes the correct case when multiple cases exist', async () => {
      const workWithMultipleCases = {
        ...fakeStudentWork,
        test_cases: [
          { name: 'case-a', input: 'a', match_type: 'exact', order: 0 },
          { name: 'case-b', input: 'b', match_type: 'exact', order: 1 },
        ],
      };
      mockGetStudentWork.mockResolvedValue(workWithMultipleCases);

      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('code-editor')).toBeInTheDocument();
      });

      act(() => {
        lastCodeEditorProps.onDeleteStudentCase('case-a');
      });

      await waitFor(() => {
        expect(lastCodeEditorProps.studentCases).toHaveLength(1);
      });

      expect(lastCodeEditorProps.studentCases[0].name).toBe('case-b');
    });

    it('does nothing when deleting a non-existent case name', async () => {
      render(<StudentPageWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('code-editor')).toBeInTheDocument();
      });

      act(() => {
        lastCodeEditorProps.onDeleteStudentCase('nonexistent');
      });

      await waitFor(() => {
        expect(lastCodeEditorProps.studentCases).toHaveLength(1);
      });
    });
  });
});

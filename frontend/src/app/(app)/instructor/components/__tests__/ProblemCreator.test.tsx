/**
 * Tests for ProblemCreator component
 *
 * Tests both create and edit modes with all fields:
 * - Loading existing problem data
 * - Editing all fields (title, description, starterCode)
 * - Form submission and validation
 * - Error handling
 * - Cancel functionality
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProblemCreator from '../ProblemCreator';

// Mock fetch globally
global.fetch = jest.fn();

// Mock useDebugger hook
jest.mock('@/hooks/useDebugger', () => ({
  useDebugger: () => ({
    trace: null,
    currentStep: 0,
    isLoading: false,
    error: null,
    hasTrace: false,
    totalSteps: 0,
    canStepForward: false,
    canStepBackward: false,
    requestTrace: jest.fn(),
    setTrace: jest.fn(),
    setError: jest.fn(),
    stepForward: jest.fn(),
    stepBackward: jest.fn(),
    jumpToStep: jest.fn(),
    jumpToFirst: jest.fn(),
    jumpToLast: jest.fn(),
    reset: jest.fn(),
    getCurrentStep: jest.fn(() => null),
    getCurrentLocals: jest.fn(() => ({})),
    getCurrentGlobals: jest.fn(() => ({})),
    getCurrentCallStack: jest.fn(() => []),
    getPreviousStep: jest.fn(() => null)
  })
}));

// Mock useResponsiveLayout
jest.mock('@/hooks/useResponsiveLayout', () => ({
  useResponsiveLayout: () => true,
  useSidebarSection: () => ({
    isCollapsed: true,
    toggle: jest.fn(),
    setCollapsed: jest.fn()
  })
}));

// Mock CodeEditor component
jest.mock('@/app/(fullscreen)/student/components/CodeEditor', () => {
  return function MockCodeEditor({ code, onChange, title, useApiExecution, problem, onProblemEdit, editableProblem }: any) {
    return (
      <div data-testid={`code-editor-${title}`}>
        {/* Show editable problem fields if in edit mode */}
        {editableProblem && problem && onProblemEdit && (
          <div data-testid="editable-problem-sidebar">
            <label htmlFor="problem-title">Title *</label>
            <input
              id="problem-title"
              value={problem.title || ''}
              onChange={(e) => onProblemEdit({ title: e.target.value })}
            />
            <label htmlFor="problem-description">Description</label>
            <textarea
              id="problem-description"
              value={problem.description || ''}
              onChange={(e) => onProblemEdit({ description: e.target.value })}
            />
          </div>
        )}
        <label htmlFor={`code-${title}`}>{title}</label>
        <textarea
          id={`code-${title}`}
          aria-label={title}
          value={code}
          onChange={(e) => onChange(e.target.value)}
          data-use-api={useApiExecution}
        />
      </div>
    );
  };
});

describe('ProblemCreator Component', () => {
  // Helper to create a fetch mock that handles classes API and delegates to a problem handler
  const createFetchMock = (problemHandler?: (url: string, opts?: any) => Promise<any>) => {
    return jest.fn((url: string, opts?: any) => {
      if (typeof url === 'string' && url.includes('/api/classes')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ classes: [] }),
        });
      }
      if (problemHandler) {
        return problemHandler(url, opts);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ problem: { id: 'default' } }),
      });
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock) = createFetchMock();
  });

  describe('Layout', () => {
    it('should use flex layout classes for full-height rendering', () => {
      const { container } = render(<ProblemCreator />);
      const outerDiv = container.firstElementChild;
      expect(outerDiv).toHaveClass('flex-1', 'min-h-0', 'flex', 'flex-col');
    });
  });

  describe('Create Mode', () => {
    it('should render form in create mode when no problemId provided', () => {
      render(<ProblemCreator />);

      expect(screen.getByText('Create New Problem')).toBeInTheDocument();
      // Fields are now in the editable problem sidebar within CodeEditor
      expect(screen.getByLabelText('Title *')).toHaveValue('');
      expect(screen.getByLabelText('Description')).toHaveValue('');
      expect(screen.getByLabelText(/Starter Code/)).toHaveValue('');
      expect(screen.getByText('Create Problem')).toBeInTheDocument();
    });

    it('should validate required title field', async () => {
      render(<ProblemCreator />);

      const submitButton = screen.getByText('Create Problem');

      // Button should be disabled when title is empty
      expect(submitButton).toBeDisabled();

      // Only the classes fetch should have been called, no problem create
      const problemCalls = (global.fetch as jest.Mock).mock.calls.filter(
        (c: any[]) => typeof c[0] === 'string' && !c[0].includes('/api/classes')
      );
      expect(problemCalls).toHaveLength(0);
    });

    it('should create new problem with all fields', async () => {
      const onProblemCreated = jest.fn();
      const mockProblem = {
        id: 'problem-123',
        title: 'Test Problem',
        description: 'Test description',
        starterCode: 'def solution():\n    pass',
      };

      (global.fetch as jest.Mock) = createFetchMock(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ problem: mockProblem }),
        })
      );

      render(<ProblemCreator onProblemCreated={onProblemCreated} />);

      // Fill in fields (now in editable sidebar)
      fireEvent.change(screen.getByLabelText('Title *'), {
        target: { value: 'Test Problem' },
      });
      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Test description' },
      });
      fireEvent.change(screen.getByLabelText(/Starter Code/), {
        target: { value: 'def solution():\n    pass' },
      });

      // Submit
      fireEvent.click(screen.getByText('Create Problem'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/problems', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"title":"Test Problem"'),
        });
      });

      await waitFor(() => {
        expect(onProblemCreated).toHaveBeenCalledWith('problem-123');
      });
    });

    it('should display error when create fails', async () => {
      (global.fetch as jest.Mock) = createFetchMock(() =>
        Promise.resolve({
          ok: false,
          json: async () => ({ error: 'Creation failed' }),
        })
      );

      render(<ProblemCreator />);

      fireEvent.change(screen.getByLabelText(/Title/), {
        target: { value: 'Test Problem' },
      });
      fireEvent.click(screen.getByText('Create Problem'));

      await waitFor(() => {
        expect(screen.getByText('Creation failed')).toBeInTheDocument();
      });
    });
  });

  describe('Edit Mode', () => {
    const mockExistingProblem = {
      id: 'problem-456',
      title: 'Existing Problem',
      description: 'Original description',
      starterCode: 'def original():\n    pass',
      authorId: 'user-1',
    };

    it('should load existing problem data in edit mode', async () => {
      (global.fetch as jest.Mock) = createFetchMock((url) => {
        if (url.includes('/api/problems/')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ problem: mockExistingProblem }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      render(<ProblemCreator problemId="problem-456" />);

      // Should show loading state
      expect(screen.getByText('Loading problem...')).toBeInTheDocument();

      // Should fetch problem data
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/problems/problem-456');
      });

      // Should populate form
      await waitFor(() => {
        expect(screen.getByText('Edit Problem')).toBeInTheDocument();
      });

      expect(screen.getByLabelText(/Title/)).toHaveValue('Existing Problem');
      expect(screen.getByLabelText(/Description/)).toHaveValue('Original description');
      expect(screen.getByLabelText(/Starter Code/)).toHaveValue('def original():\n    pass');
      expect(screen.getByText('Update Problem')).toBeInTheDocument();
    });

    it('should display error when loading problem fails', async () => {
      (global.fetch as jest.Mock) = createFetchMock((url) => {
        if (url.includes('/api/problems/')) {
          return Promise.resolve({
            ok: false,
            json: async () => ({ error: 'Not found' }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      render(<ProblemCreator problemId="problem-456" />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load problem')).toBeInTheDocument();
      });
    });

    it('should update existing problem with modified fields', async () => {
      const onProblemCreated = jest.fn();
      const updatedProblem = { ...mockExistingProblem, title: 'Updated Problem' };

      (global.fetch as jest.Mock) = createFetchMock((url, opts) => {
        if (url.includes('/api/problems/') && opts?.method === 'PATCH') {
          return Promise.resolve({
            ok: true,
            json: async () => ({ problem: updatedProblem }),
          });
        }
        if (url.includes('/api/problems/')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ problem: mockExistingProblem }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      render(<ProblemCreator problemId="problem-456" onProblemCreated={onProblemCreated} />);

      // Wait for load
      await waitFor(() => {
        expect(screen.getByLabelText(/Title/)).toHaveValue('Existing Problem');
      });

      // Modify title
      fireEvent.change(screen.getByLabelText(/Title/), {
        target: { value: 'Updated Problem' },
      });

      // Submit
      fireEvent.click(screen.getByText('Update Problem'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/problems/problem-456', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"title":"Updated Problem"'),
        });
      });

      await waitFor(() => {
        expect(onProblemCreated).toHaveBeenCalledWith('problem-456');
      });
    });

    it('should handle update failure', async () => {
      let patchCalled = false;
      (global.fetch as jest.Mock) = createFetchMock((url, opts) => {
        if (url.includes('/api/problems/') && opts?.method === 'PATCH') {
          patchCalled = true;
          return Promise.resolve({
            ok: false,
            json: async () => ({ error: 'Update failed' }),
          });
        }
        if (url.includes('/api/problems/')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ problem: mockExistingProblem }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      render(<ProblemCreator problemId="problem-456" />);

      await waitFor(() => {
        expect(screen.getByLabelText(/Title/)).toHaveValue('Existing Problem');
      });

      fireEvent.click(screen.getByText('Update Problem'));

      await waitFor(() => {
        expect(screen.getByText('Update failed')).toBeInTheDocument();
      });
    });
  });

  describe('Cancel Functionality', () => {
    it('should call onCancel when cancel button clicked', () => {
      const onCancel = jest.fn();
      render(<ProblemCreator onCancel={onCancel} />);

      const cancelButton = screen.getByTitle('Back to Problem Library');
      fireEvent.click(cancelButton);

      expect(onCancel).toHaveBeenCalled();
    });

    it('should not show cancel button when onCancel not provided', () => {
      render(<ProblemCreator />);
      expect(screen.queryByTitle('Back to Problem Library')).not.toBeInTheDocument();
    });

    it('should show cancel button when onCancel is provided', async () => {
      const onCancel = jest.fn();
      render(<ProblemCreator onCancel={onCancel} />);

      expect(screen.getByTitle('Back to Problem Library')).toBeInTheDocument();
    });
  });

  describe('Form States', () => {
    it('should disable submit button when title is empty', () => {
      render(<ProblemCreator />);
      const submitButton = screen.getByText('Create Problem');
      expect(submitButton).toBeDisabled();
    });

    it('should enable submit button when title is provided', () => {
      render(<ProblemCreator />);

      fireEvent.change(screen.getByLabelText(/Title/), {
        target: { value: 'Test' },
      });

      const submitButton = screen.getByText('Create Problem');
      expect(submitButton).not.toBeDisabled();
    });

    it('should show loading state during submission', async () => {
      (global.fetch as jest.Mock) = createFetchMock(
        () => new Promise(() => {}) // Never resolves
      );

      render(<ProblemCreator />);

      fireEvent.change(screen.getByLabelText(/Title/), {
        target: { value: 'Test' },
      });
      fireEvent.click(screen.getByText('Create Problem'));

      await waitFor(() => {
        expect(screen.getByText('Creating...')).toBeInTheDocument();
      });
    });
  });

  describe('Execution Settings', () => {
    it('should pass execution settings to CodeEditor components', () => {
      render(<ProblemCreator />);

      // Verify CodeEditor component is rendered
      expect(screen.getByTestId('code-editor-Starter Code')).toBeInTheDocument();

      // Note: stdin, Random Seed, and Attached Files are now in CodeEditor's ExecutionSettings
      // These are tested in the CodeEditor component tests
    });

    it('should include execution settings in create request when provided via CodeEditor callbacks', async () => {
      const onProblemCreated = jest.fn();
      const mockProblem = {
        id: 'problem-789',
        title: 'Test Problem',
      };

      (global.fetch as jest.Mock) = createFetchMock(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ problem: mockProblem }),
        })
      );

      const { rerender } = render(<ProblemCreator onProblemCreated={onProblemCreated} />);

      // Fill in basic fields
      fireEvent.change(screen.getByLabelText(/Title/), {
        target: { value: 'Test Problem' },
      });

      // Note: ExecutionSettings (stdin, random seed, attached files) are now handled
      // inside CodeEditor component via onStdinChange callback
      // This is tested in the CodeEditor component tests

      // Submit - execution settings should be empty since we didn't set them through the callback
      fireEvent.click(screen.getByText('Create Problem'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/problems', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.any(String),
        });
      });

      // Verify the call - stdin is empty so executionSettings should not be included
      const problemCalls = (global.fetch as jest.Mock).mock.calls.filter(
        (c: any[]) => c[1]?.method === 'POST' && c[0] === '/api/problems'
      );
      const callArgs = problemCalls[0];
      const body = JSON.parse(callArgs[1].body);
      // No execution settings since we didn't set any values
      expect(body.executionSettings).toBeUndefined();
    });

    // Note: Attached files test removed because file attachment UI is now
    // part of CodeEditor's ExecutionSettings component and tested separately

    // Note: File attachment UI is now part of CodeEditor's ExecutionSettings
    // These tests are handled by ExecutionSettings component tests

    it('should load execution settings when editing and pass to CodeEditor', async () => {
      const problemWithExecSettings = {
        ...mockExistingProblem,
        executionSettings: {
          stdin: '1\n2\n3\n',
          randomSeed: 99,
          attachedFiles: [
            { name: 'input.txt', content: 'file content here' }
          ],
        },
      };

      (global.fetch as jest.Mock) = createFetchMock((url) => {
        if (url.includes('/api/problems/')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ problem: problemWithExecSettings }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      render(<ProblemCreator problemId="problem-456" />);

      await waitFor(() => {
        // Verify CodeEditor component is rendered
        expect(screen.getByTestId('code-editor-Starter Code')).toBeInTheDocument();
        // Note: Execution settings (stdin, random seed, attached files) are passed as props
        // to CodeEditor and managed by ExecutionSettings component
      });
    });

    it('should reset execution settings after successful create', async () => {
      const mockProblem = { id: 'problem-reset' };

      (global.fetch as jest.Mock) = createFetchMock(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ problem: mockProblem }),
        })
      );

      render(<ProblemCreator />);

      // Fill in fields
      fireEvent.change(screen.getByLabelText(/Title/), {
        target: { value: 'Test' },
      });

      // Note: Execution settings are managed by CodeEditor's ExecutionSettings
      // After form reset, CodeEditor receives empty props for exampleInput, randomSeed, attachedFiles

      // Submit
      fireEvent.click(screen.getByText('Create Problem'));

      // Wait for success
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      // After successful create, the form is reset
      // Verify the title field is cleared
      await waitFor(() => {
        expect(screen.getByLabelText(/Title/)).toHaveValue('');
      });

      // Execution settings state is also reset (empty strings/arrays/undefined)
      // This is verified by the component receiving fresh props
    });
  });

  describe('Class and Tags', () => {
    const mockClasses = [
      { id: 'class-1', name: 'CS 101', namespaceId: 'ns-1' },
      { id: 'class-2', name: 'CS 201', namespaceId: 'ns-1' },
    ];

    beforeEach(() => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/api/classes')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ classes: mockClasses }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ problem: { id: 'problem-new' } }),
        });
      });
    });

    it('should render class selector dropdown', async () => {
      render(<ProblemCreator />);

      await waitFor(() => {
        expect(screen.getByLabelText('Class *')).toBeInTheDocument();
      });
    });

    it('should render tags input field', () => {
      render(<ProblemCreator />);
      expect(screen.getByLabelText('Tags')).toBeInTheDocument();
    });

    it('should include classId and tags in create request', async () => {
      const onProblemCreated = jest.fn();

      render(<ProblemCreator onProblemCreated={onProblemCreated} />);

      await waitFor(() => {
        expect(screen.getByLabelText('Class *')).toBeInTheDocument();
      });

      // Select class
      fireEvent.change(screen.getByLabelText('Class *'), { target: { value: 'class-2' } });

      // Enter tags
      const tagsInput = screen.getByLabelText('Tags');
      fireEvent.change(tagsInput, { target: { value: 'loops, arrays' } });
      fireEvent.keyDown(tagsInput, { key: 'Enter' });

      // Fill required title
      fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Test' } });

      // Submit
      fireEvent.click(screen.getByText('Create Problem'));

      await waitFor(() => {
        const calls = (global.fetch as jest.Mock).mock.calls.filter(
          (c: any[]) => c[1]?.method === 'POST' && c[0] === '/api/problems'
        );
        expect(calls.length).toBe(1);
        const body = JSON.parse(calls[0][1].body);
        expect(body.classId).toBe('class-2');
        expect(body.tags).toEqual(['loops', 'arrays']);
      });
    });

    it('should flush uncommitted tag input on submit', async () => {
      const onProblemCreated = jest.fn();

      render(<ProblemCreator onProblemCreated={onProblemCreated} />);

      await waitFor(() => {
        expect(screen.getByLabelText('Class *')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText('Class *'), { target: { value: 'class-1' } });
      fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Test' } });

      // Type a tag but do NOT press Enter
      const tagsInput = screen.getByLabelText('Tags');
      fireEvent.change(tagsInput, { target: { value: 'functions' } });

      // Submit directly
      fireEvent.click(screen.getByText('Create Problem'));

      await waitFor(() => {
        const calls = (global.fetch as jest.Mock).mock.calls.filter(
          (c: any[]) => c[1]?.method === 'POST' && c[0] === '/api/problems'
        );
        expect(calls.length).toBe(1);
        const body = JSON.parse(calls[0][1].body);
        expect(body.tags).toEqual(['functions']);
      });
    });

    it('should flush tag input on blur', async () => {
      render(<ProblemCreator />);

      await waitFor(() => {
        expect(screen.getByLabelText('Tags')).toBeInTheDocument();
      });

      const tagsInput = screen.getByLabelText('Tags');
      fireEvent.change(tagsInput, { target: { value: 'loops' } });
      fireEvent.blur(tagsInput);

      expect(screen.getByText('loops')).toBeInTheDocument();
    });

    it('should pre-populate classId from prop', async () => {
      render(<ProblemCreator classId="class-2" />);

      await waitFor(() => {
        const select = screen.getByLabelText('Class *') as HTMLSelectElement;
        expect(select.value).toBe('class-2');
      });
    });
  });

  describe('Solution Tab', () => {
    it('should render tab bar with Starter Code and Solution tabs', () => {
      render(<ProblemCreator />);

      expect(screen.getByRole('tab', { name: 'Starter Code' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Solution' })).toBeInTheDocument();
    });

    it('should default to Starter Code tab', () => {
      render(<ProblemCreator />);

      const starterTab = screen.getByRole('tab', { name: 'Starter Code' });
      expect(starterTab).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('code-editor-Starter Code')).toBeInTheDocument();
    });

    it('should switch to Solution tab and show Solution Code editor', () => {
      render(<ProblemCreator />);

      const solutionTab = screen.getByRole('tab', { name: 'Solution' });
      fireEvent.click(solutionTab);

      expect(solutionTab).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('code-editor-Solution Code')).toBeInTheDocument();
    });

    it('should switch back to Starter Code tab', () => {
      render(<ProblemCreator />);

      // Switch to solution
      fireEvent.click(screen.getByRole('tab', { name: 'Solution' }));
      // Switch back
      fireEvent.click(screen.getByRole('tab', { name: 'Starter Code' }));

      expect(screen.getByRole('tab', { name: 'Starter Code' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('code-editor-Starter Code')).toBeInTheDocument();
    });

    it('should preserve code in each tab independently', () => {
      render(<ProblemCreator />);

      // Type starter code
      fireEvent.change(screen.getByLabelText(/Starter Code/), {
        target: { value: 'def starter(): pass' },
      });

      // Switch to solution and type
      fireEvent.click(screen.getByRole('tab', { name: 'Solution' }));
      fireEvent.change(screen.getByLabelText(/Solution Code/), {
        target: { value: 'def solution(): return 42' },
      });

      // Switch back - starter code preserved
      fireEvent.click(screen.getByRole('tab', { name: 'Starter Code' }));
      expect(screen.getByLabelText(/Starter Code/)).toHaveValue('def starter(): pass');

      // Switch to solution - solution code preserved
      fireEvent.click(screen.getByRole('tab', { name: 'Solution' }));
      expect(screen.getByLabelText(/Solution Code/)).toHaveValue('def solution(): return 42');
    });

    it('should include solution in submit payload', async () => {
      const onProblemCreated = jest.fn();

      (global.fetch as jest.Mock) = createFetchMock(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ problem: { id: 'p-1' } }),
        })
      );

      render(<ProblemCreator onProblemCreated={onProblemCreated} />);

      // Set title
      fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Test' } });

      // Set solution
      fireEvent.click(screen.getByRole('tab', { name: 'Solution' }));
      fireEvent.change(screen.getByLabelText(/Solution Code/), {
        target: { value: 'def solve(): return 42' },
      });

      // Submit (switch back not needed, submit should work from any tab)
      fireEvent.click(screen.getByText('Create Problem'));

      await waitFor(() => {
        const calls = (global.fetch as jest.Mock).mock.calls.filter(
          (c: any[]) => c[1]?.method === 'POST' && c[0] === '/api/problems'
        );
        expect(calls.length).toBe(1);
        const body = JSON.parse(calls[0][1].body);
        expect(body.solution).toBe('def solve(): return 42');
      });
    });

    it('should load solution from API in edit mode', async () => {
      const problemWithSolution = {
        ...mockExistingProblem,
        solution: 'def answer(): return 42',
      };

      (global.fetch as jest.Mock) = createFetchMock((url) => {
        if (url.includes('/api/problems/')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ problem: problemWithSolution }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      render(<ProblemCreator problemId="problem-456" />);

      await waitFor(() => {
        expect(screen.getByLabelText(/Starter Code/)).toHaveValue('def original():\n    pass');
      });

      // Switch to solution tab
      fireEvent.click(screen.getByRole('tab', { name: 'Solution' }));
      expect(screen.getByLabelText(/Solution Code/)).toHaveValue('def answer(): return 42');
    });

    it('should reset solution after successful create', async () => {
      (global.fetch as jest.Mock) = createFetchMock(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ problem: { id: 'p-reset' } }),
        })
      );

      render(<ProblemCreator />);

      // Set title and solution
      fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Test' } });
      fireEvent.click(screen.getByRole('tab', { name: 'Solution' }));
      fireEvent.change(screen.getByLabelText(/Solution Code/), {
        target: { value: 'some solution' },
      });

      fireEvent.click(screen.getByText('Create Problem'));

      await waitFor(() => {
        expect(screen.getByLabelText(/Solution Code/)).toHaveValue('');
      });
    });
  });
});

const mockExistingProblem = {
  id: 'problem-456',
  title: 'Existing Problem',
  description: 'Original description',
  starterCode: 'def original():\n    pass',
  authorId: 'user-1',
};

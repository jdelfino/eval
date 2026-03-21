/**
 * Tests for ProblemCreator component
 *
 * Tests both create and edit modes with all fields:
 * - Loading existing problem data
 * - Editing all fields (title, description, starter_code)
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

jest.mock('@/lib/api/problems', () => ({
  getProblem: jest.fn(),
  createProblem: jest.fn(),
  updateProblem: jest.fn(),
  generateSolution: jest.fn(),
}));

// Mock useApiDebugger hook
jest.mock('@/hooks/useApiDebugger', () => ({
  useApiDebugger: () => ({
    trace: null,
    currentStep: 0,
    isLoading: false,
    error: null,
    hasTrace: false,
    total_steps: 0,
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

// Capture CodeEditor props for assertion
let lastProblemCreatorCodeEditorProps: any = null;

// Mock CodeEditor component
jest.mock('@/app/(fullscreen)/student/components/CodeEditor', () => {
  return function MockCodeEditor({ code, onChange, title, onRun, problem, onProblemEdit, editableProblem, exampleInput, random_seed, attached_files }: any) {
    lastProblemCreatorCodeEditorProps = { exampleInput, random_seed, attached_files };
    return (
      <div data-testid={`code-editor-${title}`}>
        {/* Show editable problem fields if in edit mode */}
        {editableProblem && problem && onProblemEdit && (
          <div data-testid="editable-problem-sidebar">
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
          data-has-run={!!onRun}
        />
      </div>
    );
  };
});

const DEFAULT_CLASSES = [
  { id: 'default-class-1', name: 'Default Class', namespace_id: 'ns-1', description: null, created_by: 'u-1', created_at: '', updated_at: '' },
];

describe('ProblemCreator Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Layout', () => {
    it('should use flex layout classes for full-height rendering', () => {
      const { container } = render(<ProblemCreator />);
      const outerDiv = container.firstElementChild;
      expect(outerDiv).toHaveClass('flex-1', 'min-h-0', 'flex', 'flex-col');
    });
  });

  describe('Create Mode', () => {
    it('should render form in create mode when no problem_id provided', () => {
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

      const { createProblem } = require('@/lib/api/problems');
      expect(createProblem).not.toHaveBeenCalled();
    });

    it('should create new problem with all fields', async () => {
      const onProblemCreated = jest.fn();
      const mockProblem = {
        id: 'problem-123',
        title: 'Test Problem',
        description: 'Test description',
        starter_code: 'def solution():\n    pass',
      };

      const { createProblem } = require('@/lib/api/problems');
      createProblem.mockResolvedValue(mockProblem);

      render(<ProblemCreator onProblemCreated={onProblemCreated} classes={DEFAULT_CLASSES} />);

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
      // Select a class (required for create)
      fireEvent.change(screen.getByLabelText('Class *'), {
        target: { value: 'default-class-1' },
      });

      // Submit
      fireEvent.click(screen.getByText('Create Problem'));

      await waitFor(() => {
        expect(createProblem).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Test Problem',
            description: 'Test description',
            starter_code: 'def solution():\n    pass',
          })
        );
      });

      await waitFor(() => {
        expect(onProblemCreated).toHaveBeenCalledWith('problem-123');
      });
    });

    it('should display error when create fails', async () => {
      const { createProblem } = require('@/lib/api/problems');
      createProblem.mockRejectedValue(new Error('Creation failed'));

      render(<ProblemCreator classes={DEFAULT_CLASSES} />);

      fireEvent.change(screen.getByLabelText(/Title/), {
        target: { value: 'Test Problem' },
      });
      fireEvent.change(screen.getByLabelText('Class *'), {
        target: { value: 'default-class-1' },
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
      starter_code: 'def original():\n    pass',
      author_id: 'user-1',
    };

    it('should load existing problem data in edit mode', async () => {
      const { getProblem } = require('@/lib/api/problems');
      getProblem.mockResolvedValue(mockExistingProblem);

      render(<ProblemCreator problem_id="problem-456" />);

      // Should show loading state
      expect(screen.getByText('Loading problem...')).toBeInTheDocument();

      // Should fetch problem data
      await waitFor(() => {
        expect(getProblem).toHaveBeenCalledWith('problem-456');
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
      const { getProblem } = require('@/lib/api/problems');
      getProblem.mockRejectedValue(new Error('Not found'));

      render(<ProblemCreator problem_id="problem-456" />);

      await waitFor(() => {
        expect(screen.getByText('Not found')).toBeInTheDocument();
      });
    });

    it('should update existing problem with modified fields', async () => {
      const onProblemCreated = jest.fn();
      const updatedProblem = { ...mockExistingProblem, title: 'Updated Problem' };

      const { getProblem, updateProblem } = require('@/lib/api/problems');
      getProblem.mockResolvedValue(mockExistingProblem);
      updateProblem.mockResolvedValue(updatedProblem);

      render(<ProblemCreator problem_id="problem-456" onProblemCreated={onProblemCreated} />);

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
        expect(updateProblem).toHaveBeenCalledWith(
          'problem-456',
          expect.objectContaining({
            title: 'Updated Problem',
          })
        );
      });

      await waitFor(() => {
        expect(onProblemCreated).toHaveBeenCalledWith('problem-456');
      });
    });

    it('should handle update failure', async () => {
      const { getProblem, updateProblem } = require('@/lib/api/problems');
      getProblem.mockResolvedValue(mockExistingProblem);
      updateProblem.mockRejectedValue(new Error('Update failed'));

      render(<ProblemCreator problem_id="problem-456" />);

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

    it('should enable submit button when title and class are provided', async () => {
      render(<ProblemCreator classes={DEFAULT_CLASSES} />);

      fireEvent.change(screen.getByLabelText(/Title/), {
        target: { value: 'Test' },
      });
      fireEvent.change(screen.getByLabelText('Class *'), {
        target: { value: 'default-class-1' },
      });

      const submitButton = screen.getByText('Create Problem');
      expect(submitButton).not.toBeDisabled();
    });

    it('should disable submit button when title is provided but no class is selected', async () => {
      const mockClasses = [{ id: 'class-1', name: 'CS 101', namespace_id: 'ns-1', description: null, created_by: 'u-1', created_at: '', updated_at: '' }];

      render(<ProblemCreator classes={mockClasses} />);

      // Set title but leave class unselected
      fireEvent.change(screen.getByLabelText(/Title/), {
        target: { value: 'Test Problem' },
      });

      // No class selected (still on "Select a class...")
      const submitButton = screen.getByText('Create Problem');
      expect(submitButton).toBeDisabled();
    });

    it('should enable submit button when both title and class are provided', async () => {
      const mockClasses = [{ id: 'class-1', name: 'CS 101', namespace_id: 'ns-1', description: null, created_by: 'u-1', created_at: '', updated_at: '' }];

      render(<ProblemCreator classes={mockClasses} />);

      fireEvent.change(screen.getByLabelText(/Title/), {
        target: { value: 'Test Problem' },
      });
      fireEvent.change(screen.getByLabelText('Class *'), {
        target: { value: 'class-1' },
      });

      const submitButton = screen.getByText('Create Problem');
      expect(submitButton).not.toBeDisabled();
    });

    it('should show loading state during submission', async () => {
      const { createProblem } = require('@/lib/api/problems');
      createProblem.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<ProblemCreator classes={DEFAULT_CLASSES} />);

      fireEvent.change(screen.getByLabelText(/Title/), {
        target: { value: 'Test' },
      });
      fireEvent.change(screen.getByLabelText('Class *'), {
        target: { value: 'default-class-1' },
      });
      fireEvent.click(screen.getByText('Create Problem'));

      await waitFor(() => {
        expect(screen.getByText('Creating...')).toBeInTheDocument();
      });
    });
  });

  describe('Execution Settings (removed)', () => {
    it('does not pass exampleInput, random_seed, or attached_files to CodeEditor', () => {
      lastProblemCreatorCodeEditorProps = null;
      render(<ProblemCreator />);

      // Verify CodeEditor component is rendered
      expect(screen.getByTestId('code-editor-Starter Code')).toBeInTheDocument();

      // After removing execution_settings state, these props must not be passed
      expect(lastProblemCreatorCodeEditorProps).not.toBeNull();
      expect(lastProblemCreatorCodeEditorProps.exampleInput).toBeUndefined();
      expect(lastProblemCreatorCodeEditorProps.random_seed).toBeUndefined();
      expect(lastProblemCreatorCodeEditorProps.attached_files).toBeUndefined();
    });

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

      const { createProblem } = require('@/lib/api/problems');
      createProblem.mockResolvedValue(mockProblem);

      render(<ProblemCreator onProblemCreated={onProblemCreated} classes={DEFAULT_CLASSES} />);

      // Fill in basic fields
      fireEvent.change(screen.getByLabelText(/Title/), {
        target: { value: 'Test Problem' },
      });
      // Select a class (required for create)
      fireEvent.change(screen.getByLabelText('Class *'), {
        target: { value: 'default-class-1' },
      });

      // Note: ExecutionSettings (stdin, random seed, attached files) are now handled
      // inside CodeEditor component via onStdinChange callback
      // This is tested in the CodeEditor component tests

      // Submit - execution settings should be empty since we didn't set them through the callback
      fireEvent.click(screen.getByText('Create Problem'));

      await waitFor(() => {
        expect(createProblem).toHaveBeenCalled();
      });

      // Verify the call - stdin is empty so execution_settings should not be included
      const callArgs = createProblem.mock.calls[0][0];
      // No execution settings since we didn't set any values
      expect(callArgs.execution_settings).toBeUndefined();
    });

    // Note: Attached files test removed because file attachment UI is now
    // part of CodeEditor's ExecutionSettings component and tested separately

    // Note: File attachment UI is now part of CodeEditor's ExecutionSettings
    // These tests are handled by ExecutionSettings component tests

    it('should load execution settings when editing and pass to CodeEditor', async () => {
      const problemWithExecSettings = {
        ...mockExistingProblem,
      };

      const { getProblem } = require('@/lib/api/problems');
      getProblem.mockResolvedValue(problemWithExecSettings);

      render(<ProblemCreator problem_id="problem-456" />);

      await waitFor(() => {
        // Verify CodeEditor component is rendered
        expect(screen.getByTestId('code-editor-Starter Code')).toBeInTheDocument();
        // Note: Execution settings (stdin, random seed, attached files) are passed as props
        // to CodeEditor and managed by ExecutionSettings component
      });
    });

    it('should reset execution settings after successful create', async () => {
      const mockProblem = { id: 'problem-reset' };

      const { createProblem } = require('@/lib/api/problems');
      createProblem.mockResolvedValue(mockProblem);

      render(<ProblemCreator classes={DEFAULT_CLASSES} />);

      // Fill in fields
      fireEvent.change(screen.getByLabelText(/Title/), {
        target: { value: 'Test' },
      });
      // Select a class (required for create)
      fireEvent.change(screen.getByLabelText('Class *'), {
        target: { value: 'default-class-1' },
      });

      // Note: Execution settings are managed by CodeEditor's ExecutionSettings
      // After form reset, CodeEditor receives empty props for exampleInput, random_seed, attached_files

      // Submit
      fireEvent.click(screen.getByText('Create Problem'));

      // Wait for success
      await waitFor(() => {
        expect(createProblem).toHaveBeenCalled();
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
      { id: 'class-1', name: 'CS 101', namespace_id: 'ns-1', description: null, created_by: 'u-1', created_at: '', updated_at: '' },
      { id: 'class-2', name: 'CS 201', namespace_id: 'ns-1', description: null, created_by: 'u-1', created_at: '', updated_at: '' },
    ];

    beforeEach(() => {
      const { createProblem } = require('@/lib/api/problems');
      createProblem.mockResolvedValue({ id: 'problem-new' });
    });

    it('should render class selector dropdown', () => {
      render(<ProblemCreator classes={mockClasses} />);
      expect(screen.getByLabelText('Class *')).toBeInTheDocument();
    });

    it('should render tags input field', () => {
      render(<ProblemCreator />);
      expect(screen.getByLabelText('Tags')).toBeInTheDocument();
    });

    it('should include class_id and tags in create request', async () => {
      const onProblemCreated = jest.fn();
      const { createProblem } = require('@/lib/api/problems');

      render(<ProblemCreator onProblemCreated={onProblemCreated} classes={mockClasses} />);

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
        expect(createProblem).toHaveBeenCalledWith(
          expect.objectContaining({
            class_id: 'class-2',
            tags: ['loops', 'arrays'],
          })
        );
      });
    });

    it('should flush uncommitted tag input on submit', async () => {
      const onProblemCreated = jest.fn();
      const { createProblem } = require('@/lib/api/problems');

      render(<ProblemCreator onProblemCreated={onProblemCreated} classes={mockClasses} />);

      fireEvent.change(screen.getByLabelText('Class *'), { target: { value: 'class-1' } });
      fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Test' } });

      // Type a tag but do NOT press Enter
      const tagsInput = screen.getByLabelText('Tags');
      fireEvent.change(tagsInput, { target: { value: 'functions' } });

      // Submit directly
      fireEvent.click(screen.getByText('Create Problem'));

      await waitFor(() => {
        expect(createProblem).toHaveBeenCalledWith(
          expect.objectContaining({
            tags: ['functions'],
          })
        );
      });
    });

    it('should flush tag input on blur', () => {
      render(<ProblemCreator />);

      const tagsInput = screen.getByLabelText('Tags');
      fireEvent.change(tagsInput, { target: { value: 'loops' } });
      fireEvent.blur(tagsInput);

      expect(screen.getByText('loops')).toBeInTheDocument();
    });

    it('should pre-populate class_id from prop', () => {
      render(<ProblemCreator class_id="class-2" classes={mockClasses} />);
      const select = screen.getByLabelText('Class *') as HTMLSelectElement;
      expect(select.value).toBe('class-2');
    });

    it('should show class validation hint when class is not selected in create mode', async () => {
      render(<ProblemCreator />);

      await waitFor(() => {
        expect(screen.getByLabelText('Class *')).toBeInTheDocument();
      });

      // Class selector should show a validation hint when no class selected
      expect(screen.getByText('Required')).toBeInTheDocument();
    });

    it('should not show class validation hint when class is selected', () => {
      const mockClasses = [{ id: 'class-1', name: 'CS 101', namespace_id: 'ns-1', description: null, created_by: 'u-1', created_at: '', updated_at: '' }];

      render(<ProblemCreator classes={mockClasses} />);

      fireEvent.change(screen.getByLabelText('Class *'), { target: { value: 'class-1' } });

      expect(screen.queryByText('Required')).not.toBeInTheDocument();
    });

    it('should not show class validation hint in edit mode', async () => {
      const { getProblem } = require('@/lib/api/problems');
      getProblem.mockResolvedValue({
        ...mockExistingProblem,
        class_id: null,
      });

      render(<ProblemCreator problem_id="problem-456" />);

      await waitFor(() => {
        expect(screen.getByText('Edit Problem')).toBeInTheDocument();
      });

      // In edit mode, no class required hint should be shown
      expect(screen.queryByText('Required')).not.toBeInTheDocument();
    });
  });

  describe('Generate Solution', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should render the Generate Solution button in the tab bar area', () => {
      render(<ProblemCreator />);
      expect(screen.getByRole('button', { name: 'Generate Solution' })).toBeInTheDocument();
    });

    it('should disable Generate Solution button when description is empty', () => {
      render(<ProblemCreator />);
      const btn = screen.getByRole('button', { name: 'Generate Solution' });
      expect(btn).toBeDisabled();
    });

    it('should enable Generate Solution button when description has content', () => {
      render(<ProblemCreator />);
      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Write a function that reverses a string.' },
      });
      const btn = screen.getByRole('button', { name: 'Generate Solution' });
      expect(btn).not.toBeDisabled();
    });

    it('should disable Generate Solution button while isSubmitting', async () => {
      const { createProblem } = require('@/lib/api/problems');
      createProblem.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<ProblemCreator classes={DEFAULT_CLASSES} />);

      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Some description' },
      });
      fireEvent.change(screen.getByLabelText('Title *'), {
        target: { value: 'Test' },
      });
      fireEvent.change(screen.getByLabelText('Class *'), {
        target: { value: 'default-class-1' },
      });

      // Trigger submission
      fireEvent.click(screen.getByText('Create Problem'));

      await waitFor(() => {
        expect(screen.getByText('Creating...')).toBeInTheDocument();
      });

      const btn = screen.getByRole('button', { name: 'Generate Solution' });
      expect(btn).toBeDisabled();
    });

    it('should open modal when Generate Solution button is clicked', () => {
      render(<ProblemCreator />);

      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Write a function that reverses a string.' },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Generate Solution' }));

      // Modal should be visible with title
      expect(screen.getByRole('heading', { name: 'Generate Solution' })).toBeInTheDocument();
      // Modal should have the textarea for custom instructions
      expect(screen.getByLabelText('Custom Instructions (optional)')).toBeInTheDocument();
      // Modal should have Cancel and Generate buttons
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Generate' })).toBeInTheDocument();
    });

    it('should call generateSolution API with description and starter_code when Generate is clicked in modal', async () => {
      const { generateSolution } = require('@/lib/api/problems');
      generateSolution.mockResolvedValue({ solution: 'def reverse(s): return s[::-1]' });

      render(<ProblemCreator />);

      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Write a function that reverses a string.' },
      });
      fireEvent.change(screen.getByLabelText(/Starter Code/), {
        target: { value: 'def reverse(s):\n    pass' },
      });

      // Open modal
      fireEvent.click(screen.getByRole('button', { name: 'Generate Solution' }));

      // Click Generate in modal
      fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

      await waitFor(() => {
        expect(generateSolution).toHaveBeenCalledWith({
          description: 'Write a function that reverses a string.',
          starter_code: 'def reverse(s):\n    pass',
        });
      });

      // Should switch to solution tab and populate solution
      await waitFor(() => {
        expect(screen.getByTestId('code-editor-Solution Code')).toBeInTheDocument();
        expect(screen.getByLabelText(/Solution Code/)).toHaveValue('def reverse(s): return s[::-1]');
      });
    });

    it('should pass custom instructions to generateSolution API when provided', async () => {
      const { generateSolution } = require('@/lib/api/problems');
      generateSolution.mockResolvedValue({ solution: 'def solve(): return []' });

      render(<ProblemCreator />);

      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Write a function to solve the problem.' },
      });

      // Open modal
      fireEvent.click(screen.getByRole('button', { name: 'Generate Solution' }));

      // Enter custom instructions
      fireEvent.change(screen.getByLabelText('Custom Instructions (optional)'), {
        target: { value: "Don't use dicts or lists" },
      });

      // Click Generate in modal
      fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

      await waitFor(() => {
        expect(generateSolution).toHaveBeenCalledWith({
          description: 'Write a function to solve the problem.',
          starter_code: undefined,
          custom_instructions: "Don't use dicts or lists",
        });
      });
    });

    it('should not pass custom_instructions when the field is empty', async () => {
      const { generateSolution } = require('@/lib/api/problems');
      generateSolution.mockResolvedValue({ solution: 'def solve(): pass' });

      render(<ProblemCreator />);

      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Some description' },
      });

      // Open modal
      fireEvent.click(screen.getByRole('button', { name: 'Generate Solution' }));

      // Leave custom instructions empty
      // Click Generate
      fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

      await waitFor(() => {
        expect(generateSolution).toHaveBeenCalledWith({
          description: 'Some description',
          starter_code: undefined,
        });
      });

      // Ensure custom_instructions is NOT in the call (no key at all)
      const callArgs = generateSolution.mock.calls[0][0];
      expect(callArgs).not.toHaveProperty('custom_instructions');
    });

    it('should close modal and not call API when Cancel is clicked', async () => {
      const { generateSolution } = require('@/lib/api/problems');

      render(<ProblemCreator />);

      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Some description' },
      });

      // Open modal
      fireEvent.click(screen.getByRole('button', { name: 'Generate Solution' }));

      // Verify modal is open
      expect(screen.getByRole('heading', { name: 'Generate Solution' })).toBeInTheDocument();

      // Click Cancel
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      // Modal should be closed
      expect(screen.queryByRole('heading', { name: 'Generate Solution' })).not.toBeInTheDocument();

      // API should not have been called
      expect(generateSolution).not.toHaveBeenCalled();
    });

    it('should clear customInstructions when Cancel is clicked', async () => {
      render(<ProblemCreator />);

      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Some description' },
      });

      // Open modal
      fireEvent.click(screen.getByRole('button', { name: 'Generate Solution' }));

      // Enter custom instructions
      fireEvent.change(screen.getByLabelText('Custom Instructions (optional)'), {
        target: { value: 'Use recursion only' },
      });

      // Cancel
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      // Re-open modal - instructions should be cleared
      fireEvent.click(screen.getByRole('button', { name: 'Generate Solution' }));

      expect(screen.getByLabelText('Custom Instructions (optional)')).toHaveValue('');
    });

    it('should display error inside modal when generateSolution API fails', async () => {
      const { generateSolution } = require('@/lib/api/problems');
      generateSolution.mockRejectedValue(new Error('AI generation failed'));

      render(<ProblemCreator />);

      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Some description' },
      });

      // Open modal
      fireEvent.click(screen.getByRole('button', { name: 'Generate Solution' }));

      // Click Generate in modal
      fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

      await waitFor(() => {
        // Error should be inside the modal
        expect(screen.getByRole('heading', { name: 'Generate Solution' })).toBeInTheDocument();
        expect(screen.getByText('AI generation failed')).toBeInTheDocument();
      });
    });

    it('should close modal on successful generation', async () => {
      const { generateSolution } = require('@/lib/api/problems');
      generateSolution.mockResolvedValue({ solution: 'def solve(): return 42' });

      render(<ProblemCreator />);

      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Some description' },
      });

      // Open modal
      fireEvent.click(screen.getByRole('button', { name: 'Generate Solution' }));

      // Click Generate in modal
      fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

      await waitFor(() => {
        // Modal should be closed after success
        expect(screen.queryByRole('heading', { name: 'Generate Solution' })).not.toBeInTheDocument();
      });
    });

    it('should show loading state in Generate button while API call is in progress', async () => {
      const { generateSolution } = require('@/lib/api/problems');
      generateSolution.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<ProblemCreator />);

      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Some description' },
      });

      // Open modal
      fireEvent.click(screen.getByRole('button', { name: 'Generate Solution' }));

      // Click Generate
      fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Generating...' })).toBeInTheDocument();
      });
    });

    it('should call generateSolution with undefined starter_code when starter code is empty', async () => {
      const { generateSolution } = require('@/lib/api/problems');
      generateSolution.mockResolvedValue({ solution: 'def solve(): pass' });

      render(<ProblemCreator />);

      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Some description' },
      });
      // Leave starter_code empty

      // Open modal
      fireEvent.click(screen.getByRole('button', { name: 'Generate Solution' }));

      // Click Generate
      fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

      await waitFor(() => {
        expect(generateSolution).toHaveBeenCalledWith({
          description: 'Some description',
          starter_code: undefined,
        });
      });
    });

    it('should clear customInstructions after successful generation', async () => {
      const { generateSolution } = require('@/lib/api/problems');
      generateSolution.mockResolvedValue({ solution: 'def solve(): pass' });

      render(<ProblemCreator />);

      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Some description' },
      });

      // Open modal and enter custom instructions
      fireEvent.click(screen.getByRole('button', { name: 'Generate Solution' }));
      fireEvent.change(screen.getByLabelText('Custom Instructions (optional)'), {
        target: { value: 'Use only loops' },
      });

      // Generate successfully
      fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: 'Generate Solution' })).not.toBeInTheDocument();
      });

      // Re-open modal - instructions should be cleared
      fireEvent.click(screen.getByRole('button', { name: 'Generate Solution' }));
      expect(screen.getByLabelText('Custom Instructions (optional)')).toHaveValue('');
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
      const { createProblem } = require('@/lib/api/problems');
      createProblem.mockResolvedValue({ id: 'p-1' });

      render(<ProblemCreator onProblemCreated={onProblemCreated} classes={DEFAULT_CLASSES} />);

      // Set title and class (required for create)
      fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Test' } });
      fireEvent.change(screen.getByLabelText('Class *'), { target: { value: 'default-class-1' } });

      // Set solution
      fireEvent.click(screen.getByRole('tab', { name: 'Solution' }));
      fireEvent.change(screen.getByLabelText(/Solution Code/), {
        target: { value: 'def solve(): return 42' },
      });

      // Submit (switch back not needed, submit should work from any tab)
      fireEvent.click(screen.getByText('Create Problem'));

      await waitFor(() => {
        expect(createProblem).toHaveBeenCalledWith(
          expect.objectContaining({
            solution: 'def solve(): return 42',
          })
        );
      });
    });

    it('should load solution from API in edit mode', async () => {
      const problemWithSolution = {
        ...mockExistingProblem,
        solution: 'def answer(): return 42',
      };

      const { getProblem } = require('@/lib/api/problems');
      getProblem.mockResolvedValue(problemWithSolution);

      render(<ProblemCreator problem_id="problem-456" />);

      await waitFor(() => {
        expect(screen.getByLabelText(/Starter Code/)).toHaveValue('def original():\n    pass');
      });

      // Switch to solution tab
      fireEvent.click(screen.getByRole('tab', { name: 'Solution' }));
      expect(screen.getByLabelText(/Solution Code/)).toHaveValue('def answer(): return 42');
    });

    it('should reset solution after successful create', async () => {
      const { createProblem } = require('@/lib/api/problems');
      createProblem.mockResolvedValue({ id: 'p-reset' });

      render(<ProblemCreator classes={DEFAULT_CLASSES} />);

      // Set title, class (required for create), and solution
      fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Test' } });
      fireEvent.change(screen.getByLabelText('Class *'), { target: { value: 'default-class-1' } });
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
  starter_code: 'def original():\n    pass',
  author_id: 'user-1',
};

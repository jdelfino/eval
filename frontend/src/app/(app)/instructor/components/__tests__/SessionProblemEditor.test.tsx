/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SessionProblemEditor from '../SessionProblemEditor';

// Mock useDebugger hook
jest.mock('@/hooks/useDebugger', () => ({
  useDebugger: jest.fn(() => ({
    isDebugging: false,
    currentStep: 0,
    totalSteps: 0,
    currentTrace: null,
    startDebugging: jest.fn(),
    stopDebugging: jest.fn(),
    nextStep: jest.fn(),
    previousStep: jest.fn(),
    getCurrentStep: jest.fn(() => null),
  })),
}));

// Mock useResponsiveLayout hook
jest.mock('@/hooks/useResponsiveLayout', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
  })),
}));

// Mock the CodeEditor component
jest.mock('@/app/(fullscreen)/student/components/CodeEditor', () => {
  return function MockCodeEditor({
    code,
    onChange,
    onStdinChange,
    onRandomSeedChange,
    onAttachedFilesChange,
    title,
    problem,
    onProblemEdit,
    editableProblem
  }: any) {
    return (
      <div data-testid="code-editor">
        <div>{title}</div>
        <textarea
          data-testid="code-textarea"
          value={code}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          data-testid="stdin-input"
          placeholder="stdin"
          onChange={(e) => onStdinChange?.(e.target.value)}
        />
        <input
          data-testid="seed-input"
          type="number"
          placeholder="seed"
          onChange={(e) => onRandomSeedChange?.(e.target.value ? Number(e.target.value) : undefined)}
        />
        {editableProblem && (
          <div data-testid="editable-problem-sidebar">
            <input
              data-testid="problem-title-input"
              aria-label="Problem Title"
              placeholder="Problem Title"
              value={problem?.title || ''}
              onChange={(e) => onProblemEdit?.({ title: e.target.value })}
            />
            <textarea
              data-testid="problem-description-textarea"
              aria-label="Problem Description"
              placeholder="Problem Description"
              value={problem?.description || ''}
              onChange={(e) => onProblemEdit?.({ description: e.target.value })}
            />
          </div>
        )}
      </div>
    );
  };
});

describe('SessionProblemEditor', () => {
  const mockOnUpdateProblem = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with empty initial state', () => {
    render(
      <SessionProblemEditor
        onUpdateProblem={mockOnUpdateProblem}
      />
    );

    expect(screen.getByTestId('problem-title-input')).toHaveValue('');
    expect(screen.getByTestId('problem-description-textarea')).toHaveValue('');
    expect(screen.getByTestId('code-editor')).toBeInTheDocument();
    expect(screen.getByText('Update Problem')).toBeInTheDocument();
  });

  it('renders with initial problem data', () => {
    const initialProblem = {
      title: 'Test Problem',
      description: 'Test description',
      starterCode: 'print("hello")',
    };

    render(
      <SessionProblemEditor
        onUpdateProblem={mockOnUpdateProblem}
        initialProblem={initialProblem}
      />
    );

    expect(screen.getByTestId('problem-title-input')).toHaveValue('Test Problem');
    expect(screen.getByTestId('problem-description-textarea')).toHaveValue('Test description');
    expect(screen.getByTestId('code-textarea')).toHaveValue('print("hello")');
  });

  it('renders with initial execution settings', () => {
    const initialExecutionSettings = {
      stdin: 'test input',
      randomSeed: 42,
      attachedFiles: [{ name: 'test.txt', content: 'content' }],
    };

    render(
      <SessionProblemEditor
        onUpdateProblem={mockOnUpdateProblem}
        initialExecutionSettings={initialExecutionSettings}
      />
    );

    // CodeEditor should receive these settings as props
    expect(screen.getByTestId('code-editor')).toBeInTheDocument();
  });

  it('updates title when user types', () => {
    render(
      <SessionProblemEditor
        onUpdateProblem={mockOnUpdateProblem}
      />
    );

    const titleInput = screen.getByTestId('problem-title-input');
    fireEvent.change(titleInput, { target: { value: 'New Title' } });

    expect(titleInput).toHaveValue('New Title');
  });

  it('updates description when user types', () => {
    render(
      <SessionProblemEditor
        onUpdateProblem={mockOnUpdateProblem}
      />
    );

    const descriptionInput = screen.getByTestId('problem-description-textarea');
    fireEvent.change(descriptionInput, { target: { value: 'New description' } });

    expect(descriptionInput).toHaveValue('New description');
  });

  it('updates starter code when user types in editor', () => {
    render(
      <SessionProblemEditor
        onUpdateProblem={mockOnUpdateProblem}
      />
    );

    const codeTextarea = screen.getByTestId('code-textarea');
    fireEvent.change(codeTextarea, { target: { value: 'print("new code")' } });

    expect(codeTextarea).toHaveValue('print("new code")');
  });

  it('calls onUpdateProblem with correct data when Update button is clicked', () => {
    render(
      <SessionProblemEditor
        onUpdateProblem={mockOnUpdateProblem}
      />
    );

    // Fill in the form
    fireEvent.change(screen.getByTestId('problem-title-input'), {
      target: { value: 'My Title' }
    });
    fireEvent.change(screen.getByTestId('problem-description-textarea'), {
      target: { value: 'My description' }
    });
    fireEvent.change(screen.getByTestId('code-textarea'), {
      target: { value: 'print("code")' }
    });

    // Click update
    fireEvent.click(screen.getByText('Update Problem'));

    expect(mockOnUpdateProblem).toHaveBeenCalledWith(
      {
        title: 'My Title',
        description: 'My description',
        starterCode: 'print("code")',
      },
      undefined // No execution settings set
    );
  });

  it('includes execution settings when stdin is provided', () => {
    render(
      <SessionProblemEditor
        onUpdateProblem={mockOnUpdateProblem}
      />
    );

    // Set stdin
    fireEvent.change(screen.getByTestId('stdin-input'), {
      target: { value: 'test input' }
    });

    // Click update
    fireEvent.click(screen.getByText('Update Problem'));

    expect(mockOnUpdateProblem).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        stdin: 'test input',
      })
    );
  });

  it('includes execution settings when random seed is provided', () => {
    render(
      <SessionProblemEditor
        onUpdateProblem={mockOnUpdateProblem}
      />
    );

    // Set random seed
    fireEvent.change(screen.getByTestId('seed-input'), {
      target: { value: '42' }
    });

    // Click update
    fireEvent.click(screen.getByText('Update Problem'));

    expect(mockOnUpdateProblem).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        randomSeed: 42,
      })
    );
  });

  it('trims whitespace from inputs when updating', () => {
    render(
      <SessionProblemEditor
        onUpdateProblem={mockOnUpdateProblem}
      />
    );

    fireEvent.change(screen.getByTestId('problem-title-input'), {
      target: { value: '  Title with spaces  ' }
    });
    fireEvent.change(screen.getByTestId('problem-description-textarea'), {
      target: { value: '  Description with spaces  ' }
    });
    fireEvent.change(screen.getByTestId('code-textarea'), {
      target: { value: '  code with spaces  ' }
    });

    fireEvent.click(screen.getByText('Update Problem'));

    expect(mockOnUpdateProblem).toHaveBeenCalledWith(
      {
        title: 'Title with spaces',
        description: 'Description with spaces',
        starterCode: 'code with spaces',
      },
      undefined
    );
  });

  it('syncs state when initialProblem changes', () => {
    const { rerender } = render(
      <SessionProblemEditor
        onUpdateProblem={mockOnUpdateProblem}
        initialProblem={{
          title: 'Initial',
          description: 'Initial desc',
          starterCode: 'initial code',
        }}
      />
    );

    expect(screen.getByTestId('problem-title-input')).toHaveValue('Initial');

    // Update the initial problem
    rerender(
      <SessionProblemEditor
        onUpdateProblem={mockOnUpdateProblem}
        initialProblem={{
          title: 'Updated',
          description: 'Updated desc',
          starterCode: 'updated code',
        }}
      />
    );

    expect(screen.getByTestId('problem-title-input')).toHaveValue('Updated');
    expect(screen.getByTestId('problem-description-textarea')).toHaveValue('Updated desc');
  });

  it('uses CodeEditor component with correct props', () => {
    const initialProblem = {
      title: 'Test',
      description: 'Test',
      starterCode: 'test code',
    };
    const initialSettings = {
      stdin: 'input',
      randomSeed: 123,
      attachedFiles: [{ name: 'file.txt', content: 'content' }],
    };

    render(
      <SessionProblemEditor
        onUpdateProblem={mockOnUpdateProblem}
        initialProblem={initialProblem}
        initialExecutionSettings={initialSettings}
      />
    );

    const editor = screen.getByTestId('code-editor');
    expect(editor).toBeInTheDocument();
    expect(screen.getByTestId('code-textarea')).toHaveValue('test code');
  });
});

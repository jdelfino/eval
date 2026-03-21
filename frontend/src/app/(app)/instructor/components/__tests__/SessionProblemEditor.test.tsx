/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SessionProblemEditor from '../SessionProblemEditor';
import type { Problem } from '@/types/problem';

/** Build a full Problem with sensible defaults, overriding specific fields. */
function makeProblem(overrides: Partial<Problem> = {}): Problem {
  return {
    id: 'test-id',
    namespace_id: 'test-ns',
    title: '',
    description: null,
    starter_code: null,
    solution: null,
    language: 'python',
    test_cases: null,
    author_id: 'test-author',
    class_id: null,
    tags: [],
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
    ...overrides,
  };
}

// Mock useApiDebugger hook
jest.mock('@/hooks/useApiDebugger', () => ({
  useApiDebugger: jest.fn(() => ({
    isDebugging: false,
    currentStep: 0,
    total_steps: 0,
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
// Simulates Monaco's behavior: without a key prop to force remount, switching from
// non-empty to empty content may not properly update the editor state
jest.mock('@/app/(fullscreen)/student/components/CodeEditor', () => {
  const editorInstances = new Map<string, string>();

  return React.forwardRef(function MockCodeEditor(props: any, ref: any) {
    const {
      code,
      onChange,
      readOnly,
      title,
      problem,
      onProblemEdit,
      editableProblem
    } = props;

    // Use a ref to simulate Monaco's internal state that persists across renders
    const instanceIdRef = React.useRef<string | undefined>(undefined);
    const [displayedCode, setDisplayedCode] = React.useState(code);

    // On mount, create or retrieve instance
    React.useEffect(() => {
      const instanceId = Math.random().toString(36);
      instanceIdRef.current = instanceId;
      editorInstances.set(instanceId, code);
      setDisplayedCode(code);

      return () => {
        if (instanceIdRef.current) {
          editorInstances.delete(instanceIdRef.current);
        }
      };
    }, []); // Empty deps = only runs on mount/unmount (simulating Monaco instance lifecycle)

    // Update displayed code only if instance has been remounted (via key change)
    // Otherwise, simulate Monaco bug: empty string doesn't trigger update
    React.useEffect(() => {
      if (instanceIdRef.current) {
        // Simulate Monaco bug: when code becomes empty, the editor doesn't update unless remounted
        if (code !== '' || !editorInstances.get(instanceIdRef.current)) {
          editorInstances.set(instanceIdRef.current, code);
          setDisplayedCode(code);
        }
      }
    }, [code]);

    return (
      <div data-testid="code-editor" data-readonly={readOnly ? 'true' : 'false'}>
        <div>{title}</div>
        <textarea
          data-testid="code-textarea"
          value={displayedCode}
          readOnly={readOnly}
          onChange={(e) => onChange?.(e.target.value)}
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
  });
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
    const initialProblem = makeProblem({
      title: 'Test Problem',
      description: 'Test description',
      starter_code: 'print("hello")',
    });

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
      expect.objectContaining({
        title: 'My Title',
        description: 'My description',
        starter_code: 'print("code")',
        solution: null,
        language: 'python',
      })
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
      expect.objectContaining({
        test_cases: expect.arrayContaining([
          expect.objectContaining({
            name: 'Default',
            input: 'test input',
          }),
        ]),
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
      expect.objectContaining({
        test_cases: expect.arrayContaining([
          expect.objectContaining({
            random_seed: 42,
          }),
        ]),
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
      expect.objectContaining({
        title: 'Title with spaces',
        description: 'Description with spaces',
        starter_code: 'code with spaces',
        solution: null,
        language: 'python',
      })
    );
  });

  it('syncs state when initialProblem changes', () => {
    const { rerender } = render(
      <SessionProblemEditor
        onUpdateProblem={mockOnUpdateProblem}
        initialProblem={makeProblem({
          title: 'Initial',
          description: 'Initial desc',
          starter_code: 'initial code',
        })}
      />
    );

    expect(screen.getByTestId('problem-title-input')).toHaveValue('Initial');

    // Update the initial problem
    rerender(
      <SessionProblemEditor
        onUpdateProblem={mockOnUpdateProblem}
        initialProblem={makeProblem({
          title: 'Updated',
          description: 'Updated desc',
          starter_code: 'updated code',
        })}
      />
    );

    expect(screen.getByTestId('problem-title-input')).toHaveValue('Updated');
    expect(screen.getByTestId('problem-description-textarea')).toHaveValue('Updated desc');
  });

  it('uses CodeEditor component with correct props', () => {
    const initialProblem = makeProblem({
      title: 'Test',
      description: 'Test',
      starter_code: 'test code',
    });
    const initialSettings = {
      stdin: 'input',
      random_seed: 123,
      attached_files: [{ name: 'file.txt', content: 'content' }],
    };

    render(
      <SessionProblemEditor
        onUpdateProblem={mockOnUpdateProblem}
        initialProblem={initialProblem}
      />
    );

    const editor = screen.getByTestId('code-editor');
    expect(editor).toBeInTheDocument();
    expect(screen.getByTestId('code-textarea')).toHaveValue('test code');
  });

  describe('tab rendering', () => {
    it('renders Starter Code and Solution tabs', () => {
      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
        />
      );

      expect(screen.getByRole('tab', { name: 'Starter Code' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Solution' })).toBeInTheDocument();
    });

    it('defaults to Starter Code tab', () => {
      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
        />
      );

      const starterTab = screen.getByRole('tab', { name: 'Starter Code' });
      expect(starterTab).toHaveAttribute('aria-selected', 'true');
      const solutionTab = screen.getByRole('tab', { name: 'Solution' });
      expect(solutionTab).toHaveAttribute('aria-selected', 'false');
    });

    it('switches to Solution tab when clicked', () => {
      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
        />
      );

      const solutionTab = screen.getByRole('tab', { name: 'Solution' });
      fireEvent.click(solutionTab);

      expect(solutionTab).toHaveAttribute('aria-selected', 'true');
      const starterTab = screen.getByRole('tab', { name: 'Starter Code' });
      expect(starterTab).toHaveAttribute('aria-selected', 'false');
    });

    it('shows starter code in editor on Starter Code tab', () => {
      const initialProblem = makeProblem({
        title: 'Test',
        description: 'Test',
        starter_code: 'starter code here',
        solution: 'solution code here',
      });

      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          initialProblem={initialProblem}
        />
      );

      // Default tab is Starter Code, should show starter_code
      expect(screen.getByTestId('code-textarea')).toHaveValue('starter code here');
    });

    it('solution tab is read-only', () => {
      const initialProblem = makeProblem({
        title: 'Test',
        description: 'Test',
        starter_code: 'starter code here',
        solution: 'solution code here',
      });

      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          initialProblem={initialProblem}
        />
      );

      // Starter Code tab should not be read-only
      expect(screen.getByTestId('code-editor')).toHaveAttribute('data-readonly', 'false');

      // Switch to Solution tab — should be read-only
      fireEvent.click(screen.getByRole('tab', { name: 'Solution' }));
      expect(screen.getByTestId('code-editor')).toHaveAttribute('data-readonly', 'true');
    });

    it('shows solution code in editor on Solution tab', () => {
      const initialProblem = makeProblem({
        title: 'Test',
        description: 'Test',
        starter_code: 'starter code here',
        solution: 'solution code here',
      });

      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          initialProblem={initialProblem}
        />
      );

      // Switch to Solution tab
      fireEvent.click(screen.getByRole('tab', { name: 'Solution' }));
      expect(screen.getByTestId('code-textarea')).toHaveValue('solution code here');
    });

    it('switches from solution to empty starter code correctly', () => {
      // Regression test for PLAT-m8d: Solution stays visible when switching to empty Starter Code tab
      // This verifies that the CodeEditor properly updates when switching from a populated Solution
      // tab to an empty Starter Code tab. Without a key prop forcing remount, Monaco may retain
      // the previous buffer instead of showing empty content.
      const initialProblem = makeProblem({
        title: 'Test',
        description: 'Test',
        starter_code: '',
        solution: 'solution code here',
      });

      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          initialProblem={initialProblem}
        />
      );

      // Start on Starter Code tab (default) - should be empty
      expect(screen.getByTestId('code-textarea')).toHaveValue('');

      // Switch to Solution tab - should show solution
      fireEvent.click(screen.getByRole('tab', { name: 'Solution' }));
      expect(screen.getByTestId('code-textarea')).toHaveValue('solution code here');

      // Switch back to Starter Code tab - should be empty again
      fireEvent.click(screen.getByRole('tab', { name: 'Starter Code' }));
      expect(screen.getByTestId('code-textarea')).toHaveValue('');
    });
  });

  describe('solution state', () => {
    it('initializes solution from initialProblem.solution', () => {
      const initialProblem = makeProblem({
        title: 'Test',
        description: 'Test',
        starter_code: 'starter',
        solution: 'the solution code',
      });

      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          initialProblem={initialProblem}
        />
      );

      // Switch to Solution tab to see solution
      fireEvent.click(screen.getByRole('tab', { name: 'Solution' }));
      expect(screen.getByTestId('code-textarea')).toHaveValue('the solution code');
    });

    it('syncs solution when initialProblem changes', () => {
      const { rerender } = render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          initialProblem={makeProblem({
            title: 'Initial',
            description: 'Initial desc',
            starter_code: 'initial code',
            solution: 'initial solution',
          })}
        />
      );

      rerender(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          initialProblem={makeProblem({
            title: 'Updated',
            description: 'Updated desc',
            starter_code: 'updated code',
            solution: 'updated solution',
          })}
        />
      );

      // Switch to Solution tab to check updated solution
      fireEvent.click(screen.getByRole('tab', { name: 'Solution' }));
      expect(screen.getByTestId('code-textarea')).toHaveValue('updated solution');
    });
  });

  describe('View Solution button', () => {
    it('does not show View Solution button when no solution exists', () => {
      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          initialProblem={makeProblem({ title: 'T', description: 'D', starter_code: '' })}
        />
      );

      expect(screen.queryByTestId('view-solution-button')).not.toBeInTheDocument();
    });

    it('shows View Solution button when solution exists', () => {
      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          initialProblem={makeProblem({ title: 'T', description: 'D', starter_code: '', solution: 'solution code' })}
        />
      );

      expect(screen.getByTestId('view-solution-button')).toBeInTheDocument();
    });

    it('opens solution viewer modal when View Solution is clicked', () => {
      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          initialProblem={makeProblem({ title: 'T', description: 'D', starter_code: '', solution: 'my solution' })}
        />
      );

      fireEvent.click(screen.getByTestId('view-solution-button'));

      expect(screen.getByTestId('solution-viewer-modal')).toBeInTheDocument();
    });

    it('closes solution viewer modal when Close button is clicked', () => {
      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          initialProblem={makeProblem({ title: 'T', description: 'D', starter_code: '', solution: 'my solution' })}
        />
      );

      fireEvent.click(screen.getByTestId('view-solution-button'));
      expect(screen.getByTestId('solution-viewer-modal')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Close'));
      expect(screen.queryByTestId('solution-viewer-modal')).not.toBeInTheDocument();
    });

    it('closes solution viewer modal on Escape key', () => {
      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          initialProblem={makeProblem({ title: 'T', description: 'D', starter_code: '', solution: 'my solution' })}
        />
      );

      fireEvent.click(screen.getByTestId('view-solution-button'));
      expect(screen.getByTestId('solution-viewer-modal')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByTestId('solution-viewer-modal')).not.toBeInTheDocument();
    });

    it('solution viewer modal has proper accessibility attributes', () => {
      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          initialProblem={makeProblem({ title: 'T', description: 'D', starter_code: '', solution: 'my solution' })}
        />
      );

      fireEvent.click(screen.getByTestId('view-solution-button'));

      const modal = screen.getByTestId('solution-viewer-modal');
      expect(modal).toHaveAttribute('role', 'dialog');
      expect(modal).toHaveAttribute('aria-modal', 'true');
      expect(modal).toHaveAttribute('aria-labelledby', 'solution-viewer-title');
      expect(document.getElementById('solution-viewer-title')).toHaveTextContent('Solution');
    });

    it('closes solution viewer modal when clicking backdrop', () => {
      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          initialProblem={makeProblem({ title: 'T', description: 'D', starter_code: '', solution: 'my solution' })}
        />
      );

      fireEvent.click(screen.getByTestId('view-solution-button'));
      expect(screen.getByTestId('solution-viewer-modal')).toBeInTheDocument();

      // Click the backdrop (first child of the modal container)
      const backdrop = screen.getByTestId('solution-viewer-modal').querySelector('[aria-hidden="true"]')!;
      fireEvent.click(backdrop);
      expect(screen.queryByTestId('solution-viewer-modal')).not.toBeInTheDocument();
    });
  });

  describe('Feature Solution button', () => {
    it('does not show Feature Solution button when no solution exists', () => {
      const mockOnFeatureSolution = jest.fn();
      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          onFeatureSolution={mockOnFeatureSolution}
          initialProblem={makeProblem({ title: 'T', description: 'D', starter_code: '' })}
        />
      );

      expect(screen.queryByTestId('feature-solution-button')).not.toBeInTheDocument();
    });

    it('does not show Feature Solution button when callback not provided', () => {
      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          initialProblem={makeProblem({ title: 'T', description: 'D', starter_code: '', solution: 'sol' })}
        />
      );

      expect(screen.queryByTestId('feature-solution-button')).not.toBeInTheDocument();
    });

    it('shows Feature Solution button when solution exists and callback provided', () => {
      const mockOnFeatureSolution = jest.fn();
      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          onFeatureSolution={mockOnFeatureSolution}
          initialProblem={makeProblem({ title: 'T', description: 'D', starter_code: '', solution: 'sol' })}
        />
      );

      expect(screen.getByTestId('feature-solution-button')).toBeInTheDocument();
    });

    it('calls onFeatureSolution when Feature Solution button is clicked', () => {
      const mockOnFeatureSolution = jest.fn();
      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          onFeatureSolution={mockOnFeatureSolution}
          initialProblem={makeProblem({ title: 'T', description: 'D', starter_code: '', solution: 'sol' })}
        />
      );

      fireEvent.click(screen.getByTestId('feature-solution-button'));
      expect(mockOnFeatureSolution).toHaveBeenCalledTimes(1);
    });
  });
});

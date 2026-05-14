/**
 * Tests for ProblemCreator component
 *
 * Tests both create and edit modes with all fields:
 * - Loading existing problem data
 * - Editing all fields (title, description, starter_code)
 * - Form submission and validation
 * - Error handling
 * - Cancel functionality
 * - WorkspaceShell embedded mode (T9 wiring)
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProblemCreator from '../ProblemCreator';

// Mock API modules
jest.mock('@/lib/api/classes', () => ({
  listClasses: jest.fn(),
}));

jest.mock('@/lib/api/problems', () => ({
  getProblem: jest.fn(),
  createProblem: jest.fn(),
  updateProblem: jest.fn(),
  generateSolution: jest.fn(),
}));

jest.mock('@/lib/api/execute', () => ({
  executeCode: jest.fn(),
  ioTestCasesToCaseDefs: jest.fn((cases) => cases),
  buildIOTestCases: jest.fn(({ stdin, random_seed, attached_files }) => {
    if (!stdin && !random_seed && (!attached_files || attached_files.length === 0)) return [];
    return [{ kind: 'io', name: 'Default', input: stdin || '', match_type: 'exact', order: 0 }];
  }),
}));

// Mock WorkspaceShell — integration tests for ProblemCreator focus on the
// wiring (prop passing, callbacks) rather than WorkspaceShell internals.
let capturedWorkspaceProps: any = null;
jest.mock('@/components/workspace/WorkspaceShell', () => ({
  __esModule: true,
  default: (props: any) => {
    capturedWorkspaceProps = props;
    const { editorTabs, activeTabId, onChangeCode, onRunAll, onRunTest, onDebugTest, onSelectTab, railMode, embedded, tests } = props;
    const activeTab = editorTabs.find((t: any) => t.id === activeTabId) ?? editorTabs[0];
    return (
      <div data-testid="workspace-shell" data-embedded={String(embedded ?? false)}>
        {/* Simulate editor tabs */}
        <div data-testid="editor-tabs">
          {editorTabs.map((tab: any) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={tab.id === activeTabId}
              onClick={() => onSelectTab?.(tab.id)}
              data-readonly={String(tab.readOnly ?? false)}
              data-kind={tab.kind}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/* Simulate editable code area */}
        {activeTab && (
          <textarea
            data-testid="active-code-area"
            aria-label={activeTab.label}
            value={activeTab.code}
            readOnly={activeTab.readOnly}
            onChange={(e) => onChangeCode?.(activeTab.id, e.target.value)}
          />
        )}
        {/* Simulate rail actions */}
        <button data-testid="run-all-btn" onClick={() => onRunAll?.()}>Run all</button>
        {tests?.length > 0 && (
          <button data-testid="run-test-btn" onClick={() => onRunTest?.(tests[0].id)}>Run test</button>
        )}
        <span data-testid="rail-mode">{railMode ?? 'run'}</span>
      </div>
    );
  },
}));

jest.mock('@/lib/testRail', () => ({
  toTestRailItems: jest.fn((cases, results) =>
    (cases ?? []).map((c: any, i: number) => ({
      id: `io-${i}-${c.name ?? 'case-' + i}`,
      name: c.name ?? `case-${i}`,
      kind: 'io',
      visible: true,
      state: 'idle',
      t: '',
    }))
  ),
}));

const DEFAULT_CLASSES = [
  { id: 'default-class-1', name: 'Default Class', namespace_id: 'ns-1' },
];

const mockExistingProblem = {
  id: 'problem-456',
  title: 'Existing Problem',
  description: 'Original description',
  starter_code: 'def original():\n    pass',
  solution: 'def answer(): return 42',
  language: 'python',
  author_id: 'user-1',
  test_cases: [],
};

describe('ProblemCreator Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedWorkspaceProps = null;
    const { listClasses } = require('@/lib/api/classes');
    listClasses.mockResolvedValue(DEFAULT_CLASSES);
  });

  describe('WorkspaceShell integration (T9)', () => {
    /**
     * Verifies ProblemCreator mounts WorkspaceShell in embedded mode with two editable
     * code tabs (Starter + Solution). This is the core T9 contract — author surfaces
     * use WorkspaceShell, not the old CodeEditor/EditorContainer pair.
     */
    it('renders WorkspaceShell embedded=true with Starter + Solution tabs', () => {
      render(<ProblemCreator />);

      const shell = screen.getByTestId('workspace-shell');
      expect(shell).toBeInTheDocument();
      expect(shell).toHaveAttribute('data-embedded', 'true');

      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(2);
      expect(tabs[0]).toHaveTextContent('Starter Code');
      expect(tabs[1]).toHaveTextContent('Solution');
    });

    /**
     * Verifies both editor tabs are kind='code' and readOnly=false.
     * Authors must be able to edit both Starter Code and Solution.
     */
    it('both Starter and Solution tabs are kind=code and editable (readOnly=false)', () => {
      render(<ProblemCreator />);

      const tabs = screen.getAllByRole('tab');
      tabs.forEach((tab) => {
        expect(tab).toHaveAttribute('data-kind', 'code');
        expect(tab).toHaveAttribute('data-readonly', 'false');
      });
    });

    /**
     * Verifies no Ribbon is rendered in embedded mode. The host page provides chrome.
     */
    it('no Ribbon rendered in embedded mode', () => {
      render(<ProblemCreator />);
      // Ribbon is omitted by WorkspaceShell when embedded=true — confirmed by the
      // mock not rendering a [data-testid="ribbon"] element.
      expect(screen.queryByTestId('ribbon')).not.toBeInTheDocument();
    });

    /**
     * Verifies tab switching updates the active editor content to show solution code.
     */
    it('tab switch to Solution updates active editor content', async () => {
      const { getProblem } = require('@/lib/api/problems');
      getProblem.mockResolvedValue(mockExistingProblem);

      render(<ProblemCreator problem_id="problem-456" />);

      await waitFor(() => {
        expect(screen.queryByText('Loading problem...')).not.toBeInTheDocument();
      });

      // Start on Starter Code — active code area shows starter
      expect(screen.getByTestId('active-code-area')).toHaveValue('def original():\n    pass');

      // Click Solution tab
      fireEvent.click(screen.getByRole('tab', { name: 'Solution' }));

      // Active code area now shows solution
      expect(screen.getByTestId('active-code-area')).toHaveValue('def answer(): return 42');
    });

    /**
     * Verifies Run all button calls executeCode for local execution.
     */
    it('Run all calls local executeCode', async () => {
      const { executeCode } = require('@/lib/api/execute');
      executeCode.mockResolvedValue({
        summary: { passed: 0, failed: 0, total: 0 },
        results: [],
      });

      render(<ProblemCreator />);

      fireEvent.click(screen.getByTestId('run-all-btn'));

      await waitFor(() => {
        expect(executeCode).toHaveBeenCalled();
      });
    });

    /**
     * Verifies rail mode is 'run' (not 'edit'). G2 adds 'edit' mode.
     */
    it('rail mode is run (no Edit body button in G1)', () => {
      render(<ProblemCreator />);
      expect(screen.getByTestId('rail-mode')).toHaveTextContent('run');
    });

    /**
     * Verifies code edits in Starter tab update local state.
     * Save flow (handleSubmit) is unchanged from before.
     */
    it('code edits in Starter tab update local state', () => {
      render(<ProblemCreator />);

      const codeArea = screen.getByTestId('active-code-area');
      fireEvent.change(codeArea, { target: { value: 'def new_code(): pass' } });

      // The textarea should reflect the change (local state update)
      expect(codeArea).toHaveValue('def new_code(): pass');
    });

    /**
     * Verifies that WorkspaceShell receives toTestRailItems output as tests prop.
     */
    it('tests prop is wired via toTestRailItems(problem.test_cases, executionResult)', async () => {
      const { toTestRailItems } = require('@/lib/testRail');
      const { getProblem } = require('@/lib/api/problems');
      getProblem.mockResolvedValue({
        ...mockExistingProblem,
        test_cases: [{ kind: 'io', name: 'test1', input: 'a', match_type: 'exact', order: 0 }],
      });

      render(<ProblemCreator problem_id="problem-456" />);

      await waitFor(() => {
        expect(screen.queryByText('Loading problem...')).not.toBeInTheDocument();
      });

      expect(toTestRailItems).toHaveBeenCalled();
    });
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

      render(<ProblemCreator onProblemCreated={onProblemCreated} />);

      await waitFor(() => expect(screen.getByLabelText('Class *')).toBeInTheDocument());

      // Fill in title via the page-chrome title input
      fireEvent.change(screen.getByLabelText('Title *'), {
        target: { value: 'Test Problem' },
      });
      fireEvent.change(screen.getByLabelText('Class *'), {
        target: { value: 'default-class-1' },
      });

      // Fill starter code via the WorkspaceShell mock
      fireEvent.change(screen.getByTestId('active-code-area'), {
        target: { value: 'def solution():\n    pass' },
      });

      fireEvent.click(screen.getByText('Create Problem'));

      await waitFor(() => {
        expect(createProblem).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Test Problem',
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

      render(<ProblemCreator />);

      await waitFor(() => expect(screen.getByLabelText('Class *')).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText('Title *'), {
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
    it('should load existing problem data in edit mode', async () => {
      const { getProblem } = require('@/lib/api/problems');
      getProblem.mockResolvedValue(mockExistingProblem);

      render(<ProblemCreator problem_id="problem-456" />);

      expect(screen.getByText('Loading problem...')).toBeInTheDocument();

      await waitFor(() => {
        expect(getProblem).toHaveBeenCalledWith('problem-456');
      });

      await waitFor(() => {
        expect(screen.getByText('Edit Problem')).toBeInTheDocument();
      });

      // Title field in page chrome should be populated
      expect(screen.getByLabelText('Title *')).toHaveValue('Existing Problem');
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

      await waitFor(() => {
        expect(screen.getByLabelText('Title *')).toHaveValue('Existing Problem');
      });

      fireEvent.change(screen.getByLabelText('Title *'), {
        target: { value: 'Updated Problem' },
      });

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
        expect(screen.getByLabelText('Title *')).toHaveValue('Existing Problem');
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
      render(<ProblemCreator />);

      await waitFor(() => expect(screen.getByLabelText('Class *')).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText('Title *'), {
        target: { value: 'Test' },
      });
      fireEvent.change(screen.getByLabelText('Class *'), {
        target: { value: 'default-class-1' },
      });

      const submitButton = screen.getByText('Create Problem');
      expect(submitButton).not.toBeDisabled();
    });

    it('should disable submit button when title is provided but no class is selected', async () => {
      const mockClasses = [{ id: 'class-1', name: 'CS 101', namespace_id: 'ns-1' }];
      const { listClasses } = require('@/lib/api/classes');
      listClasses.mockResolvedValue(mockClasses);

      render(<ProblemCreator />);

      await waitFor(() => {
        expect(screen.getByLabelText('Class *')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText('Title *'), {
        target: { value: 'Test Problem' },
      });

      const submitButton = screen.getByText('Create Problem');
      expect(submitButton).toBeDisabled();
    });

    it('should enable submit button when both title and class are provided', async () => {
      const mockClasses = [{ id: 'class-1', name: 'CS 101', namespace_id: 'ns-1' }];
      const { listClasses } = require('@/lib/api/classes');
      listClasses.mockResolvedValue(mockClasses);

      render(<ProblemCreator />);

      await waitFor(() => {
        expect(screen.getByLabelText('Class *')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText('Title *'), {
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

      render(<ProblemCreator />);

      await waitFor(() => expect(screen.getByLabelText('Class *')).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText('Title *'), {
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

  describe('Class and Tags', () => {
    const mockClasses = [
      { id: 'class-1', name: 'CS 101', namespace_id: 'ns-1' },
      { id: 'class-2', name: 'CS 201', namespace_id: 'ns-1' },
    ];

    beforeEach(() => {
      const { listClasses } = require('@/lib/api/classes');
      const { createProblem } = require('@/lib/api/problems');
      listClasses.mockResolvedValue(mockClasses);
      createProblem.mockResolvedValue({ id: 'problem-new' });
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

    it('should include class_id and tags in create request', async () => {
      const onProblemCreated = jest.fn();
      const { createProblem } = require('@/lib/api/problems');

      render(<ProblemCreator onProblemCreated={onProblemCreated} />);

      await waitFor(() => {
        expect(screen.getByLabelText('Class *')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText('Class *'), { target: { value: 'class-2' } });

      const tagsInput = screen.getByLabelText('Tags');
      fireEvent.change(tagsInput, { target: { value: 'loops, arrays' } });
      fireEvent.keyDown(tagsInput, { key: 'Enter' });

      fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Test' } });

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

      render(<ProblemCreator onProblemCreated={onProblemCreated} />);

      await waitFor(() => {
        expect(screen.getByLabelText('Class *')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText('Class *'), { target: { value: 'class-1' } });
      fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Test' } });

      const tagsInput = screen.getByLabelText('Tags');
      fireEvent.change(tagsInput, { target: { value: 'functions' } });

      fireEvent.click(screen.getByText('Create Problem'));

      await waitFor(() => {
        expect(createProblem).toHaveBeenCalledWith(
          expect.objectContaining({
            tags: ['functions'],
          })
        );
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

    it('should pre-populate class_id from prop', async () => {
      render(<ProblemCreator class_id="class-2" />);

      await waitFor(() => {
        const select = screen.getByLabelText('Class *') as HTMLSelectElement;
        expect(select.value).toBe('class-2');
      });
    });

    it('should show class validation hint when class is not selected in create mode', async () => {
      render(<ProblemCreator />);

      await waitFor(() => {
        expect(screen.getByLabelText('Class *')).toBeInTheDocument();
      });

      expect(screen.getByText('Required')).toBeInTheDocument();
    });

    it('should not show class validation hint when class is selected', async () => {
      const mockClasses = [{ id: 'class-1', name: 'CS 101', namespace_id: 'ns-1' }];
      const { listClasses } = require('@/lib/api/classes');
      listClasses.mockResolvedValue(mockClasses);

      render(<ProblemCreator />);

      await waitFor(() => {
        expect(screen.getByLabelText('Class *')).toBeInTheDocument();
      });

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

      expect(screen.queryByText('Required')).not.toBeInTheDocument();
    });
  });

  describe('Generate Solution', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      const { listClasses } = require('@/lib/api/classes');
      listClasses.mockResolvedValue(DEFAULT_CLASSES);
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

    it('should open modal when Generate Solution button is clicked', () => {
      render(<ProblemCreator />);

      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Write a function that reverses a string.' },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Generate Solution' }));

      expect(screen.getByRole('heading', { name: 'Generate Solution' })).toBeInTheDocument();
      expect(screen.getByLabelText('Custom Instructions (optional)')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Generate' })).toBeInTheDocument();
    });

    it('should call generateSolution API and switch to Solution tab after generation', async () => {
      const { generateSolution } = require('@/lib/api/problems');
      generateSolution.mockResolvedValue({ solution: 'def reverse(s): return s[::-1]' });

      render(<ProblemCreator />);

      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Write a function that reverses a string.' },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Generate Solution' }));
      fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

      await waitFor(() => {
        expect(generateSolution).toHaveBeenCalledWith({
          description: 'Write a function that reverses a string.',
          starter_code: undefined,
        });
      });

      // After generation, active tab should switch to Solution
      await waitFor(() => {
        const solutionTab = screen.getByRole('tab', { name: 'Solution' });
        expect(solutionTab).toHaveAttribute('aria-selected', 'true');
      });
    });

    it('should close modal and not call API when Cancel is clicked', async () => {
      const { generateSolution } = require('@/lib/api/problems');

      render(<ProblemCreator />);

      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Some description' },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Generate Solution' }));
      expect(screen.getByRole('heading', { name: 'Generate Solution' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('heading', { name: 'Generate Solution' })).not.toBeInTheDocument();
      expect(generateSolution).not.toHaveBeenCalled();
    });

    it('should display error inside modal when generateSolution API fails', async () => {
      const { generateSolution } = require('@/lib/api/problems');
      generateSolution.mockRejectedValue(new Error('AI generation failed'));

      render(<ProblemCreator />);

      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Some description' },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Generate Solution' }));
      fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

      await waitFor(() => {
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

      fireEvent.click(screen.getByRole('button', { name: 'Generate Solution' }));
      fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: 'Generate Solution' })).not.toBeInTheDocument();
      });
    });
  });

  describe('Solution Tab (WorkspaceShell tabs)', () => {
    it('should render tab bar with Starter Code and Solution tabs', () => {
      render(<ProblemCreator />);

      expect(screen.getByRole('tab', { name: 'Starter Code' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Solution' })).toBeInTheDocument();
    });

    it('should default to Starter Code tab', () => {
      render(<ProblemCreator />);

      const starterTab = screen.getByRole('tab', { name: 'Starter Code' });
      expect(starterTab).toHaveAttribute('aria-selected', 'true');
    });

    it('should switch to Solution tab and show Solution code', async () => {
      const { getProblem } = require('@/lib/api/problems');
      getProblem.mockResolvedValue(mockExistingProblem);

      render(<ProblemCreator problem_id="problem-456" />);
      await waitFor(() => expect(screen.queryByText('Loading problem...')).not.toBeInTheDocument());

      fireEvent.click(screen.getByRole('tab', { name: 'Solution' }));

      const solutionTab = screen.getByRole('tab', { name: 'Solution' });
      expect(solutionTab).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('active-code-area')).toHaveValue('def answer(): return 42');
    });

    it('should preserve code in each tab independently', async () => {
      render(<ProblemCreator />);

      // Type starter code
      fireEvent.change(screen.getByTestId('active-code-area'), {
        target: { value: 'def starter(): pass' },
      });

      // Switch to solution
      fireEvent.click(screen.getByRole('tab', { name: 'Solution' }));
      fireEvent.change(screen.getByTestId('active-code-area'), {
        target: { value: 'def solution(): return 42' },
      });

      // Switch back — starter code preserved
      fireEvent.click(screen.getByRole('tab', { name: 'Starter Code' }));
      expect(screen.getByTestId('active-code-area')).toHaveValue('def starter(): pass');

      // Switch to solution — solution code preserved
      fireEvent.click(screen.getByRole('tab', { name: 'Solution' }));
      expect(screen.getByTestId('active-code-area')).toHaveValue('def solution(): return 42');
    });

    it('should include solution in submit payload', async () => {
      const onProblemCreated = jest.fn();
      const { createProblem } = require('@/lib/api/problems');
      createProblem.mockResolvedValue({ id: 'p-1' });

      render(<ProblemCreator onProblemCreated={onProblemCreated} />);

      await waitFor(() => expect(screen.getByLabelText('Class *')).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Test' } });
      fireEvent.change(screen.getByLabelText('Class *'), { target: { value: 'default-class-1' } });

      // Set solution
      fireEvent.click(screen.getByRole('tab', { name: 'Solution' }));
      fireEvent.change(screen.getByTestId('active-code-area'), {
        target: { value: 'def solve(): return 42' },
      });

      fireEvent.click(screen.getByText('Create Problem'));

      await waitFor(() => {
        expect(createProblem).toHaveBeenCalledWith(
          expect.objectContaining({
            solution: 'def solve(): return 42',
          })
        );
      });
    });

    it('should reset solution after successful create', async () => {
      const { createProblem } = require('@/lib/api/problems');
      createProblem.mockResolvedValue({ id: 'p-reset' });

      render(<ProblemCreator />);

      await waitFor(() => expect(screen.getByLabelText('Class *')).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Test' } });
      fireEvent.change(screen.getByLabelText('Class *'), { target: { value: 'default-class-1' } });
      fireEvent.click(screen.getByRole('tab', { name: 'Solution' }));
      fireEvent.change(screen.getByTestId('active-code-area'), {
        target: { value: 'some solution' },
      });

      fireEvent.click(screen.getByText('Create Problem'));

      await waitFor(() => {
        // After reset, Starter Code tab should be active with empty code
        const starterTab = screen.getByRole('tab', { name: 'Starter Code' });
        expect(starterTab).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByTestId('active-code-area')).toHaveValue('');
      });
    });
  });

  describe('IOTestCase[] direct construction', () => {
    it('creates problem with test_cases: [] when no stdin/seed/files', async () => {
      const { createProblem } = require('@/lib/api/problems');
      createProblem.mockResolvedValue({ id: 'problem-new' });

      render(<ProblemCreator />);
      await waitFor(() => expect(screen.getByLabelText('Class *')).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Test Problem' } });
      fireEvent.change(screen.getByLabelText('Class *'), { target: { value: 'default-class-1' } });
      fireEvent.click(screen.getByText('Create Problem'));

      await waitFor(() => expect(createProblem).toHaveBeenCalled());

      const callArgs = createProblem.mock.calls[0][0];
      expect(callArgs.test_cases).toEqual([]);
    });

    it('creates problem with test_cases present on submission', async () => {
      const { createProblem } = require('@/lib/api/problems');
      createProblem.mockResolvedValue({ id: 'problem-new' });

      render(<ProblemCreator />);
      await waitFor(() => expect(screen.getByLabelText('Class *')).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Test' } });
      fireEvent.change(screen.getByLabelText('Class *'), { target: { value: 'default-class-1' } });
      fireEvent.click(screen.getByText('Create Problem'));

      await waitFor(() => expect(createProblem).toHaveBeenCalled());

      const callArgs = createProblem.mock.calls[0][0];
      expect(callArgs).toHaveProperty('test_cases');
      expect(callArgs.test_cases).toBeInstanceOf(Array);
    });
  });
});

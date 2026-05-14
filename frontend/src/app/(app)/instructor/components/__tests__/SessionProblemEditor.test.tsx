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
    test_cases: [],
    author_id: 'test-author',
    class_id: null,
    tags: [],
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
    ...overrides,
  };
}

jest.mock('@/lib/api/execute', () => ({
  executeCode: jest.fn(),
  ioTestCasesToCaseDefs: jest.fn((cases) => cases),
  buildIOTestCases: jest.fn(({ stdin, random_seed, attached_files }) => {
    if (!stdin && !random_seed && (!attached_files || attached_files.length === 0)) return [];
    return [{ kind: 'io', name: 'Default', input: stdin || '', match_type: 'exact', order: 0 }];
  }),
}));

// Mock WorkspaceShell — integration tests focus on SessionProblemEditor wiring,
// not WorkspaceShell internals.
let capturedWorkspaceProps: any = null;
jest.mock('@/components/workspace/WorkspaceShell', () => ({
  __esModule: true,
  default: (props: any) => {
    capturedWorkspaceProps = props;
    const { editorTabs, activeTabId, onChangeCode, onRunAll, onSelectTab, railMode, embedded, tests } = props;
    const activeTab = editorTabs.find((t: any) => t.id === activeTabId) ?? editorTabs[0];
    return (
      <div data-testid="workspace-shell" data-embedded={String(embedded ?? false)}>
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
        {activeTab && (
          <textarea
            data-testid="active-code-area"
            aria-label={activeTab.label}
            value={activeTab.code}
            readOnly={activeTab.readOnly}
            onChange={(e) => onChangeCode?.(activeTab.id, e.target.value)}
          />
        )}
        <button data-testid="run-all-btn" onClick={() => onRunAll?.()}>Run all</button>
        <span data-testid="rail-mode">{railMode ?? 'run'}</span>
        <span data-testid="tests-count">{tests?.length ?? 0}</span>
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
  toDrawerOutput: jest.fn((result) =>
    result
      ? {
          lines: [],
          status: result.summary?.failed > 0 ? 'fail' : 'pass',
          summary: `${result.summary?.passed ?? 0}/${result.summary?.total ?? 0} passed`,
        }
      : undefined
  ),
}));

describe('SessionProblemEditor', () => {
  const mockOnUpdateProblem = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    capturedWorkspaceProps = null;
  });

  describe('WorkspaceShell integration (T9)', () => {
    /**
     * Verifies SessionProblemEditor mounts WorkspaceShell in embedded mode.
     * Author surfaces use WorkspaceShell, not the old CodeEditor/EditorContainer.
     */
    it('renders WorkspaceShell embedded=true', () => {
      render(
        <SessionProblemEditor onUpdateProblem={mockOnUpdateProblem} />
      );

      const shell = screen.getByTestId('workspace-shell');
      expect(shell).toBeInTheDocument();
      expect(shell).toHaveAttribute('data-embedded', 'true');
    });

    /**
     * Verifies no Ribbon is rendered in embedded mode.
     */
    it('no Ribbon rendered in embedded mode', () => {
      render(
        <SessionProblemEditor onUpdateProblem={mockOnUpdateProblem} />
      );
      expect(screen.queryByTestId('ribbon')).not.toBeInTheDocument();
    });

    /**
     * Verifies both tabs are kind='code' and both editable.
     * Authors must edit both Starter Code and Solution in G1.
     */
    it('Starter and Solution tabs are both kind=code and editable', () => {
      render(
        <SessionProblemEditor onUpdateProblem={mockOnUpdateProblem} />
      );

      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(2);
      tabs.forEach((tab) => {
        expect(tab).toHaveAttribute('data-kind', 'code');
        expect(tab).toHaveAttribute('data-readonly', 'false');
      });
    });

    /**
     * Verifies Run all calls executeCode for local execution.
     */
    it('Run all triggers local executeCode', async () => {
      const { executeCode } = require('@/lib/api/execute');
      executeCode.mockResolvedValue({
        summary: { passed: 0, failed: 0, total: 0 },
        results: [],
      });

      render(
        <SessionProblemEditor onUpdateProblem={mockOnUpdateProblem} />
      );

      fireEvent.click(screen.getByTestId('run-all-btn'));

      await waitFor(() => {
        expect(executeCode).toHaveBeenCalled();
      });
    });

    /**
     * Verifies rail mode is 'run'. G2 adds 'edit' mode.
     */
    it('rail mode is run', () => {
      render(
        <SessionProblemEditor onUpdateProblem={mockOnUpdateProblem} />
      );
      expect(screen.getByTestId('rail-mode')).toHaveTextContent('run');
    });
  });

  it('renders with empty initial state', () => {
    render(
      <SessionProblemEditor
        onUpdateProblem={mockOnUpdateProblem}
      />
    );

    expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
    expect(screen.getByText('Update Problem')).toBeInTheDocument();
  });

  it('renders with initial problem data in editor', () => {
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

    // Starter Code tab is active by default, editor shows starter_code
    expect(screen.getByTestId('active-code-area')).toHaveValue('print("hello")');
  });

  it('updates starter code when user types in editor', () => {
    render(
      <SessionProblemEditor
        onUpdateProblem={mockOnUpdateProblem}
      />
    );

    const codeArea = screen.getByTestId('active-code-area');
    fireEvent.change(codeArea, { target: { value: 'print("new code")' } });

    expect(codeArea).toHaveValue('print("new code")');
  });

  it('calls onUpdateProblem with correct data when Update button is clicked', () => {
    render(
      <SessionProblemEditor
        onUpdateProblem={mockOnUpdateProblem}
      />
    );

    fireEvent.change(screen.getByTestId('active-code-area'), {
      target: { value: 'print("code")' }
    });

    fireEvent.click(screen.getByText('Update Problem'));

    expect(mockOnUpdateProblem).toHaveBeenCalledWith(
      expect.objectContaining({
        starter_code: 'print("code")',
        language: 'python',
      })
    );
  });

  it('trims whitespace from code when updating', () => {
    render(
      <SessionProblemEditor
        onUpdateProblem={mockOnUpdateProblem}
      />
    );

    fireEvent.change(screen.getByTestId('active-code-area'), {
      target: { value: '  code with spaces  ' }
    });

    fireEvent.click(screen.getByText('Update Problem'));

    expect(mockOnUpdateProblem).toHaveBeenCalledWith(
      expect.objectContaining({
        starter_code: 'code with spaces',
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

    expect(screen.getByTestId('active-code-area')).toHaveValue('initial code');

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

    expect(screen.getByTestId('active-code-area')).toHaveValue('updated code');
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

      expect(screen.getByTestId('active-code-area')).toHaveValue('starter code here');
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

      fireEvent.click(screen.getByRole('tab', { name: 'Solution' }));
      expect(screen.getByTestId('active-code-area')).toHaveValue('solution code here');
    });

    it('both tabs are editable (readOnly=false) — authors edit both in G1', () => {
      const initialProblem = makeProblem({
        title: 'Test',
        starter_code: 'starter',
        solution: 'solution',
      });

      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          initialProblem={initialProblem}
        />
      );

      // Starter Code tab
      expect(screen.getByTestId('active-code-area')).not.toHaveAttribute('readonly');
      expect(screen.getByRole('tab', { name: 'Starter Code' })).toHaveAttribute('data-readonly', 'false');

      // Solution tab
      fireEvent.click(screen.getByRole('tab', { name: 'Solution' }));
      expect(screen.getByTestId('active-code-area')).not.toHaveAttribute('readonly');
      expect(screen.getByRole('tab', { name: 'Solution' })).toHaveAttribute('data-readonly', 'false');
    });

    it('switches from solution to empty starter code correctly', () => {
      const initialProblem = makeProblem({
        title: 'Test',
        starter_code: '',
        solution: 'solution code here',
      });

      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          initialProblem={initialProblem}
        />
      );

      // Start on Starter Code tab (default) — should be empty
      expect(screen.getByTestId('active-code-area')).toHaveValue('');

      // Switch to Solution tab
      fireEvent.click(screen.getByRole('tab', { name: 'Solution' }));
      expect(screen.getByTestId('active-code-area')).toHaveValue('solution code here');

      // Switch back to Starter Code tab
      fireEvent.click(screen.getByRole('tab', { name: 'Starter Code' }));
      expect(screen.getByTestId('active-code-area')).toHaveValue('');
    });
  });

  describe('solution state', () => {
    it('initializes solution from initialProblem.solution', () => {
      const initialProblem = makeProblem({
        title: 'Test',
        starter_code: 'starter',
        solution: 'the solution code',
      });

      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          initialProblem={initialProblem}
        />
      );

      fireEvent.click(screen.getByRole('tab', { name: 'Solution' }));
      expect(screen.getByTestId('active-code-area')).toHaveValue('the solution code');
    });

    it('syncs solution when initialProblem changes', () => {
      const { rerender } = render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          initialProblem={makeProblem({
            title: 'Initial',
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
            starter_code: 'updated code',
            solution: 'updated solution',
          })}
        />
      );

      fireEvent.click(screen.getByRole('tab', { name: 'Solution' }));
      expect(screen.getByTestId('active-code-area')).toHaveValue('updated solution');
    });

    it('includes solution in onUpdateProblem when edited on Solution tab', () => {
      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          initialProblem={makeProblem({ starter_code: 'starter', solution: 'old solution' })}
        />
      );

      // Edit solution
      fireEvent.click(screen.getByRole('tab', { name: 'Solution' }));
      fireEvent.change(screen.getByTestId('active-code-area'), {
        target: { value: 'new solution code' }
      });

      fireEvent.click(screen.getByText('Update Problem'));

      expect(mockOnUpdateProblem).toHaveBeenCalledWith(
        expect.objectContaining({
          solution: 'new solution code',
        })
      );
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

  describe('initialTestCases prop (PLAT-st42.3)', () => {
    it('accepts initialTestCases prop', () => {
      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          initialTestCases={[{ kind: 'io' as const, name: 'Default', input: 'hello', match_type: 'exact', order: 0 }]}
        />
      );
      expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
    });

    it('produces null test_cases on save when no stdin/seed/files and no initial problem', () => {
      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
        />
      );

      fireEvent.click(screen.getByText('Update Problem'));

      const call = mockOnUpdateProblem.mock.calls[0][0];
      expect(call.test_cases).toBeNull();
    });

    it('produces empty test_cases [] on save when initial problem has empty test_cases and no stdin/seed/files', () => {
      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          initialProblem={makeProblem({ test_cases: [] })}
        />
      );

      fireEvent.click(screen.getByText('Update Problem'));

      const call = mockOnUpdateProblem.mock.calls[0][0];
      expect(call.test_cases).toEqual([]);
    });
  });
});

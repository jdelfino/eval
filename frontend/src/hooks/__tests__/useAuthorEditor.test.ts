/**
 * Tests for useAuthorEditor — the shared author-editor hook (eval-9z9).
 *
 * These cover the behaviors extracted out of ProblemCreator and
 * SessionProblemEditor so the extraction is independently verified:
 *  - addNewTest appends a test case + opens the edit drawer with the right kind
 *  - openEditDrawer loads the selected test into pendingEdit (and no-ops on miss)
 *  - run handlers toggle isRunning and populate executionResult / call error sinks
 *  - onRunStart fires before each run (the SessionProblemEditor clear-error path)
 *  - tab + test selection update activeTab / activeTestId
 *  - drawer mode + output derivation (idle → edit-test / output)
 *
 * @jest-environment jsdom
 */

const mockExecuteCode = jest.fn();

jest.mock('@/lib/api/execute', () => {
  const actual = jest.requireActual('@/lib/api/execute');
  return {
    ...actual,
    executeCode: (...args: unknown[]) => mockExecuteCode(...args),
  };
});

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useAuthorEditor, type UseAuthorEditorOptions, type AuthorEditorTab } from '../useAuthorEditor';
import { toTestRailItems } from '@/lib/testRail';
import type { IOTestCase, TestResponse } from '@/types/api';

/**
 * Render the hook with stateful test-case + tab + statementPreview state, so
 * that setters returned by the host actually update the inputs on re-render —
 * mirroring how the real components wire it.
 */
function renderAuthorEditor(
  overrides: Partial<UseAuthorEditorOptions> = {}
) {
  const onSaveAndRun = jest.fn();
  const onRunError = jest.fn();
  const onRunStart = jest.fn();

  const initialCases = overrides.testCases ?? [];

  const harness = renderHook(() => {
    const [testCases, setTestCases] = React.useState<IOTestCase[]>(initialCases);
    const [activeTab, setActiveTab] = React.useState<AuthorEditorTab>('starter');
    const [starter_code, setStarterCode] = React.useState('print("starter")');
    const [solution, setSolution] = React.useState('print("solution")');
    const [description, setDescription] = React.useState('A statement');
    const [statementPreview, setStatementPreview] = React.useState(true);

    const editor = useAuthorEditor({
      testCases,
      setTestCases,
      language: 'python',
      activeTab,
      setActiveTab,
      starter_code,
      setStarterCode,
      solution,
      setSolution,
      description,
      setDescription,
      statementPreview,
      setStatementPreview,
      onSaveAndRun,
      onRunError,
      onRunStart,
      ...overrides,
    });

    return { editor, testCases, activeTab, statementPreview };
  });

  return { ...harness, onSaveAndRun, onRunError, onRunStart };
}

const ioCase = (name: string, order: number): IOTestCase => ({
  kind: 'io',
  name,
  input: `in-${name}`,
  expected_output: `out-${name}`,
  match_type: 'exact',
  order,
});

const okResponse: TestResponse = {
  results: [{ kind: 'io', name: 'run', status: 'passed', actual: 'ok\n', time_ms: 5 }],
  summary: { total: 1, passed: 1, failed: 0, errors: 0, run: 0, time_ms: 5 },
};

beforeEach(() => jest.clearAllMocks());

describe('useAuthorEditor — initial state', () => {
  it('starts idle: no edit, not running, idle drawer, no output', () => {
    const { result } = renderAuthorEditor();
    expect(result.current.editor.editingTestIdx).toBeNull();
    expect(result.current.editor.pendingEdit).toBeNull();
    expect(result.current.editor.isRunning).toBe(false);
    expect(result.current.editor.executionResult).toBeNull();
    expect(result.current.editor.drawerMode).toBe('idle');
    expect(result.current.editor.drawerOutput).toBeUndefined();
    expect(result.current.editor.lastCreatedKind).toBeNull();
  });

  it('derives one editor tab per code/markdown surface', () => {
    const { result } = renderAuthorEditor();
    const ids = result.current.editor.editorTabs.map((t) => t.id);
    expect(ids).toEqual(['starter', 'solution', 'statement']);
  });
});

describe('useAuthorEditor — addNewTest', () => {
  it('appends an io case, opens the drawer, and records lastCreatedKind', () => {
    const { result } = renderAuthorEditor();

    act(() => {
      result.current.editor.addNewTest('io');
    });

    expect(result.current.testCases).toHaveLength(1);
    expect(result.current.testCases[0].kind).toBe('io');
    expect(result.current.editor.editingTestIdx).toBe(0);
    expect(result.current.editor.pendingEdit?.kind).toBe('io');
    expect(result.current.editor.lastCreatedKind).toBe('io');
    // Adding a test puts the drawer into edit-test mode.
    expect(result.current.editor.drawerMode).toBe('edit-test');
  });

  it('appends a pytest case with the default scaffold', () => {
    const { result } = renderAuthorEditor();

    act(() => {
      result.current.editor.addNewTest('pytest');
    });

    expect(result.current.testCases[0].kind).toBe('pytest');
    const pending = result.current.editor.pendingEdit;
    expect(pending?.kind).toBe('pytest');
    if (pending?.kind === 'pytest') {
      expect(pending.target_path).toBe('tests/test.py::test_');
      expect(pending.test_code).toContain('def test_()');
    }
    expect(result.current.editor.lastCreatedKind).toBe('pytest');
  });
});

describe('useAuthorEditor — openEditDrawer', () => {
  it('loads the selected test into pendingEdit', () => {
    const cases = [ioCase('alpha', 0), ioCase('beta', 1)];
    const { result } = renderAuthorEditor({ testCases: cases });

    const items = toTestRailItems(cases);

    act(() => {
      result.current.editor.openEditDrawer(items[1].id);
    });

    expect(result.current.editor.editingTestIdx).toBe(1);
    const pending = result.current.editor.pendingEdit;
    expect(pending?.kind).toBe('io');
    if (pending?.kind === 'io') {
      expect(pending.name).toBe('beta');
      expect(pending.input).toBe('in-beta');
      expect(pending.expected_output).toBe('out-beta');
    }
  });

  it('no-ops when the test id does not exist', () => {
    const cases = [ioCase('alpha', 0)];
    const { result } = renderAuthorEditor({ testCases: cases });

    act(() => {
      result.current.editor.openEditDrawer('io-99-missing');
    });

    expect(result.current.editor.editingTestIdx).toBeNull();
    expect(result.current.editor.pendingEdit).toBeNull();
  });
});

describe('useAuthorEditor — cancelEdit / clearEdit', () => {
  it('clears the active edit', () => {
    const { result } = renderAuthorEditor();

    act(() => {
      result.current.editor.addNewTest('io');
    });
    expect(result.current.editor.editingTestIdx).toBe(0);

    act(() => {
      result.current.editor.cancelEdit();
    });
    expect(result.current.editor.editingTestIdx).toBeNull();
    expect(result.current.editor.pendingEdit).toBeNull();
  });
});

describe('useAuthorEditor — handleRunAll', () => {
  it('toggles isRunning and stores executionResult on success', async () => {
    mockExecuteCode.mockResolvedValueOnce(okResponse);
    const { result } = renderAuthorEditor({ testCases: [ioCase('alpha', 0)] });

    await act(async () => {
      await result.current.editor.handleRunAll();
    });

    expect(mockExecuteCode).toHaveBeenCalledTimes(1);
    expect(result.current.editor.executionResult).toEqual(okResponse);
    expect(result.current.editor.isRunning).toBe(false);
    // With a result and no active edit, the drawer derives 'output'.
    expect(result.current.editor.drawerMode).toBe('output');
    expect(result.current.editor.drawerOutput).toBeDefined();
  });

  it('calls onRunStart before running and onRunError on failure', async () => {
    mockExecuteCode.mockRejectedValueOnce(new Error('boom'));
    const { result, onRunStart, onRunError } = renderAuthorEditor();

    await act(async () => {
      await result.current.editor.handleRunAll();
    });

    expect(onRunStart).toHaveBeenCalledTimes(1);
    expect(onRunError).toHaveBeenCalledWith('boom');
    expect(result.current.editor.isRunning).toBe(false);
    expect(result.current.editor.executionResult).toBeNull();
  });

  it('runs solution code when the solution tab is active', async () => {
    mockExecuteCode.mockResolvedValue(okResponse);
    const { result } = renderAuthorEditor({ testCases: [ioCase('alpha', 0)] });

    act(() => {
      result.current.editor.handleSelectTab('solution');
    });

    await act(async () => {
      await result.current.editor.handleRunAll();
    });

    expect(mockExecuteCode).toHaveBeenLastCalledWith('print("solution")', 'python', expect.any(Object));
  });
});

describe('useAuthorEditor — handleRunTest', () => {
  it('runs a single test and lands the result at the row index (sparse)', async () => {
    mockExecuteCode.mockResolvedValueOnce(okResponse);
    const cases = [ioCase('alpha', 0), ioCase('beta', 1)];
    const { result } = renderAuthorEditor({ testCases: cases });

    const items = toTestRailItems(cases);

    await act(async () => {
      await result.current.editor.handleRunTest(items[1].id);
    });

    const res = result.current.editor.executionResult;
    expect(res).not.toBeNull();
    // Sparse array: index 0 empty, index 1 carries the result.
    expect(res!.results).toHaveLength(2);
    expect(res!.results[0]).toBeUndefined();
    expect(res!.results[1]).toEqual(okResponse.results[0]);
  });

  it('no-ops for an unknown test id', async () => {
    const { result } = renderAuthorEditor({ testCases: [ioCase('alpha', 0)] });

    await act(async () => {
      await result.current.editor.handleRunTest('io-99-missing');
    });

    expect(mockExecuteCode).not.toHaveBeenCalled();
    expect(result.current.editor.executionResult).toBeNull();
  });
});

describe('useAuthorEditor — handleDebugTest', () => {
  it('is a no-op (debug deferred to G3)', () => {
    const { result } = renderAuthorEditor();
    expect(() => {
      act(() => {
        result.current.editor.handleDebugTest('io-0-alpha');
      });
    }).not.toThrow();
    expect(mockExecuteCode).not.toHaveBeenCalled();
    expect(result.current.editor.drawerMode).toBe('idle');
  });
});

describe('useAuthorEditor — selection', () => {
  it('handleSelectTab updates the active tab', () => {
    const { result } = renderAuthorEditor();
    act(() => {
      result.current.editor.handleSelectTab('statement');
    });
    expect(result.current.activeTab).toBe('statement');
  });

  it('ignores unknown tab ids', () => {
    const { result } = renderAuthorEditor();
    act(() => {
      result.current.editor.handleSelectTab('nope');
    });
    expect(result.current.activeTab).toBe('starter');
  });

  it('handleSelectTest updates the active test id', () => {
    const { result } = renderAuthorEditor();
    act(() => {
      result.current.editor.handleSelectTest('io-0-alpha');
    });
    expect(result.current.editor.activeTestId).toBe('io-0-alpha');
  });
});

describe('useAuthorEditor — drawer JSX blocks', () => {
  it('renders the MdToggle only when the statement tab is active', () => {
    const { result } = renderAuthorEditor();
    expect(result.current.editor.MdToggle).toBeNull();

    act(() => {
      result.current.editor.handleSelectTab('statement');
    });
    expect(result.current.editor.MdToggle).not.toBeNull();
  });

  it('renders drawerCloseAction only while editing a test', () => {
    const { result } = renderAuthorEditor();
    expect(result.current.editor.drawerCloseAction).toBeUndefined();

    act(() => {
      result.current.editor.addNewTest('io');
    });
    expect(result.current.editor.drawerCloseAction).toBeDefined();
  });

  it('drawerCloseAction wires Save & run to the host onSaveAndRun', () => {
    const { result, onSaveAndRun } = renderAuthorEditor();

    act(() => {
      result.current.editor.addNewTest('io');
    });

    const action = result.current.editor.drawerCloseAction as React.ReactElement<{
      children: React.ReactElement<{ onClick: () => void }>[];
    }>;
    // Fragment children: [Cancel button, Save & run button]
    const saveButton = action.props.children[1];
    act(() => {
      saveButton.props.onClick();
    });
    expect(onSaveAndRun).toHaveBeenCalledTimes(1);
  });
});

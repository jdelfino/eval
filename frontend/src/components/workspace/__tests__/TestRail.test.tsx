/**
 * Unit tests for the TestRail component.
 *
 * Contract: TestRail renders the right-side panel listing all tests with state,
 * kind pill, time, and per-row Run/Debug controls when active. It is a dumb
 * component that takes TestRailItem[] and fires callbacks.
 * Regressions here silently break the primary test-running UI.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TestRail } from '../TestRail';
import type { TestRailItem } from '@/lib/testRail';

const makeItem = (overrides: Partial<TestRailItem> & { id: string }): TestRailItem => ({
  name: `Test ${overrides.id}`,
  kind: 'io',
  state: 'idle',
  t: '',
  ...overrides,
});

const ioItem = makeItem({ id: 'i1', name: 'IO test', kind: 'io', state: 'pass', t: '5ms' });
const pytestItem = makeItem({ id: 'p1', name: 'pytest test', kind: 'pytest', state: 'fail', t: '12ms' });

describe('TestRail', () => {
  describe('renders rows with name, kind pill, state dot, time', () => {
    /**
     * Verifies each row renders exactly one kind-Pill, one StateDot, and the time string.
     * Breaking this means test rows are missing critical visual signals — users can't
     * distinguish test kind or state at a glance.
     */
    it('renders name, kind pill, and time for each test item', () => {
      render(<TestRail tests={[ioItem, pytestItem]} />);

      expect(screen.getByText('IO test')).toBeInTheDocument();
      expect(screen.getByText('pytest test')).toBeInTheDocument();
      expect(screen.getByText('5ms')).toBeInTheDocument();
      expect(screen.getByText('12ms')).toBeInTheDocument();
    });

    it('renders kind pills for each item', () => {
      render(<TestRail tests={[ioItem, pytestItem]} />);

      // Kind pills should be present — one per row
      const ioPill = screen.getByText('io');
      const pytestPill = screen.getByText('pytest');
      expect(ioPill).toBeInTheDocument();
      expect(pytestPill).toBeInTheDocument();
    });

    it('renders state dots for each item', () => {
      const { container } = render(<TestRail tests={[ioItem, pytestItem]} />);
      // StateDot elements: one per item
      // They render as spans with inline background styles
      const stateDots = container.querySelectorAll('[data-testid="state-dot"]');
      expect(stateDots).toHaveLength(2);
    });
  });

  describe('never renders a hidden pill', () => {
    /**
     * The "hidden" pill has been removed along with the visible field — hidden tests
     * are not in scope for the redesign. This test guards against accidental re-introduction.
     * If a "hidden" pill appears for any input, the dead wiring has leaked back in.
     */
    it('never renders a "hidden" pill for any item', () => {
      render(<TestRail tests={[ioItem, pytestItem]} />);
      expect(screen.queryByText('hidden')).not.toBeInTheDocument();
    });
  });

  describe('active row shows Run/Debug controls; inactive rows do not', () => {
    /**
     * Run and Debug buttons must appear only on the active row. Leaking controls
     * to all rows means users click the wrong test's Run button. Missing controls
     * on the active row means tests can't be run individually.
     */
    it('shows Run and Debug buttons only on the active row', () => {
      const items = [
        makeItem({ id: 'a1', name: 'Active' }),
        makeItem({ id: 'a2', name: 'Inactive' }),
      ];
      render(<TestRail tests={items} activeId="a1" mode="run" />);

      // Debug button should appear exactly once (only on active row)
      const debugButtons = screen.getAllByRole('button', { name: /debug/i });
      expect(debugButtons).toHaveLength(1);

      // The per-row run button (▶ Run) appears once
      const rowRunBtn = screen.getByRole('button', { name: /▶ Run/i });
      expect(rowRunBtn).toBeInTheDocument();
    });

    it('clicking Run fires onRunTest with the active item id', () => {
      const onRunTest = jest.fn();
      const items = [makeItem({ id: 'r1', name: 'Test A' })];
      render(<TestRail tests={items} activeId="r1" mode="run" onRunTest={onRunTest} />);

      const rowRunBtn = screen.getByRole('button', { name: /▶ Run/i });
      fireEvent.click(rowRunBtn);
      expect(onRunTest).toHaveBeenCalledWith('r1');
    });

    it('clicking Debug fires onDebugTest with the active item id', () => {
      const onDebugTest = jest.fn();
      const items = [makeItem({ id: 'd1', name: 'Test D' })];
      render(<TestRail tests={items} activeId="d1" mode="run" onDebugTest={onDebugTest} />);

      const debugBtn = screen.getByRole('button', { name: /debug/i });
      fireEvent.click(debugBtn);
      expect(onDebugTest).toHaveBeenCalledWith('d1');
    });

    it('inactive rows do not show Run or Debug buttons', () => {
      const items = [
        makeItem({ id: 'x1', name: 'Active' }),
        makeItem({ id: 'x2', name: 'Inactive' }),
      ];
      render(<TestRail tests={items} activeId="x1" mode="run" />);

      // There should be at most one Debug button total (on the active row)
      const debugButtons = screen.queryAllByRole('button', { name: /debug/i });
      expect(debugButtons).toHaveLength(1);
    });
  });

  describe('Run all button reflects isRunningAll prop', () => {
    /**
     * The "Run all" button in the header must reflect running state to prevent
     * double-clicks and give users feedback that execution is in progress.
     */
    it('shows "Run all" label and fires onRunAll when not running', () => {
      const onRunAll = jest.fn();
      render(<TestRail tests={[ioItem]} isRunningAll={false} onRunAll={onRunAll} />);

      const runAllBtn = screen.getByRole('button', { name: /run all/i });
      expect(runAllBtn).toBeInTheDocument();
      fireEvent.click(runAllBtn);
      expect(onRunAll).toHaveBeenCalledTimes(1);
    });

    it('shows "Running…" label and is disabled when isRunningAll=true', () => {
      render(<TestRail tests={[ioItem]} isRunningAll={true} onRunAll={jest.fn()} />);

      const runningBtn = screen.getByRole('button', { name: /running/i });
      expect(runningBtn).toBeInTheDocument();
      expect(runningBtn).toBeDisabled();
    });
  });

  describe('empty state', () => {
    /**
     * When there are no tests, a hint should be shown so users know the panel
     * is functioning — not broken or loading.
     */
    it('shows default "No tests yet." hint when tests is empty', () => {
      render(<TestRail tests={[]} />);
      expect(screen.getByText('No tests yet.')).toBeInTheDocument();
    });

    it('shows custom emptyHint when provided', () => {
      render(<TestRail tests={[]} emptyHint="Add a test case to get started." />);
      expect(screen.getByText('Add a test case to get started.')).toBeInTheDocument();
    });
  });

  describe('mode=view hides Run/Debug controls entirely', () => {
    /**
     * In view mode (read-only), no Run/Debug buttons should be rendered even on
     * the active row. Violating this exposes controls that don't work in view context.
     */
    it('does not render Run or Debug buttons in mode=view even for active row', () => {
      const items = [makeItem({ id: 'v1', name: 'Test' })];
      render(<TestRail tests={items} activeId="v1" mode="view" />);

      expect(screen.queryByRole('button', { name: /debug/i })).not.toBeInTheDocument();
      // The per-row ▶ Run button should not appear in view mode
      expect(screen.queryByRole('button', { name: /▶ Run/i })).not.toBeInTheDocument();
    });
  });

  describe('header', () => {
    it('renders custom title when provided', () => {
      render(<TestRail tests={[]} title="My Tests" />);
      expect(screen.getByText('My Tests')).toBeInTheDocument();
    });

    it('renders default title "Tests" when none provided', () => {
      render(<TestRail tests={[]} />);
      expect(screen.getByText('Tests')).toBeInTheDocument();
    });

    it('renders selectedSummary when provided', () => {
      render(<TestRail tests={[ioItem]} selectedSummary="1 of 1 passing" />);
      expect(screen.getByText('1 of 1 passing')).toBeInTheDocument();
    });
  });

  describe('onSelectTest callback', () => {
    it('fires onSelectTest when a row is clicked', () => {
      const onSelectTest = jest.fn();
      const items = [makeItem({ id: 's1', name: 'Selectable' })];
      render(<TestRail tests={items} onSelectTest={onSelectTest} />);

      fireEvent.click(screen.getByText('Selectable'));
      expect(onSelectTest).toHaveBeenCalledWith('s1');
    });
  });

  // ── G2 author affordances ─────────────────────────────────────────────────

  describe('railMode=edit: Edit body button', () => {
    /**
     * In edit mode the active row must show an "Edit body" button so the author
     * can open the per-test drawer. The button must be absent on inactive rows
     * (no noise) and absent entirely when mode !== 'edit'.
     *
     * Catches: wrong mode gate (run-mode should not show it), button leaked to
     * inactive rows, callback not wired to the correct test id.
     */
    it('shows "Edit body" button on active row in edit mode, absent on inactive', () => {
      const items = [
        makeItem({ id: 't1', name: 'Test 1' }),
        makeItem({ id: 't2', name: 'Test 2' }),
      ];
      render(<TestRail tests={items} activeId="t1" mode="edit" />);

      const editButtons = screen.getAllByRole('button', { name: /edit body/i });
      expect(editButtons).toHaveLength(1);

      // Confirm it's on the active row (t1's row)
      const t1Row = screen.getByTestId('testrail-row-t1');
      expect(t1Row).toContainElement(editButtons[0]);

      // t2's row must not have an Edit body button
      const t2Row = screen.getByTestId('testrail-row-t2');
      expect(t2Row.querySelector('[data-testid="edit-body-btn"]')).toBeNull();
    });

    it('does not show "Edit body" button in run mode', () => {
      const items = [makeItem({ id: 't1', name: 'Test 1' })];
      render(<TestRail tests={items} activeId="t1" mode="run" />);

      expect(screen.queryByRole('button', { name: /edit body/i })).not.toBeInTheDocument();
    });

    it('clicking Edit body fires onEditTest with the row id', () => {
      const onEditTest = jest.fn();
      const items = [makeItem({ id: 't1', name: 'Test 1' })];
      render(<TestRail tests={items} activeId="t1" mode="edit" onEditTest={onEditTest} />);

      fireEvent.click(screen.getByRole('button', { name: /edit body/i }));
      expect(onEditTest).toHaveBeenCalledTimes(1);
      expect(onEditTest).toHaveBeenCalledWith('t1');
    });
  });

  describe('railShowAdd: split-button add-test row', () => {
    /**
     * When railShowAdd=true, a split-button row must appear at the bottom of the
     * list with a main button (fires onAddTest with the current sticky kind) and a
     * caret button (opens a menu with IO test + Pytest test options).
     *
     * Catches: row missing or only partially rendered, default kind seed wrong,
     * sticky state ignored, menu options not wired.
     */
    it('renders main add button and caret when railShowAdd=true', () => {
      render(<TestRail tests={[ioItem]} railShowAdd={true} />);

      // Main button label matches the default kind (io → "Add IO test")
      expect(screen.getByRole('button', { name: /add io test/i })).toBeInTheDocument();
      // Caret button
      expect(screen.getByRole('button', { name: /▾/i })).toBeInTheDocument();
    });

    it('does not render add-test affordance when railShowAdd=false', () => {
      render(<TestRail tests={[ioItem]} railShowAdd={false} />);

      expect(screen.queryByRole('button', { name: /add io test/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /add pytest test/i })).not.toBeInTheDocument();
    });

    it('does not render add-test affordance when railShowAdd is omitted', () => {
      render(<TestRail tests={[ioItem]} />);

      expect(screen.queryByRole('button', { name: /add io test/i })).not.toBeInTheDocument();
    });

    it('main label follows lastCreatedKind: io → "Add IO test"', () => {
      render(<TestRail tests={[]} railShowAdd={true} lastCreatedKind="io" />);
      expect(screen.getByRole('button', { name: /add io test/i })).toBeInTheDocument();
    });

    it('main label follows lastCreatedKind: pytest → "Add Pytest test"', () => {
      render(<TestRail tests={[]} railShowAdd={true} lastCreatedKind="pytest" />);
      expect(screen.getByRole('button', { name: /add pytest test/i })).toBeInTheDocument();
    });

    it('main click fires onAddTest with sticky io kind (no lastCreatedKind)', () => {
      const onAddTest = jest.fn();
      render(<TestRail tests={[]} railShowAdd={true} onAddTest={onAddTest} />);

      fireEvent.click(screen.getByRole('button', { name: /add io test/i }));
      expect(onAddTest).toHaveBeenCalledTimes(1);
      expect(onAddTest).toHaveBeenCalledWith('io');
    });

    it('main click fires onAddTest with lastCreatedKind=pytest', () => {
      const onAddTest = jest.fn();
      render(
        <TestRail tests={[]} railShowAdd={true} onAddTest={onAddTest} lastCreatedKind="pytest" />,
      );

      fireEvent.click(screen.getByRole('button', { name: /add pytest test/i }));
      expect(onAddTest).toHaveBeenCalledTimes(1);
      expect(onAddTest).toHaveBeenCalledWith('pytest');
    });

    it('caret opens menu with IO test and Pytest test options', () => {
      render(<TestRail tests={[]} railShowAdd={true} />);

      // Menu should be closed initially
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();

      // Click caret to open menu
      fireEvent.click(screen.getByRole('button', { name: /▾/i }));

      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /io test/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /pytest test/i })).toBeInTheDocument();
    });

    it('selecting Pytest test from menu fires onAddTest("pytest") and closes menu', () => {
      const onAddTest = jest.fn();
      render(<TestRail tests={[]} railShowAdd={true} onAddTest={onAddTest} />);

      // Open caret menu
      fireEvent.click(screen.getByRole('button', { name: /▾/i }));
      expect(screen.getByRole('menu')).toBeInTheDocument();

      // Click Pytest test option
      fireEvent.click(screen.getByRole('menuitem', { name: /pytest test/i }));

      expect(onAddTest).toHaveBeenCalledTimes(1);
      expect(onAddTest).toHaveBeenCalledWith('pytest');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('selecting IO test from menu fires onAddTest("io") and closes menu', () => {
      const onAddTest = jest.fn();
      render(<TestRail tests={[]} railShowAdd={true} onAddTest={onAddTest} />);

      // Open caret menu
      fireEvent.click(screen.getByRole('button', { name: /▾/i }));

      // Click IO test option
      fireEvent.click(screen.getByRole('menuitem', { name: /io test/i }));

      expect(onAddTest).toHaveBeenCalledTimes(1);
      expect(onAddTest).toHaveBeenCalledWith('io');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });
});

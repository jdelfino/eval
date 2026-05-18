/**
 * Unit tests for the WorkspaceShell component.
 * @jest-environment jsdom
 *
 * Contract: WorkspaceShell composes Ribbon (in non-embedded mode) + EditorPane + TestRail + Drawer
 * into the unified workspace surface. embedded=true omits Ribbon. All child components receive
 * their props correctly.
 * Regressions here break the entire workspace shell — every skin would be affected.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import WorkspaceShell from '../WorkspaceShell';
import type { TestRailItem } from '@/lib/testRail';

// Mock sub-components so tests focus on composition logic, not sub-component rendering
jest.mock('../Ribbon', () => ({
  Ribbon: ({ open, onToggle, title, meta, body }: {
    open: boolean;
    onToggle: () => void;
    title: string;
    meta?: string;
    body: string;
  }) => (
    <div data-testid="ribbon" data-open={String(open)} data-title={title} data-meta={meta || ''}>
      <button onClick={onToggle}>toggle</button>
      <span>{body}</span>
    </div>
  ),
}));

jest.mock('../EditorPane', () => ({
  __esModule: true,
  default: ({ tabs, activeId, onSelect, rightControls, footnote }: {
    tabs: unknown[];
    activeId?: string;
    onSelect?: (id: string) => void;
    rightControls?: React.ReactNode;
    footnote?: React.ReactNode;
  }) => (
    <div
      data-testid="editor-pane"
      data-tabs-count={tabs.length}
      data-active-id={activeId || ''}
    >
      {rightControls && <div data-testid="right-controls">{rightControls}</div>}
      {footnote && <div data-testid="footnote">{footnote}</div>}
    </div>
  ),
}));

jest.mock('../TestRail', () => ({
  TestRail: ({ tests, onRunAll, onRunTest, onDebugTest, activeId, mode, title, selectedSummary }: {
    tests: TestRailItem[];
    onRunAll?: () => void;
    onRunTest?: (id: string) => void;
    onDebugTest?: (id: string) => void;
    activeId?: string;
    mode?: string;
    title?: string;
    selectedSummary?: string;
  }) => (
    <div
      data-testid="test-rail"
      data-tests-count={tests.length}
      data-active-id={activeId || ''}
      data-mode={mode || 'run'}
      data-title={title || ''}
      data-summary={selectedSummary || ''}
    >
      {onRunAll && <button onClick={onRunAll} data-testid="rail-run-all">RunAll</button>}
      {onRunTest && <button onClick={() => onRunTest('t1')} data-testid="rail-run-test">RunTest</button>}
      {onDebugTest && <button onClick={() => onDebugTest('t1')} data-testid="rail-debug-test">DebugTest</button>}
    </div>
  ),
}));

jest.mock('../Drawer', () => ({
  Drawer: ({ mode, output, failure, debug, runtimeError, summary, closeAction, collapsed, onToggleCollapsed, edit, onEditChange }: {
    mode: string;
    output?: unknown;
    failure?: unknown;
    debug?: unknown;
    runtimeError?: unknown;
    summary?: string;
    closeAction?: React.ReactNode;
    collapsed?: boolean;
    onToggleCollapsed?: () => void;
    edit?: { kind: string; name: string; input?: string; expected_output?: string; match_type?: string };
    onEditChange?: (next: unknown) => void;
  }) => (
    <div
      data-testid="drawer"
      data-mode={mode}
      data-collapsed={String(collapsed || false)}
      data-summary={summary || ''}
    >
      {closeAction && <div data-testid="close-action">{closeAction}</div>}
      {edit && onEditChange && (
        <button
          data-testid="drawer-edit-change-trigger"
          onClick={() => onEditChange({ ...edit, input: 'changed' })}
        >
          trigger edit change
        </button>
      )}
    </div>
  ),
}));

const ioTab = {
  id: 'main',
  label: 'main.py',
  kind: 'code' as const,
  language: 'python' as const,
  code: 'print(1)',
};

const testItem: TestRailItem = {
  id: 't1',
  name: 'Test 1',
  kind: 'io',
  state: 'idle',
  t: '',
};

const baseProps = {
  editorTabs: [ioTab],
  tests: [testItem],
  drawerMode: 'idle' as const,
};

describe('WorkspaceShell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('non-embedded mode', () => {
    /**
     * Contract: non-embedded (embedded=false, the default) renders all four child components:
     * Ribbon + EditorPane + TestRail + Drawer. Omitting any would break the layout.
     */
    it('renders Ribbon + EditorPane + TestRail + Drawer when not embedded', () => {
      render(
        <WorkspaceShell
          {...baseProps}
          problemTitle="Two Sum"
          statement="Problem statement"
          ribbonOpen={false}
        />
      );

      expect(screen.getByTestId('ribbon')).toBeInTheDocument();
      expect(screen.getByTestId('editor-pane')).toBeInTheDocument();
      expect(screen.getByTestId('test-rail')).toBeInTheDocument();
      expect(screen.getByTestId('drawer')).toBeInTheDocument();
    });

    it('passes problemTitle and statement to Ribbon', () => {
      render(
        <WorkspaceShell
          {...baseProps}
          problemTitle="Two Sum"
          statement="Hello world"
          ribbonOpen={true}
        />
      );
      const ribbon = screen.getByTestId('ribbon');
      expect(ribbon).toHaveAttribute('data-title', 'Two Sum');
      expect(ribbon).toHaveTextContent('Hello world');
    });
  });

  describe('embedded mode', () => {
    /**
     * Contract: embedded=true omits the Ribbon entirely. Host page provides its own chrome.
     * EditorPane + TestRail + Drawer must still be present. TestRail gets width 320px in embedded
     * mode vs 340px otherwise. Regressions break every embedded consumer (instructor, author surfaces).
     */
    it('omits Ribbon when embedded=true', () => {
      render(
        <WorkspaceShell
          {...baseProps}
          embedded={true}
          problemTitle="Two Sum"
          statement="Problem statement"
        />
      );
      expect(screen.queryByTestId('ribbon')).not.toBeInTheDocument();
    });

    it('still renders EditorPane, TestRail, Drawer when embedded=true', () => {
      render(
        <WorkspaceShell
          {...baseProps}
          embedded={true}
        />
      );
      expect(screen.getByTestId('editor-pane')).toBeInTheDocument();
      expect(screen.getByTestId('test-rail')).toBeInTheDocument();
      expect(screen.getByTestId('drawer')).toBeInTheDocument();
    });
  });

  describe('rail callback forwarding', () => {
    /**
     * Contract: WorkspaceShell passes onRunAll, onRunTest, onDebugTest through to TestRail without
     * modification. Broken forwarding means run/debug controls are completely non-functional.
     */
    it('forwards onRunAll to TestRail', () => {
      const onRunAll = jest.fn();
      render(<WorkspaceShell {...baseProps} onRunAll={onRunAll} />);
      fireEvent.click(screen.getByTestId('rail-run-all'));
      expect(onRunAll).toHaveBeenCalledTimes(1);
    });

    it('forwards onRunTest to TestRail', () => {
      const onRunTest = jest.fn();
      render(<WorkspaceShell {...baseProps} onRunTest={onRunTest} />);
      fireEvent.click(screen.getByTestId('rail-run-test'));
      expect(onRunTest).toHaveBeenCalledWith('t1');
    });

    it('forwards onDebugTest to TestRail', () => {
      const onDebugTest = jest.fn();
      render(<WorkspaceShell {...baseProps} onDebugTest={onDebugTest} />);
      fireEvent.click(screen.getByTestId('rail-debug-test'));
      expect(onDebugTest).toHaveBeenCalledWith('t1');
    });
  });

  describe('drawer prop forwarding', () => {
    /**
     * Contract: drawerMode and drawer content props are forwarded to Drawer unchanged.
     * Broken forwarding means Drawer always shows the wrong content.
     */
    it('forwards drawerMode to Drawer', () => {
      const output = {
        lines: [{ stream: 'out' as const, text: 'hello' }],
        status: 'pass' as const,
      };
      render(<WorkspaceShell {...baseProps} drawerMode="output" drawerOutput={output} />);
      const drawer = screen.getByTestId('drawer');
      expect(drawer).toHaveAttribute('data-mode', 'output');
    });

    it('forwards drawerSummary to Drawer', () => {
      render(<WorkspaceShell {...baseProps} drawerMode="idle" drawerSummary="5 of 7 passing" />);
      const drawer = screen.getByTestId('drawer');
      expect(drawer).toHaveAttribute('data-summary', '5 of 7 passing');
    });

    it('forwards drawerCollapsed to Drawer', () => {
      render(<WorkspaceShell {...baseProps} drawerMode="idle" drawerCollapsed={true} />);
      const drawer = screen.getByTestId('drawer');
      expect(drawer).toHaveAttribute('data-collapsed', 'true');
    });
  });

  describe('skinTopBar', () => {
    /**
     * Contract: skinTopBar renders as a row between the Ribbon (or top of shell in embedded mode)
     * and the editor area. It's the student-switcher slot in instructor views.
     */
    it('renders skinTopBar when provided in non-embedded mode', () => {
      render(
        <WorkspaceShell
          {...baseProps}
          problemTitle="Two Sum"
          statement="stmt"
          skinTopBar={<div>switcher</div>}
        />
      );
      expect(screen.getByText('switcher')).toBeInTheDocument();
    });

    it('renders skinTopBar in embedded mode', () => {
      render(
        <WorkspaceShell
          {...baseProps}
          embedded={true}
          skinTopBar={<div>embedded-switcher</div>}
        />
      );
      expect(screen.getByText('embedded-switcher')).toBeInTheDocument();
    });
  });

  describe('drawerEdit threading', () => {
    /**
     * Contract: WorkspaceShell must thread drawerEdit and onDrawerEditChange props down to Drawer.
     * Without this, the edit-test mode drawer can't receive field data or propagate changes back.
     * Catches: WorkspaceShell pass-through missing for new edit props.
     */
    it('threads drawerEdit and onDrawerEditChange to Drawer — field change calls onDrawerEditChange', () => {
      const onDrawerEditChange = jest.fn();
      const drawerEdit = {
        kind: 'io' as const,
        name: 'test1',
        input: 'hello',
        expected_output: 'world',
        match_type: 'exact' as const,
      };

      render(
        <WorkspaceShell
          {...baseProps}
          drawerMode="edit-test"
          drawerEdit={drawerEdit}
          onDrawerEditChange={onDrawerEditChange}
        />
      );

      // The mocked Drawer renders a button that triggers onEditChange when edit+onEditChange are both present
      const trigger = screen.getByTestId('drawer-edit-change-trigger');
      fireEvent.click(trigger);

      expect(onDrawerEditChange).toHaveBeenCalledTimes(1);
      const called = onDrawerEditChange.mock.calls[0][0];
      expect(called.input).toBe('changed');
    });
  });

  describe('propertiesBar slot', () => {
    /**
     * Contract: propertiesBar renders as a row after Ribbon (or skinTopBar) and before the
     * editor/rail area. This is the slot the author skin uses for ProblemPropertiesBar.
     * If the slot is not wired, the bar is silently missing from the author workspace.
     */
    it('renders propertiesBar slot content when prop provided', () => {
      render(
        <WorkspaceShell
          {...baseProps}
          problemTitle="Two Sum"
          statement="stmt"
          propertiesBar={<div data-testid="properties-bar-slot">properties bar</div>}
        />
      );
      expect(screen.getByTestId('properties-bar-slot')).toBeInTheDocument();
    });

    it('does not render propertiesBar slot when prop is not provided', () => {
      render(
        <WorkspaceShell
          {...baseProps}
          problemTitle="Two Sum"
          statement="stmt"
        />
      );
      expect(screen.queryByTestId('properties-bar-slot')).not.toBeInTheDocument();
    });
  });
});

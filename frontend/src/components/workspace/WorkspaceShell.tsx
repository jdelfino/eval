'use client';

import React from 'react';
import { Ribbon } from '@/components/workspace/Ribbon';
import EditorPane from '@/components/workspace/EditorPane';
import { TestRail } from '@/components/workspace/TestRail';
import { Drawer } from '@/components/workspace/Drawer';
import type { EditorTab } from '@/components/workspace/EditorPane';
import type { DrawerMode, DrawerProps } from '@/components/workspace/Drawer';
import type { TestRailItem } from '@/lib/testRail';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WorkspaceShellProps {
  // ribbon
  ribbonOpen?: boolean;
  onToggleRibbon?: () => void;
  problemTitle?: string;
  problemMeta?: string;
  statement?: string;

  // editor
  editorTabs: EditorTab[];
  activeTabId?: string;
  onSelectTab?: (id: string) => void;
  onChangeCode?: (id: string, code: string) => void;
  highlight?: number;
  editorRightControls?: React.ReactNode;
  editorFootnote?: React.ReactNode;

  // rail
  tests: TestRailItem[];
  activeTestId?: string;
  onSelectTest?: (id: string) => void;
  onRunTest?: (id: string) => void;
  onDebugTest?: (id: string) => void;
  onRunAll?: () => void;
  isRunningAll?: boolean;
  railTitle?: string;
  railMode?: 'run' | 'edit' | 'view';
  railSummary?: string;

  // drawer
  drawerMode: DrawerMode;
  drawerCollapsed?: boolean;
  onToggleDrawer?: () => void;
  drawerOutput?: DrawerProps['output'];
  drawerFailure?: DrawerProps['failure'];
  drawerDebug?: DrawerProps['debug'];
  drawerRuntimeError?: DrawerProps['runtimeError'];
  drawerSummary?: string;
  drawerCloseAction?: React.ReactNode;

  // skin extras
  /** Optional row rendered between Ribbon (or shell top) and the editor/rail area */
  skinTopBar?: React.ReactNode;
  /** When true, omits the Ribbon — host page provides its own chrome */
  embedded?: boolean;
}

// ─── WorkspaceShell ──────────────────────────────────────────────────────────

/**
 * WorkspaceShell — unified workspace surface consumed by all four host skins.
 *
 * Layout (non-embedded):
 *   Ribbon → skinTopBar? → [EditorPane (flex:1) | TestRail (340px)] → Drawer
 *
 * Layout (embedded):
 *   skinTopBar? → [EditorPane (flex:1) | TestRail (320px)] → Drawer
 *
 * embedded=true omits the Ribbon; the host page provides its own chrome.
 */
export default function WorkspaceShell({
  // ribbon
  ribbonOpen = false,
  onToggleRibbon,
  problemTitle = '',
  problemMeta,
  statement = '',

  // editor
  editorTabs,
  activeTabId,
  onSelectTab,
  onChangeCode,
  highlight,
  editorRightControls,
  editorFootnote,

  // rail
  tests,
  activeTestId,
  onSelectTest,
  onRunTest,
  onDebugTest,
  onRunAll,
  isRunningAll,
  railTitle,
  railMode,
  railSummary,

  // drawer
  drawerMode,
  drawerCollapsed,
  onToggleDrawer,
  drawerOutput,
  drawerFailure,
  drawerDebug,
  drawerRuntimeError,
  drawerSummary,
  drawerCloseAction,

  // extras
  skinTopBar,
  embedded = false,
}: WorkspaceShellProps) {
  // TestRail width: 320px in embedded mode (host provides outer padding), 340px standalone
  const railWidth = embedded ? 320 : 340;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        minWidth: 0,
        background: 'var(--bg)',
        color: 'var(--fg)',
      }}
    >
      {/* Ribbon — only in non-embedded mode */}
      {!embedded && (
        <Ribbon
          open={ribbonOpen}
          onToggle={onToggleRibbon ?? (() => {})}
          title={problemTitle}
          meta={problemMeta}
          body={statement}
        />
      )}

      {/* Optional top bar between ribbon and editor (e.g. instructor student-switcher) */}
      {skinTopBar}

      {/* Main content row: editor + rail side-by-side */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {/* Editor pane — takes all remaining horizontal space */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
          }}
        >
          <EditorPane
            tabs={editorTabs}
            activeId={activeTabId}
            onSelect={onSelectTab}
            onChangeCode={onChangeCode}
            highlight={highlight}
            rightControls={editorRightControls}
            footnote={editorFootnote}
          />
        </div>

        {/* Test rail — fixed width */}
        <div
          style={{
            width: railWidth,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <TestRail
            tests={tests}
            activeId={activeTestId}
            mode={railMode}
            onSelectTest={onSelectTest}
            onRunTest={onRunTest}
            onDebugTest={onDebugTest}
            onRunAll={onRunAll}
            isRunningAll={isRunningAll}
            title={railTitle}
            selectedSummary={railSummary}
          />
        </div>
      </div>

      {/* Drawer — bottom panel */}
      <Drawer
        mode={drawerMode}
        collapsed={drawerCollapsed}
        onToggleCollapsed={onToggleDrawer}
        output={drawerOutput}
        failure={drawerFailure}
        debug={drawerDebug}
        runtimeError={drawerRuntimeError}
        summary={drawerSummary}
        closeAction={drawerCloseAction}
      />
    </div>
  );
}

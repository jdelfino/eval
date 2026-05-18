'use client';

import React from 'react';
import { Ribbon } from '@/components/workspace/Ribbon';
import EditorPane from '@/components/workspace/EditorPane';
import { TestRail } from '@/components/workspace/TestRail';
import { Drawer } from '@/components/workspace/Drawer';
import type { EditorTab } from '@/components/workspace/EditorPane';
import type { DrawerMode, DrawerProps, DrawerEdit } from '@/components/workspace/Drawer';
import type { TestRailItem } from '@/lib/testRail';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WorkspaceShellProps {
  // ribbon
  ribbonOpen?: boolean;
  onToggleRibbon?: () => void;
  problemTitle?: string;
  problemMeta?: string;
  statement?: string;
  /**
   * Author-skin only: when true the Ribbon title is click-to-edit.
   * Non-author skins (student, instructor, projector) omit this prop or pass false.
   */
  ribbonEditable?: boolean;
  /** Called with the new title string when the author commits a ribbon title edit. */
  onTitleChange?: (title: string) => void;

  // editor
  editorTabs: EditorTab[];
  activeTabId?: string;
  onSelectTab?: (id: string) => void;
  onChangeCode?: (id: string, code: string) => void;
  highlight?: number;
  /** Monaco editor font size in px; forwarded to EditorPane. Defaults to 14. */
  fontSize?: number;
  editorRightControls?: React.ReactNode;
  editorFootnote?: React.ReactNode;

  // rail
  tests: TestRailItem[];
  activeTestId?: string;
  onSelectTest?: (id: string) => void;
  onRunTest?: (id: string) => void;
  onDebugTest?: (id: string) => void;
  /** Fired when the per-row "Edit body" button is clicked (edit mode only) */
  onEditTest?: (id: string) => void;
  onRunAll?: () => void;
  isRunningAll?: boolean;
  railTitle?: string;
  railMode?: 'run' | 'edit' | 'view';
  railSummary?: string;
  /** When true, renders a split-button "+ Add <kind> test" row at the bottom */
  railShowAdd?: boolean;
  /** Fired when the main add button or a menu item is clicked */
  onAddTest?: (kind: 'io' | 'pytest') => void;
  /**
   * Sticky default kind for the main add button label.
   * undefined → 'io' (first-use default).
   */
  lastCreatedKind?: 'io' | 'pytest';

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
  drawerEdit?: DrawerEdit;
  onDrawerEditChange?: (next: DrawerEdit) => void;

  // skin extras
  /** Optional row rendered between Ribbon (or shell top) and the editor/rail area */
  skinTopBar?: React.ReactNode;
  /** Optional row rendered after skinTopBar and before the editor/rail area (author skin: ProblemPropertiesBar) */
  propertiesBar?: React.ReactNode;
  /** When true, omits the Ribbon — host page provides its own chrome */
  embedded?: boolean;
}

// ─── WorkspaceShell ──────────────────────────────────────────────────────────

/**
 * WorkspaceShell — unified workspace surface consumed by all four host skins.
 *
 * Layout (non-embedded):
 *   Ribbon → skinTopBar? → propertiesBar? → [EditorPane (flex:1) | TestRail (340px)] → Drawer
 *
 * Layout (embedded):
 *   skinTopBar? → propertiesBar? → [EditorPane (flex:1) | TestRail (320px)] → Drawer
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
  ribbonEditable = false,
  onTitleChange,

  // editor
  editorTabs,
  activeTabId,
  onSelectTab,
  onChangeCode,
  highlight,
  fontSize,
  editorRightControls,
  editorFootnote,

  // rail
  tests,
  activeTestId,
  onSelectTest,
  onRunTest,
  onDebugTest,
  onEditTest,
  onRunAll,
  isRunningAll,
  railTitle,
  railMode,
  railSummary,
  railShowAdd = false,
  onAddTest,
  lastCreatedKind,

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
  drawerEdit,
  onDrawerEditChange,

  // extras
  skinTopBar,
  propertiesBar,
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
      {/* Ribbon —
       *  - Non-embedded: rendered (host doesn't provide its own ribbon).
       *  - Embedded + ribbonEditable: still rendered so author hosts can
       *    expose the editable-title affordance (eval-af7).
       *  - Embedded without ribbonEditable: omitted (host fully owns chrome).
       *
       *  The Ribbon's expand body (markdown preview of the statement) renders
       *  the same content that the statement.md editor tab edits in author
       *  hosts. That duplication is by design — the Ribbon body is rendered
       *  markdown (preview), the editor tab is raw markdown (source).
       */}
      {(!embedded || ribbonEditable) && (
        <Ribbon
          open={ribbonOpen}
          onToggle={onToggleRibbon ?? (() => {})}
          title={problemTitle}
          meta={problemMeta}
          body={statement}
          editable={ribbonEditable}
          onTitleChange={onTitleChange}
        />
      )}

      {/* Optional top bar between ribbon and editor (e.g. instructor student-switcher) */}
      {skinTopBar}

      {/* Optional properties bar between skinTopBar and editor (e.g. author ProblemPropertiesBar) */}
      {propertiesBar}

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
            fontSize={fontSize}
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
            onEditTest={onEditTest}
            onRunAll={onRunAll}
            isRunningAll={isRunningAll}
            title={railTitle}
            selectedSummary={railSummary}
            railShowAdd={railShowAdd}
            onAddTest={onAddTest}
            lastCreatedKind={lastCreatedKind}
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
        edit={drawerEdit}
        onEditChange={onDrawerEditChange}
      />
    </div>
  );
}

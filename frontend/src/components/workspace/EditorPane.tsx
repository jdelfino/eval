'use client';

import React, { useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import MarkdownContent from '@/components/MarkdownContent';

// ─── Types ──────────────────────────────────────────────────────────────────

export type EditorTabKind = 'code' | 'markdown';
export type CodeLanguage = 'python' | 'javascript' | 'java';

export type EditorTab =
  | {
      id: string;
      label: string;
      kind: 'code';
      language: CodeLanguage;
      code: string;
      readOnly?: boolean;
      dirty?: boolean;
      dark?: boolean;
      icon?: React.ReactNode;
    }
  | {
      id: string;
      label: string;
      kind: 'markdown';
      body: string;
      preview?: boolean;
      dirty?: boolean;
      dark?: boolean;
      icon?: React.ReactNode;
    };

export interface EditorPaneProps {
  tabs: EditorTab[];
  activeId?: string;
  onSelect?: (id: string) => void;
  onChangeCode?: (id: string, code: string) => void;
  /** Line number to highlight with the debugger-line decoration. */
  highlight?: number;
  rightControls?: React.ReactNode;
  footnote?: React.ReactNode;
  fontSize?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Whether a tab should use the dark (inverse) palette. Defaults to true for code tabs. */
function isDark(tab: EditorTab): boolean {
  return tab.dark !== false;
}

// ─── EditorPane ──────────────────────────────────────────────────────────────

export default function EditorPane({
  tabs,
  activeId,
  onSelect,
  onChangeCode,
  highlight,
  rightControls,
  footnote,
  fontSize,
}: EditorPaneProps) {
  // Resolve active tab: prefer the explicit activeId, fall back to first tab
  const activeTab = (activeId ? tabs.find((t) => t.id === activeId) : undefined) ?? tabs[0];

  const dark = activeTab ? isDark(activeTab) : true;

  const tabStripBorder = dark ? 'var(--border-inverse)' : 'var(--border)';
  const tabStripBg = dark ? 'var(--bg-inverse-raised)' : 'var(--bg-sunken)';
  const bodyBg = dark ? 'var(--bg-inverse)' : 'var(--bg)';
  const bodyColor = dark ? 'var(--fg-inverse)' : 'var(--fg)';

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: bodyBg,
        color: bodyColor,
      }}
    >
      {/* Tab strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          borderBottom: `1px solid ${tabStripBorder}`,
          background: tabStripBg,
          minHeight: 32,
          flexShrink: 0,
        }}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTab?.id;
          const tabDark = isDark(tab);
          return (
            <TabButton
              key={tab.id}
              tab={tab}
              active={active}
              dark={tabDark}
              onClick={() => onSelect?.(tab.id)}
            />
          );
        })}

        {/* Spacer pushes rightControls to the right */}
        <div style={{ flex: 1 }} />

        {rightControls && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 8px',
            }}
          >
            {rightControls}
          </div>
        )}
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          position: 'relative',
          minHeight: 0,
        }}
      >
        {activeTab ? (
          activeTab.kind === 'markdown' ? (
            <MarkdownBody tab={activeTab} />
          ) : (
            <CodeBody
              tab={activeTab}
              highlight={highlight}
              fontSize={fontSize}
              onChangeCode={onChangeCode}
            />
          )
        ) : null}

        {footnote && (
          <div
            data-footnote
            style={{
              position: 'absolute',
              right: 10,
              bottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 8px',
              borderRadius: 9,
              background:
                'color-mix(in oklch, var(--bg-inverse) 80%, transparent)',
              border: '1px solid var(--border-inverse)',
              color: 'var(--fg-inverse-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
            }}
          >
            {footnote}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TabButton ───────────────────────────────────────────────────────────────

interface TabButtonProps {
  tab: EditorTab;
  active: boolean;
  dark: boolean;
  onClick: () => void;
}

function TabButton({ tab, active, dark, onClick }: TabButtonProps) {
  const bg = active
    ? dark
      ? 'var(--bg-inverse)'
      : 'var(--bg)'
    : 'transparent';
  const borderRight = dark ? 'var(--border-inverse)' : 'var(--border)';
  const fg = active
    ? dark
      ? 'var(--fg-inverse)'
      : 'var(--fg)'
    : dark
      ? 'var(--fg-inverse-muted)'
      : 'var(--fg-muted)';

  return (
    <button
      type="button"
      data-testid={`editor-tab-${tab.id}`}
      onClick={onClick}
      aria-label={tab.label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 12px',
        height: 32,
        background: bg,
        border: 'none',
        borderRight: `1px solid ${borderRight}`,
        color: fg,
        fontFamily: 'var(--font-mono)',
        fontSize: 11.5,
        fontWeight: active ? 600 : 500,
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      {/* Accent top-border bar for active tab */}
      {active && (
        <span
          data-active-bar
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: 2,
            background: 'var(--accent)',
          }}
        />
      )}

      {tab.icon && (
        <span style={{ opacity: 0.75, display: 'inline-flex' }}>
          {tab.icon}
        </span>
      )}

      {tab.label}

      {tab.dirty && (
        <span
          data-dirty-dot
          style={{
            width: 5,
            height: 5,
            borderRadius: 3,
            background: 'var(--accent)',
            flexShrink: 0,
          }}
        />
      )}
    </button>
  );
}

// ─── MarkdownBody ────────────────────────────────────────────────────────────

interface MarkdownBodyProps {
  tab: Extract<EditorTab, { kind: 'markdown' }>;
}

function MarkdownBody({ tab }: MarkdownBodyProps) {
  const dark = isDark(tab);
  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '20px 28px',
        background: dark ? 'var(--bg-inverse)' : 'var(--bg)',
        color: dark ? 'var(--fg-inverse)' : 'var(--fg)',
      }}
    >
      <MarkdownContent content={tab.body} darkTheme={dark} />
    </div>
  );
}

// ─── CodeBody ────────────────────────────────────────────────────────────────

interface CodeBodyProps {
  tab: Extract<EditorTab, { kind: 'code' }>;
  highlight?: number;
  fontSize?: number;
  onChangeCode?: (id: string, code: string) => void;
}

function CodeBody({ tab, highlight, fontSize, onChangeCode }: CodeBodyProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<string[]>([]);

  // Apply debugger-line-highlight decoration whenever highlight changes
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    if (!highlight) {
      // Clear existing decorations
      const cleared = editor.deltaDecorations(decorationsRef.current, []);
      decorationsRef.current = cleared;
      return;
    }

    const newDecorations = editor.deltaDecorations(decorationsRef.current, [
      {
        range: {
          startLineNumber: highlight,
          startColumn: 1,
          endLineNumber: highlight,
          endColumn: 1,
        },
        options: {
          isWholeLine: true,
          className: 'debugger-line-highlight',
          glyphMarginClassName: 'debugger-line-glyph',
        },
      },
    ]);
    decorationsRef.current = newDecorations;
  }, [highlight]);

  // Unregister from window.__TEST_EDITORS on unmount. Registration happens in
  // handleEditorDidMount below; the e2e Monaco fixtures (frontend/e2e/fixtures/monaco.ts)
  // poll this array for programmatic access.
  useEffect(() => {
    return () => {
      const w = window as unknown as { __TEST_EDITORS?: Monaco.editor.IStandaloneCodeEditor[] };
      if (w.__TEST_EDITORS && editorRef.current) {
        const idx = w.__TEST_EDITORS.indexOf(editorRef.current);
        if (idx >= 0) w.__TEST_EDITORS.splice(idx, 1);
      }
    };
  }, []);

  const handleEditorDidMount = (editor: Monaco.editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
    const w = window as unknown as { __TEST_EDITORS?: Monaco.editor.IStandaloneCodeEditor[] };
    if (!w.__TEST_EDITORS) w.__TEST_EDITORS = [];
    w.__TEST_EDITORS.push(editor);
  };

  const handleChange = (value: string | undefined) => {
    onChangeCode?.(tab.id, value ?? '');
  };

  return (
    <Editor
      height="100%"
      language={tab.language}
      value={tab.code}
      onChange={handleChange}
      onMount={handleEditorDidMount}
      theme="vs-dark"
      options={{
        minimap: { enabled: false },
        fontSize: fontSize ?? 14,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        readOnly: tab.readOnly ?? false,
        folding: false,
        lineNumbersMinChars: 2,
        glyphMargin: !!highlight,
      }}
    />
  );
}

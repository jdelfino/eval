'use client';

import React, { useState, useRef } from 'react';
import MarkdownContent from '@/components/MarkdownContent';
import { Kbd } from '@/components/ui/Kbd';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RibbonProps {
  open: boolean;
  onToggle: () => void;
  title: string;
  /** Optional subtitle, e.g. "Python · last updated …" */
  meta?: string;
  /** Full markdown statement body */
  body: string;
  /**
   * Author-skin only: when true the title is click-to-edit.
   * Non-author skins (student, instructor, projector) omit this prop or pass false.
   */
  editable?: boolean;
  /** Called with the new title string when the author commits an edit. */
  onTitleChange?: (title: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract the first meaningful preview line from a markdown body.
 * Strips heading markers (#) and backticks from the first non-empty line.
 */
function firstPreviewLine(body: string): string {
  const lines = body.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip heading lines (start with #) and blank lines
    if (!trimmed || trimmed.startsWith('#')) continue;
    // Strip backticks and leading/trailing whitespace
    return trimmed.replace(/`/g, '');
  }
  // Fall back to stripping heading markers from the very first line
  return lines[0].replace(/^#+\s*/, '').replace(/`/g, '');
}

// ─── Editable title sub-component ────────────────────────────────────────────

interface EditableTitleProps {
  title: string;
  onTitleChange?: (title: string) => void;
}

function EditableTitle({ title, onTitleChange }: EditableTitleProps) {
  const [editing, setEditing] = useState(false);
  const [hovered, setHovered] = useState(false);
  // Track local display title so the component reflects committed edits immediately,
  // even if the parent hasn't yet re-rendered with the new prop value.
  const [displayTitle, setDisplayTitle] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep displayTitle in sync when the prop changes from outside
  React.useEffect(() => {
    setDisplayTitle(title);
  }, [title]);

  function commitEdit(value: string) {
    const trimmed = value.trim();
    if (trimmed && trimmed !== displayTitle) {
      onTitleChange?.(trimmed);
      setDisplayTitle(trimmed);
    }
    setEditing(false);
  }

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    setEditing(true);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      commitEdit(e.currentTarget.value);
    } else if (e.key === 'Escape') {
      setEditing(false);
    }
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    commitEdit(e.currentTarget.value);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        defaultValue={displayTitle}
        aria-label="Edit title"
        autoFocus
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--fg)',
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid var(--fg)',
          outline: 'none',
          padding: 0,
          minWidth: 80,
        }}
      />
    );
  }

  return (
    <div
      data-testid="ribbon-title-wrapper"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        cursor: 'text',
        borderBottom: hovered ? '1px dashed var(--border)' : '1px dashed transparent',
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
        {displayTitle}
      </span>
      {hovered && (
        <span
          data-testid="ribbon-title-pencil"
          aria-hidden="true"
          style={{ fontSize: 11, color: 'var(--fg-muted)' }}
        >
          ✏
        </span>
      )}
    </div>
  );
}

// ─── Ribbon ──────────────────────────────────────────────────────────────────

/**
 * Ribbon — collapsed peek strip / expanded markdown statement panel.
 *
 * Collapsed (open=false): 36px header with title + meta + first-line preview + ⌘1 Kbd + chevron.
 * Expanded (open=true): header (same) + body region (var(--bg-raised) bg, 14px 22px padding) with
 * MarkdownContent rendering the full statement.
 *
 * Max-height transition provides smooth open/close animation.
 *
 * When editable=true (author skin only), the title becomes click-to-edit:
 * hover shows a pencil glyph + dashed underline; click opens an <input>;
 * Enter or blur commits via onTitleChange; Esc reverts.
 */
export function Ribbon({ open, onToggle, title, meta, body, editable = false, onTitleChange }: RibbonProps) {
  const preview = firstPreviewLine(body);

  return (
    <div
      style={{
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-raised)',
        maxHeight: open ? 280 : 36,
        transition: 'max-height 200ms ease',
        overflow: 'hidden',
      }}
    >
      {/* Header row — always visible */}
      <div
        data-testid="ribbon-header"
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          height: 36,
          padding: '0 14px',
          cursor: 'pointer',
          flexShrink: 0,
          borderBottom: open ? '1px solid var(--border)' : 'none',
          background: 'var(--bg-raised)',
        }}
      >
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            color: 'var(--fg-muted)',
          }}
        >
          Problem
        </span>

        {editable ? (
          <EditableTitle title={title} onTitleChange={onTitleChange} />
        ) : (
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
            {title}
          </span>
        )}

        {meta && (
          <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
            · {meta}
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* First-line preview — only shown when collapsed */}
        {!open && (
          <span
            style={{
              fontSize: 11.5,
              color: 'var(--fg-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '55%',
            }}
          >
            {preview}
          </span>
        )}

        {/* Decorative hint. Actual ⌘1 binding deferred (G6 / post-G1). */}
        <Kbd>⌘1</Kbd>

        <span
          style={{
            color: 'var(--fg-muted)',
            fontSize: 13,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 160ms',
          }}
        >
          ⌃
        </span>
      </div>

      {/* Body — rendered only when expanded */}
      {open && (
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '14px 22px',
            background: 'var(--bg-raised)',
          }}
        >
          <MarkdownContent content={body} darkTheme={false} />
        </div>
      )}
    </div>
  );
}

export default Ribbon;

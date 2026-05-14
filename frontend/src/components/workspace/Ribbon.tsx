'use client';

import React from 'react';
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

// ─── Ribbon ──────────────────────────────────────────────────────────────────

/**
 * Ribbon — collapsed peek strip / expanded markdown statement panel.
 *
 * Collapsed (open=false): 36px header with title + meta + first-line preview + ⌘1 Kbd + chevron.
 * Expanded (open=true): header (same) + body region (var(--bg-raised) bg, 14px 22px padding) with
 * MarkdownContent rendering the full statement.
 *
 * Max-height transition provides smooth open/close animation.
 */
export function Ribbon({ open, onToggle, title, meta, body }: RibbonProps) {
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

        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
          {title}
        </span>

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

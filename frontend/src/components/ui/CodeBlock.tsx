'use client';

import * as React from 'react';

export interface CodeBlockProps {
  /** Code or diff text to render verbatim. */
  children: string;
  /** Accessible label for the block (e.g. "solution code", "diff"). */
  'aria-label'?: string;
  /** Additional class names appended to the pre element. */
  className?: string;
}

/**
 * CodeBlock — presentational inverse-background monospace code block.
 *
 * Renders `<pre><code>` with an inverse surface, monospace font, preserved
 * whitespace, and overflow scrolling. Presentation-only: it does not parse or
 * colorize content, so the same primitive serves a full source file (Solution
 * viewer) and unified-diff text (Replay) — any diff coloring is the caller's
 * concern via the content it passes in.
 */
export function CodeBlock({
  children,
  'aria-label': ariaLabel,
  className,
}: CodeBlockProps): React.ReactElement {
  return (
    <pre
      aria-label={ariaLabel}
      className={className}
      style={{
        margin: 0,
        background: 'var(--bg-inverse)',
        color: 'var(--fg-inverse)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '12px 14px',
        fontFamily: 'var(--font-mono)',
        fontSize: 12.5,
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        overflow: 'auto',
        maxWidth: '100%',
      }}
    >
      <code>{children}</code>
    </pre>
  );
}

export default CodeBlock;

'use client';

import * as React from 'react';

export interface EvalLogomarkProps {
  /** Glyph box size in px. Default: 26. */
  size?: number;
  /** Wordmark font-size in px. Default: 17. */
  wordmarkSize?: number;
  /** Whether to show the "Eval" wordmark. Default: true. */
  showWordmark?: boolean;
}

/**
 * EvalLogomark — brand mark for auth and public surfaces.
 * Renders the monogram glyph "e" in the accent color and optionally
 * the "Eval" serif wordmark.
 *
 * The container carries aria-label="Eval" so screen readers announce the
 * brand name regardless of which visual elements are shown.
 */
export function EvalLogomark({
  size = 26,
  wordmarkSize = 17,
  showWordmark = true,
}: EvalLogomarkProps): React.ReactElement {
  return (
    <div
      aria-label="Eval"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.2),
          background: 'var(--accent)',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          fontSize: Math.round(size * 0.54),
          color: 'var(--accent-fg)',
          flexShrink: 0,
        }}
      >
        e
      </div>
      {showWordmark && (
        <span
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: wordmarkSize,
            fontWeight: 500,
            letterSpacing: -0.3,
          }}
        >
          Eval
        </span>
      )}
    </div>
  );
}

export default EvalLogomark;

'use client';

import * as React from 'react';

export interface AuthCardProps {
  children: React.ReactNode;
  /** Additional inline styles to merge (e.g. marginTop). */
  style?: React.CSSProperties;
}

/**
 * AuthCard — shared auth-card recipe used by all G5 auth surfaces.
 *
 * Encapsulates: bg-raised background, 1px border (--border),
 * border-radius (--radius-lg), and 24–28px padding.
 *
 * T3/T4/T5 consume this instead of hand-rolling the recipe inline.
 */
export function AuthCard({ children, style }: AuthCardProps): React.ReactElement {
  return (
    <div
      style={{
        background: 'var(--bg-raised)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: 24,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export default AuthCard;

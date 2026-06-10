'use client';

import React from 'react';

export interface ChipProps {
  /** Label text for the chip. */
  children: React.ReactNode;
  /** Whether the chip is in the active (selected) state. */
  active?: boolean;
  /** Optional count displayed after the label. */
  count?: number;
  /** Click handler — when provided the chip renders as a button. */
  onClick?: () => void;
  /** Additional CSS class names. */
  className?: string;
  /** data-testid for testing. */
  'data-testid'?: string;
}

/**
 * Chip — token-driven toggleable chip for tag filters and section filters.
 *
 * active = accent soft background/border
 * inactive = bg-sunken background
 * height: 24px, border-radius: 12px (pill shape)
 * optional count rendered after label text
 */
export function Chip({
  children,
  active = false,
  count,
  onClick,
  className,
  'data-testid': testId,
}: ChipProps): React.ReactElement {
  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    height: 24,
    padding: '0 10px',
    borderRadius: 12,
    border: `1px solid ${active ? 'var(--accent-soft-border, var(--accent))' : 'var(--border)'}`,
    background: active ? 'var(--accent-soft, var(--bg-sunken))' : 'var(--bg-sunken)',
    color: active ? 'var(--accent-ink, var(--fg))' : 'var(--fg-muted)',
    fontSize: 11.5,
    fontWeight: active ? 600 : 500,
    cursor: onClick ? 'pointer' : 'default',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-sans)',
  };

  const content = (
    <>
      {children}
      {count !== undefined && (
        <span style={{ opacity: 0.7, fontSize: 11 }}>{count}</span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{ ...style, border: style.border as string }}
        className={className}
        data-testid={testId}
      >
        {content}
      </button>
    );
  }

  return (
    <span style={style} className={className} data-testid={testId}>
      {content}
    </span>
  );
}

export default Chip;

import React from 'react';

export interface KbdProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Kbd — keyboard shortcut chip.
 * Always renders as a semantic <kbd> element so screen readers
 * and keyboard-shortcut parsers identify it correctly.
 */
export function Kbd({ children, className }: KbdProps) {
  return (
    <kbd
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1px 5px',
        background: 'var(--bg-sunken)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        fontWeight: 500,
        color: 'var(--fg-muted)',
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </kbd>
  );
}

export default Kbd;

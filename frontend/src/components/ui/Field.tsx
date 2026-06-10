'use client';

import * as React from 'react';

export interface FieldProps {
  label?: string;
  hint?: string;
  /** When set, replaces hint text and renders in --danger color with role="alert". */
  error?: string;
  /** Optional right-aligned slot rendered next to the label. */
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * Field — label + hint/error wrapper for form controls.
 * Renders a <label> container with an optional label row (supporting a right-aligned
 * slot), the field children, and a hint/error line below.
 *
 * When `error` is set it takes precedence over `hint`, renders in --danger color,
 * and adds role="alert" for screen-reader announcement.
 */
export function Field({ label, hint, error, right, children, style }: FieldProps): React.ReactElement {
  const helpText = error ?? hint;

  return (
    <label style={{ display: 'block', marginBottom: 12, ...style }}>
      {(label || right) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 4,
          }}
        >
          {label && (
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)' }}>
              {label}
            </span>
          )}
          {right}
        </div>
      )}
      {children}
      {helpText && (
        <div
          role={error ? 'alert' : undefined}
          style={{
            fontSize: 11,
            marginTop: 4,
            color: error ? 'var(--danger)' : 'var(--fg-subtle)',
          }}
        >
          {helpText}
        </div>
      )}
    </label>
  );
}

export default Field;

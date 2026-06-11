import React from 'react';

export type PillTone = 'ok' | 'warn' | 'info' | 'danger' | 'neutral';

export interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
  mono?: boolean;
  /** Render a small static dot before the label (e.g. "Live" status). */
  dot?: boolean;
  children: React.ReactNode;
}

const TONE_BG: Record<PillTone, string> = {
  ok:      'var(--run-soft)',
  warn:    'var(--warn-soft)',
  info:    'var(--info-soft)',
  danger:  'var(--danger-soft)',
  neutral: 'var(--bg-sunken)',
};

const TONE_FG: Record<PillTone, string> = {
  ok:      'var(--run)',
  warn:    'var(--warn)',
  info:    'var(--info)',
  danger:  'var(--danger)',
  neutral: 'var(--fg-muted)',
};

/**
 * Pill — small badge for displaying kind labels, state signals, or counts.
 * Tone drives background and foreground via CSS design tokens.
 * Pass mono=true for code-like content (stdin/io labels).
 * Pass dot=true to render a small static dot indicator before the label.
 * Accepts all standard HTML span attributes (including data-testid).
 */
export function Pill({ tone = 'neutral', mono = false, dot = false, children, className, style, ...rest }: PillProps) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: dot ? 4 : undefined,
        padding: '2px 8px',
        borderRadius: 999,
        background: TONE_BG[tone],
        color: TONE_FG[tone],
        fontSize: 11,
        fontWeight: 600,
        fontFamily: mono ? 'var(--font-mono)' : undefined,
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...rest}
    >
      {dot && (
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: TONE_FG[tone],
          }}
        />
      )}
      {children}
    </span>
  );
}

export default Pill;

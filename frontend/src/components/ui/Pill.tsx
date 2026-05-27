import React from 'react';

export type PillTone = 'ok' | 'warn' | 'info' | 'danger' | 'neutral';

export interface PillProps {
  tone?: PillTone;
  mono?: boolean;
  children: React.ReactNode;
  className?: string;
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
 */
export function Pill({ tone = 'neutral', mono = false, children, className }: PillProps) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 999,
        background: TONE_BG[tone],
        color: TONE_FG[tone],
        fontSize: 11,
        fontWeight: 600,
        fontFamily: mono ? 'var(--font-mono)' : undefined,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

export default Pill;

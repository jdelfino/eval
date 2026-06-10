'use client';

import * as React from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { IconBtn } from './IconBtn';

export type BannerTone = 'info' | 'warn' | 'danger' | 'accent' | 'run';

export interface BannerProps {
  /** Visual tone of the banner. Default: 'info'. */
  tone?: BannerTone;
  /** Icon name from the icon set. Default: 'info'. */
  icon?: IconName;
  /** Bold lead text. */
  title: React.ReactNode;
  /** Muted continuation text rendered inline after the title. */
  body?: React.ReactNode;
  /** Optional action element (e.g. a retry button). */
  action?: React.ReactNode;
  /** When provided, renders a dismiss button that calls this handler. */
  onDismiss?: () => void;
}

const TONE_MAP: Record<BannerTone, { bg: string; fg: string }> = {
  info:   { bg: 'var(--info-soft)',   fg: 'var(--info)' },
  warn:   { bg: 'var(--warn-soft)',   fg: 'var(--warn)' },
  danger: { bg: 'var(--danger-soft)', fg: 'var(--danger)' },
  accent: { bg: 'var(--accent-soft)', fg: 'var(--accent-ink)' },
  run:    { bg: 'var(--run-soft)',    fg: 'var(--run)' },
};

/**
 * Banner — toned inline message strip.
 * Used for error, warning, info, accent, and run state messages.
 *
 * - danger/warn tones render with role="alert" for urgent screen-reader announcement
 * - info/accent/run tones render with role="status" for polite announcement
 * - Reuses Icon and IconBtn primitives for consistent token-driven styling
 */
export function Banner({
  tone = 'info',
  icon,
  title,
  body,
  action,
  onDismiss,
}: BannerProps): React.ReactElement {
  const t = TONE_MAP[tone];
  const isUrgent = tone === 'danger' || tone === 'warn';

  return (
    <div
      role={isUrgent ? 'alert' : 'status'}
      style={{
        background: t.bg,
        color: 'var(--fg)',
        padding: '10px 12px',
        borderRadius: 'var(--radius)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        fontSize: 12.5,
        lineHeight: 1.5,
      }}
    >
      <Icon
        name={icon ?? 'info'}
        size={14}
        style={{ color: t.fg, flexShrink: 0, marginTop: 2 }}
      />
      <div style={{ flex: 1 }}>
        <strong>{title}</strong>
        {body && (
          <span style={{ color: 'var(--fg-muted)', marginLeft: 6 }}>{body}</span>
        )}
        {action && <div style={{ marginTop: 6 }}>{action}</div>}
      </div>
      {onDismiss && (
        <IconBtn icon="x" title="Dismiss" onClick={onDismiss} />
      )}
    </div>
  );
}

export default Banner;

import React from 'react';

export type ConnectionStatus = 'live' | 'warming' | 'offline' | 'idle';

export interface ConnectionDotProps {
  status: ConnectionStatus;
  compact?: boolean;
}

const STATUS_MAP: Record<ConnectionStatus, { color: string; soft: string; label: string }> = {
  live:    { color: 'var(--run)',       soft: 'var(--run-soft)',    label: 'Live' },
  warming: { color: 'var(--warn)',      soft: 'var(--warn-soft)',   label: 'Warming up' },
  offline: { color: 'var(--danger)',    soft: 'var(--danger-soft)', label: 'Offline' },
  idle:    { color: 'var(--fg-subtle)', soft: 'var(--bg-sunken)',   label: 'Idle' },
};

/**
 * ConnectionDot — passive status indicator pill.
 * Pure presentational; no state. Compact variant renders a 7px dot only;
 * full variant renders a 22px-tall pill with an inner dot and label.
 */
export function ConnectionDot({ status, compact = false }: ConnectionDotProps): React.ReactElement {
  const s = STATUS_MAP[status] ?? STATUS_MAP.idle;

  if (compact) {
    return (
      <span
        title={s.label}
        style={{
          display: 'inline-block',
          width: 7,
          height: 7,
          borderRadius: 4,
          background: s.color,
          boxShadow: `0 0 0 3px ${s.soft}`,
        }}
      />
    );
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 22,
        padding: '0 8px',
        borderRadius: 11,
        background: s.soft,
        color: s.color,
        fontSize: 11,
        fontWeight: 500,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          background: s.color,
          flexShrink: 0,
        }}
      />
      {s.label}
    </span>
  );
}

export default ConnectionDot;

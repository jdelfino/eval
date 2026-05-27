import React from 'react';

export type DotState = 'pass' | 'fail' | 'running' | 'idle';

export interface StateDotProps {
  state: DotState;
  className?: string;
}

const STATE_COLOR: Record<DotState, string> = {
  pass:    'var(--run)',
  fail:    'var(--danger)',
  running: 'var(--accent)',
  idle:    'var(--fg-subtle)',
};

/**
 * StateDot — 6×6 px colored indicator for test case state.
 * Color is driven by CSS design tokens so theme changes propagate automatically.
 * Drift here (wrong token per state) gives users false pass/fail signals.
 */
export function StateDot({ state, className }: StateDotProps) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-block',
        width: '6px',
        height: '6px',
        borderRadius: '4px',
        background: STATE_COLOR[state],
        flexShrink: 0,
      }}
    />
  );
}

export default StateDot;

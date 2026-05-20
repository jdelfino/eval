import React from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';

export interface IconBtnProps {
  icon: IconName;
  /** Accessible label — used for both title attribute and aria-label. */
  title: string;
  onClick?: () => void;
  active?: boolean;
  /** Button width and height in pixels. Default 24. */
  size?: number;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * IconBtn — icon-only button wrapper.
 * Pure presentational; no internal state. Active state drives background,
 * border, and text color via CSS design tokens.
 */
export function IconBtn({
  icon,
  title,
  onClick,
  active = false,
  size = 24,
  disabled = false,
  className,
  style,
}: IconBtnProps): React.ReactElement {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={className}
      style={{
        width: size,
        height: size,
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: active ? 'var(--bg-sunken)' : 'transparent',
        color: active ? 'var(--fg)' : 'var(--fg-muted)',
        border: '1px solid ' + (active ? 'var(--border)' : 'transparent'),
        borderRadius: 'var(--radius)',
        cursor: disabled ? 'default' : 'pointer',
        flexShrink: 0,
        ...style,
      }}
    >
      <Icon name={icon} size={14} />
    </button>
  );
}

export default IconBtn;

import React from 'react';
import { Icon, type IconName } from './Icon';

/**
 * Tone controls the color of the icon circle.
 * - 'neutral': gray (default)
 * - 'info':    blue
 * - 'warn':    yellow
 * - 'danger':  red
 * - 'ok':      green
 */
export type EmptyStateTone = 'neutral' | 'info' | 'warn' | 'danger' | 'ok';

export interface EmptyStateProps {
  /**
   * Optional mono "code badge" chip rendered above the icon circle, e.g.
   * "404 · Not found". Used by the 404/403/500 error surfaces per
   * primitives-v4 EmptyFrame. Omit for ordinary empty states.
   */
  code?: string;
  /** Icon name from the ui/Icon set to display above the title. Defaults to 'book'. */
  icon?: IconName;
  /** Short headline */
  title: string;
  /** Supporting description text */
  body?: string;
  /** Primary action element (e.g. a Button or Link) */
  primary?: React.ReactNode;
  /** Optional secondary action element */
  secondary?: React.ReactNode;
  /** Tone that drives the icon circle color. Defaults to 'neutral'. */
  tone?: EmptyStateTone;
  /** Additional CSS classes applied to the root element */
  className?: string;
}

// All five tones are folded onto mapped token utilities (the redesign standard):
// circle background → bg-* soft tokens, icon color → matching text-* token.
const TONE_CIRCLE_BG: Record<EmptyStateTone, string> = {
  neutral: 'bg-bg-sunken',
  info:    'bg-info-soft',
  warn:    'bg-warn-soft',
  danger:  'bg-danger-soft',
  ok:      'bg-run-soft',
};

const TONE_ICON_COLOR: Record<EmptyStateTone, string> = {
  neutral: 'text-fg-subtle',
  info:    'text-info',
  warn:    'text-warn',
  danger:  'text-danger',
  ok:      'text-run',
};

/**
 * EmptyState — shared empty-list / zero-state pattern.
 * Renders an icon, title, optional body text, and optional primary/secondary actions.
 * Tone drives the icon circle colors per primitives-v4 EmptyFrame spec.
 *
 * @example
 * ```tsx
 * <EmptyState
 *   icon="book"
 *   title="No sections yet"
 *   body="Join a section using a code from your instructor."
 *   primary={<Link href="/sections/join">Join a Section</Link>}
 * />
 * ```
 */
export function EmptyState({
  code,
  icon = 'book',
  title,
  body,
  primary,
  secondary,
  tone = 'neutral',
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-12 text-center ${className}`.trim()}
    >
      {code && (
        <span
          className="mb-3 font-mono text-xs font-semibold uppercase tracking-wide text-fg-subtle"
        >
          {code}
        </span>
      )}
      <div
        data-testid="empty-state-icon-circle"
        className={`mb-4 flex h-16 w-16 items-center justify-center rounded-full ${TONE_CIRCLE_BG[tone]}`}
      >
        <Icon
          name={icon}
          size={28}
          stroke={1.5}
          className={TONE_ICON_COLOR[tone]}
        />
      </div>
      <h2 className="mb-2 text-lg font-semibold text-fg">{title}</h2>
      {body && (
        <p className="mb-6 max-w-sm text-sm text-fg-muted">{body}</p>
      )}
      {primary}
      {secondary && <div className="mt-2">{secondary}</div>}
    </div>
  );
}

export default EmptyState;

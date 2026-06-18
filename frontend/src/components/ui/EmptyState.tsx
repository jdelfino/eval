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
  /** Supporting description text (v4 vocabulary: "body"; "blurb" is kept as alias) */
  body?: string;
  /** @deprecated Use `body` instead */
  blurb?: string;
  /** Primary action element (e.g. a Button or Link) */
  primary?: React.ReactNode;
  /** @deprecated Use `primary` instead */
  action?: React.ReactNode;
  /** Optional secondary action element */
  secondary?: React.ReactNode;
  /** Tone that drives the icon circle color. Defaults to 'neutral'. */
  tone?: EmptyStateTone;
  /** Additional CSS classes applied to the root element */
  className?: string;
}

// G9 token sweep (this slice): only the gray (neutral) and green (ok) tones are
// folded onto F1 tokens (--bg-sunken / --run, matching the Pill/Banner recipe).
// info/warn/danger keep their blue/yellow/red Tailwind utilities — converging
// those is out of this slice's gray/green scope (own follow-up).
const TONE_CIRCLE_BG: Record<EmptyStateTone, string> = {
  neutral: 'var(--bg-sunken)',
  info:    'bg-blue-100',
  warn:    'bg-yellow-100',
  danger:  'bg-red-100',
  ok:      'var(--run-soft)',
};

const TONE_ICON_COLOR: Record<EmptyStateTone, string> = {
  neutral: 'var(--fg-subtle)',
  info:    'text-blue-500',
  warn:    'text-yellow-500',
  danger:  'text-red-500',
  ok:      'var(--run)',
};

// neutral/ok map to CSS-var token values applied via inline style; the other
// tones stay Tailwind className strings. A value starting with "var(" is a token.
const isToken = (v: string) => v.startsWith('var(');

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
  blurb,
  primary,
  action,
  secondary,
  tone = 'neutral',
  className = '',
}: EmptyStateProps) {
  const bodyText = body ?? blurb;
  const primaryAction = primary ?? action;

  return (
    <div
      className={`flex flex-col items-center justify-center py-12 text-center ${className}`.trim()}
    >
      {code && (
        <span
          className="mb-3 font-mono text-xs font-semibold uppercase tracking-wide"
          style={{ color: 'var(--fg-subtle)' }}
        >
          {code}
        </span>
      )}
      <div
        data-testid="empty-state-icon-circle"
        className={`mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
          isToken(TONE_CIRCLE_BG[tone]) ? '' : TONE_CIRCLE_BG[tone]
        }`.trim()}
        style={isToken(TONE_CIRCLE_BG[tone]) ? { background: TONE_CIRCLE_BG[tone] } : undefined}
      >
        <Icon
          name={icon}
          size={28}
          stroke={1.5}
          className={isToken(TONE_ICON_COLOR[tone]) ? undefined : TONE_ICON_COLOR[tone]}
          style={isToken(TONE_ICON_COLOR[tone]) ? { color: TONE_ICON_COLOR[tone] } : undefined}
        />
      </div>
      <h2 className="mb-2 text-lg font-semibold" style={{ color: 'var(--fg)' }}>{title}</h2>
      {bodyText && (
        <p className="mb-6 max-w-sm text-sm" style={{ color: 'var(--fg-muted)' }}>{bodyText}</p>
      )}
      {primaryAction}
      {secondary && <div className="mt-2">{secondary}</div>}
    </div>
  );
}

export default EmptyState;

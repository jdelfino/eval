import React from 'react';
import { Icon, type IconName } from './Icon';

export interface EmptyStateProps {
  /** Icon name from the ui/Icon set to display above the title. Defaults to 'book'. */
  icon?: IconName;
  /** Short headline */
  title: string;
  /** Supporting description text */
  blurb?: string;
  /** Optional action element (e.g. a Button or Link) */
  action?: React.ReactNode;
  /** Additional CSS classes applied to the root element */
  className?: string;
}

/**
 * EmptyState — shared empty-list / zero-state pattern.
 * Renders an icon, title, optional blurb, and optional action.
 *
 * @example
 * ```tsx
 * <EmptyState
 *   icon="book"
 *   title="No sections yet"
 *   blurb="Join a section using a code from your instructor."
 *   action={<Link href="/sections/join">Join a Section</Link>}
 * />
 * ```
 */
export function EmptyState({ icon = 'book', title, blurb, action, className = '' }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-12 text-center ${className}`.trim()}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
        <Icon name={icon} size={28} stroke={1.5} className="text-gray-400" />
      </div>
      <h2 className="mb-2 text-lg font-semibold text-gray-900">{title}</h2>
      {blurb && <p className="mb-6 max-w-sm text-sm text-gray-500">{blurb}</p>}
      {action}
    </div>
  );
}

export default EmptyState;

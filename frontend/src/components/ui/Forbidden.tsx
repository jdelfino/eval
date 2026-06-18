import React from 'react';
import { EmptyState } from './EmptyState';
import type { IconName } from './Icon';

export interface ForbiddenProps {
  /** Headline for the permission-denied surface. */
  title: string;
  /** Supporting copy explaining the denial. */
  body?: string;
  /** Code badge text. Defaults to "403 · Forbidden". */
  code?: string;
  /** Icon name. Defaults to "lock". */
  icon?: IconName;
  /** Primary action element (e.g. a Button or Link). */
  primary?: React.ReactNode;
  /** Optional secondary action element. */
  secondary?: React.ReactNode;
  /** Additional CSS classes applied to the root element. */
  className?: string;
}

/**
 * Forbidden — reusable 403 / permission-denied surface built on EmptyState.
 *
 * Warn tone, lock icon, "403 · …" code badge. Use this for any genuine
 * permission-denied screen (caller supplies title/body/actions).
 *
 * NOTE: this is intentionally NOT wired into the join flow. The backend join
 * path has no 403 — a bad code is a 404 and an inactive section is a 400 — so
 * the join surface uses its own invalid/unavailable state, not this component.
 *
 * @example
 * ```tsx
 * <Forbidden
 *   title="You don't have access to this section."
 *   body="Ask an instructor to add you."
 *   primary={<Button variant="accent" asChild><Link href="/">Back home</Link></Button>}
 * />
 * ```
 */
export function Forbidden({
  title,
  body,
  code = '403 · Forbidden',
  icon = 'lock',
  primary,
  secondary,
  className,
}: ForbiddenProps) {
  return (
    <EmptyState
      code={code}
      icon={icon}
      tone="warn"
      title={title}
      body={body}
      primary={primary}
      secondary={secondary}
      className={className}
    />
  );
}

export default Forbidden;

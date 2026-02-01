'use client';

import React from 'react';
import { Badge, BadgeVariant } from './Badge';
import { cn } from '@/lib/utils';

/**
 * Status-specific variants for StatusBadge
 */
export type StatusBadgeStatus = 'pending' | 'active' | 'expired' | 'revoked' | 'consumed';

/**
 * Props for StatusBadge component
 */
export interface StatusBadgeProps {
  /** The status to display */
  status: StatusBadgeStatus;
  /** Additional CSS classes */
  className?: string;
  /** Optional custom label - defaults to capitalized status */
  children?: React.ReactNode;
}

/**
 * Mapping from status to Badge variant
 */
const statusToVariant: Record<StatusBadgeStatus, BadgeVariant> = {
  pending: 'warning',
  active: 'success',
  expired: 'default',
  revoked: 'error',
  consumed: 'info',
};

/**
 * Default labels for each status
 */
const statusLabels: Record<StatusBadgeStatus, string> = {
  pending: 'Pending',
  active: 'Active',
  expired: 'Expired',
  revoked: 'Revoked',
  consumed: 'Consumed',
};

/**
 * StatusBadge component - a semantic wrapper around Badge for status display
 *
 * Features:
 * - Extends Badge with status-specific semantics
 * - Maps statuses to appropriate colors:
 *   - pending: warning (yellow)
 *   - active: success (green)
 *   - expired: default (gray)
 *   - revoked: error (red)
 *   - consumed: info (blue)
 * - Default labels based on status, with optional override
 *
 * @example
 * ```tsx
 * // Using default labels
 * <StatusBadge status="active" />     // Shows "Active" in green
 * <StatusBadge status="pending" />    // Shows "Pending" in yellow
 * <StatusBadge status="expired" />    // Shows "Expired" in gray
 *
 * // Custom label
 * <StatusBadge status="active">Online</StatusBadge>
 * ```
 */
export function StatusBadge({ status, className, children }: StatusBadgeProps) {
  const variant = statusToVariant[status];
  const label = children ?? statusLabels[status];

  return (
    <Badge variant={variant} className={cn(className)}>
      {label}
    </Badge>
  );
}

export default StatusBadge;

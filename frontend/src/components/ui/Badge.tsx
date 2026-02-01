'use client';

import React from 'react';

/**
 * Badge variant options
 */
export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

/**
 * Props for Badge component
 */
export interface BadgeProps {
  /** Content to display inside the badge */
  children: React.ReactNode;
  /** Visual variant for the badge */
  variant?: BadgeVariant;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Variant style mappings using semantic colors from tailwind.config.js
 */
const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-gray-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  error: 'bg-error-50 text-error-700',
  info: 'bg-info-50 text-info-700',
};

/**
 * Status badge component for displaying labels and states
 *
 * Features:
 * - Five variants: default, success, warning, error, info
 * - Uses semantic colors defined in tailwind.config.js
 * - Rounded-full pill shape
 * - Compact padding with small text
 *
 * @example
 * ```tsx
 * <Badge variant="success">Active</Badge>
 * <Badge variant="error">Failed</Badge>
 * <Badge variant="warning">Pending</Badge>
 * <Badge variant="info">New</Badge>
 * <Badge>Default</Badge>
 * ```
 */
export function Badge({
  children,
  variant = 'default',
  className = '',
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export default Badge;

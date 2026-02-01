'use client';

import React from 'react';
import Link from 'next/link';

export type BackButtonSize = 'sm' | 'md' | 'lg';

export interface BackButtonProps {
  /** Link destination - use this for static navigation */
  href?: string;
  /** Click handler - use this for dynamic navigation or callback-based navigation */
  onClick?: () => void;
  /** Button text (default: "Back") */
  children?: React.ReactNode;
  /** Size variant */
  size?: BackButtonSize;
  /** Additional CSS classes */
  className?: string;
}

const sizeClasses: Record<BackButtonSize, { text: string; icon: string; padding: string }> = {
  sm: { text: 'text-sm', icon: 'w-4 h-4', padding: 'py-1' },
  md: { text: 'text-sm', icon: 'w-5 h-5', padding: 'py-1.5' },
  lg: { text: 'text-base', icon: 'w-5 h-5', padding: 'py-2' },
};

/**
 * BackButton component for consistent back navigation across the app.
 *
 * Features:
 * - Supports both Link-based (href) and button-based (onClick) navigation
 * - Includes a left chevron icon for visual consistency
 * - Integrates with the design system's color scheme
 * - Works alongside Breadcrumb component for navigation context
 *
 * @example
 * ```tsx
 * // Link-based navigation
 * <BackButton href="/classes">Back to Classes</BackButton>
 *
 * // Callback-based navigation
 * <BackButton onClick={() => router.back()}>Back</BackButton>
 *
 * // Custom size
 * <BackButton href="/home" size="lg">Back to Home</BackButton>
 * ```
 */
export function BackButton({
  href,
  onClick,
  children = 'Back',
  size = 'md',
  className = '',
}: BackButtonProps) {
  const { text, icon, padding } = sizeClasses[size];

  const baseClasses = [
    'inline-flex',
    'items-center',
    'gap-1',
    text,
    padding,
    'text-gray-600',
    'hover:text-gray-900',
    'transition-colors',
    'font-medium',
    'focus:outline-none',
    'focus:ring-2',
    'focus:ring-indigo-500',
    'focus:ring-offset-2',
    'rounded',
  ].join(' ');

  const classes = `${baseClasses} ${className}`.trim();

  const ChevronIcon = (
    <svg
      className={icon}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 19l-7-7 7-7"
      />
    </svg>
  );

  const content = (
    <>
      {ChevronIcon}
      <span>{children}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={classes}>
      {content}
    </button>
  );
}

export default BackButton;

'use client';

import React from 'react';

/**
 * Spinner size options
 */
export type SpinnerSize = 'sm' | 'md' | 'lg';

/**
 * Props for Spinner component
 */
export interface SpinnerProps {
  /** Size of the spinner (sm, md, lg) */
  size?: SpinnerSize;
  /** Optional accessible label for screen readers */
  label?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Size mappings for spinner dimensions
 */
const sizeClasses: Record<SpinnerSize, string> = {
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-3',
};

/**
 * Loading spinner component with configurable sizes
 *
 * Features:
 * - Three size options: sm, md, lg
 * - Uses Tailwind's animate-spin for smooth rotation
 * - Optional accessible label for screen readers
 * - Border-based spinner with brand color
 *
 * @example
 * ```tsx
 * <Spinner size="md" />
 * <Spinner size="lg" label="Loading content..." />
 * ```
 */
export function Spinner({
  size = 'md',
  label,
  className = '',
}: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label={label || 'Loading'}
      className={`inline-flex items-center ${className}`}
    >
      <div
        className={`animate-spin rounded-full border-brand-600 border-t-transparent ${sizeClasses[size]}`}
        aria-hidden="true"
      />
      {label && (
        <span className="ml-2 text-sm text-gray-600">{label}</span>
      )}
      {!label && (
        <span className="sr-only">Loading</span>
      )}
    </div>
  );
}

export default Spinner;

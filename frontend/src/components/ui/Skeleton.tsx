'use client';

import React from 'react';

/**
 * Props for Skeleton component
 */
export interface SkeletonProps {
  /** Additional CSS classes for customizing dimensions and shape */
  className?: string;
  /** Whether to use rounded corners (default: true) */
  rounded?: boolean;
}

/**
 * Loading placeholder component with pulse animation
 *
 * Features:
 * - Animated pulse effect for loading indication
 * - Configurable width/height via className
 * - Optional rounded corners
 * - Can be used for text lines, cards, or custom shapes
 *
 * @example
 * ```tsx
 * // Text line placeholder
 * <Skeleton className="h-4 w-32" />
 *
 * // Full-width card placeholder
 * <Skeleton className="h-20 w-full" />
 *
 * // Avatar placeholder (circular)
 * <Skeleton className="h-10 w-10 rounded-full" />
 *
 * // Multiple lines for content
 * <div className="space-y-2">
 *   <Skeleton className="h-4 w-3/4" />
 *   <Skeleton className="h-4 w-full" />
 *   <Skeleton className="h-4 w-1/2" />
 * </div>
 * ```
 */
export function Skeleton({
  className = '',
  rounded = true,
}: SkeletonProps) {
  const roundedClass = rounded ? 'rounded' : '';

  return (
    <div
      className={`animate-pulse bg-bg-sunken ${roundedClass} ${className}`}
      aria-hidden="true"
      role="presentation"
    />
  );
}

/**
 * Pre-configured skeleton for text content
 */
export function SkeletonText({
  lines = 3,
  className = '',
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true" role="presentation">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={`h-4 ${index === lines - 1 ? 'w-3/4' : 'w-full'}`}
        />
      ))}
    </div>
  );
}

/**
 * Pre-configured skeleton for avatar
 */
export function SkeletonAvatar({
  size = 'md',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
  };

  return (
    <Skeleton
      className={`rounded-full ${sizeClasses[size]} ${className}`}
    />
  );
}

/**
 * Pre-configured skeleton for a bordered/raised card region.
 *
 * Composed shimmer block matching the LoadingDashboardAE card panels
 * (a raised, bordered box with a few stacked shimmer lines). Used by the
 * G9 loading surfaces (dashboard / section overview / library) so each
 * route skeleton composes from shared presets instead of hand-rolling.
 *
 * @example
 * ```tsx
 * <SkeletonCard lines={3} />
 * ```
 */
export function SkeletonCard({
  lines = 3,
  className = '',
}: {
  /** Number of inner shimmer lines (default: 3) */
  lines?: number;
  className?: string;
}) {
  return (
    <div
      className={`space-y-3 rounded-lg border border-border bg-bg-raised p-4 ${className}`.trim()}
      aria-hidden="true"
      role="presentation"
    >
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={`h-3 ${index === 0 ? 'w-1/3' : index === lines - 1 ? 'w-1/2' : 'w-full'}`}
        />
      ))}
    </div>
  );
}

/**
 * Pre-configured skeleton for a single table/list row.
 *
 * Horizontal arrangement of shimmer chips matching the LoadingDashboardAE
 * list rows: a leading label, a flexible spacer, then trailing meta + a
 * pill + a button chip. Compose several into a list panel.
 *
 * @example
 * ```tsx
 * {[1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)}
 * ```
 */
export function SkeletonRow({
  className = '',
}: {
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 py-2.5 ${className}`.trim()}
      aria-hidden="true"
      role="presentation"
    >
      <Skeleton className="h-3 w-36" />
      <div className="flex-1" />
      <Skeleton className="h-2.5 w-12" />
      <Skeleton className="h-5 w-16 rounded-full" />
      <Skeleton className="h-6 w-20" />
    </div>
  );
}

export default Skeleton;

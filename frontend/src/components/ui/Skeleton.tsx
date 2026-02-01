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
      className={`animate-pulse bg-gray-200 ${roundedClass} ${className}`}
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

export default Skeleton;

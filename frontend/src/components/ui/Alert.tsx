'use client';

import React, { forwardRef, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Alert variant options
 */
export type AlertVariant = 'error' | 'warning' | 'success' | 'info';

/**
 * Props for Alert component
 */
export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  /** Visual style variant */
  variant?: AlertVariant;
  /** Whether to show a dismiss button */
  dismissible?: boolean;
  /** Callback when dismiss button is clicked */
  onDismiss?: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Alert content */
  children: React.ReactNode;
}

/**
 * Variant style mappings using semantic colors from tailwind.config.js
 */
const variantStyles: Record<AlertVariant, { container: string; icon: string }> = {
  error: {
    container: 'bg-error-50 border-error-200 text-error-800',
    icon: 'text-error-500',
  },
  warning: {
    container: 'bg-warning-50 border-warning-200 text-warning-800',
    icon: 'text-warning-500',
  },
  success: {
    container: 'bg-success-50 border-success-200 text-success-800',
    icon: 'text-success-500',
  },
  info: {
    container: 'bg-info-50 border-info-200 text-info-800',
    icon: 'text-info-500',
  },
};

/**
 * SVG icons for each variant
 */
const variantIcons: Record<AlertVariant, React.ReactNode> = {
  error: (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
        clipRule="evenodd"
      />
    </svg>
  ),
  warning: (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  ),
  success: (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
        clipRule="evenodd"
      />
    </svg>
  ),
  info: (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
        clipRule="evenodd"
      />
    </svg>
  ),
};

/**
 * Alert component - displays contextual feedback messages
 *
 * Features:
 * - Four variants: error, warning, success, info
 * - Uses semantic colors defined in tailwind.config.js
 * - Optional dismiss button with callback
 * - Includes variant-specific icons
 * - Accessible with proper roles
 *
 * @example
 * ```tsx
 * // Basic usage
 * <Alert variant="success">Your changes have been saved.</Alert>
 *
 * // Dismissible alert
 * <Alert
 *   variant="error"
 *   dismissible
 *   onDismiss={() => setShowAlert(false)}
 * >
 *   Something went wrong. Please try again.
 * </Alert>
 *
 * // With custom content
 * <Alert variant="warning">
 *   <strong>Warning:</strong> This action cannot be undone.
 * </Alert>
 * ```
 */
export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ variant = 'info', dismissible = false, onDismiss, className, children, ...props }, ref) => {
    const styles = variantStyles[variant];
    const icon = variantIcons[variant];

    return (
      <div
        ref={ref}
        role="alert"
        className={cn(
          'flex items-start gap-3 p-4 rounded-lg border',
          styles.container,
          className
        )}
        {...props}
      >
        <span className={cn('flex-shrink-0', styles.icon)}>{icon}</span>
        <div className="flex-1 text-sm">{children}</div>
        {dismissible && (
          <button
            type="button"
            onClick={onDismiss}
            className={cn(
              'flex-shrink-0 p-1 rounded hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-offset-2',
              styles.icon
            )}
            aria-label="Dismiss"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        )}
      </div>
    );
  }
);
Alert.displayName = 'Alert';

export default Alert;

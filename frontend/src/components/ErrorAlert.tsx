'use client';

import React from 'react';
import Link from 'next/link';
import { classifyError, ErrorCategory, RecoveryAction } from '@/lib/error-messages';

/**
 * Props for ErrorAlert component
 */
export interface ErrorAlertProps {
  /** Error to display (Error object or string message) */
  error: Error | string;
  /** Title for the error alert (optional, uses default based on category) */
  title?: string;
  /** Callback when retry button is clicked (if provided, shows retry button) */
  onRetry?: () => void;
  /** Callback when dismiss button is clicked (if provided, shows dismiss button) */
  onDismiss?: () => void;
  /** Loading state for retry button */
  isRetrying?: boolean;
  /** Whether to show the technical error message (default: false in production) */
  showTechnical?: boolean;
  /** Whether to show recovery actions (default: true) */
  showRecoveryActions?: boolean;
  /** Whether to show help text (default: true) */
  showHelpText?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Variant for styling (default: 'error') */
  variant?: 'error' | 'warning' | 'info';
}

/**
 * Default titles for error categories
 */
const categoryTitles: Record<ErrorCategory, string> = {
  network: 'Connection Error',
  timeout: 'Request Timeout',
  auth: 'Authentication Required',
  permission: 'Permission Denied',
  validation: 'Invalid Input',
  notFound: 'Not Found',
  conflict: 'Conflict',
  server: 'Server Error',
  unknown: 'Error',
};

/**
 * Styling for different variants
 */
const variantStyles = {
  error: {
    container: 'bg-red-50 border-red-200 text-red-700',
    title: 'text-red-800',
    button: 'border-red-300 text-red-700 hover:bg-red-100',
    spinner: 'border-red-600',
  },
  warning: {
    container: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    title: 'text-yellow-800',
    button: 'border-yellow-300 text-yellow-700 hover:bg-yellow-100',
    spinner: 'border-yellow-600',
  },
  info: {
    container: 'bg-blue-50 border-blue-200 text-blue-700',
    title: 'text-blue-800',
    button: 'border-blue-300 text-blue-700 hover:bg-blue-100',
    spinner: 'border-blue-600',
  },
};

/**
 * Reusable error alert component with consistent styling
 *
 * Features:
 * - Automatic error classification for user-friendly messages
 * - Optional retry button for retryable errors
 * - Recovery action links (e.g., "Sign In", "Go Home")
 * - Optional dismiss button
 * - Help text explaining what went wrong
 * - Multiple style variants (error, warning, info)
 * - Accessible with proper ARIA attributes
 *
 * @example
 * ```tsx
 * <ErrorAlert
 *   error={new Error('Network error')}
 *   onRetry={() => loadData()}
 *   onDismiss={() => setError(null)}
 * />
 * ```
 */
export function ErrorAlert({
  error,
  title,
  onRetry,
  onDismiss,
  isRetrying = false,
  showTechnical = false,
  showRecoveryActions = true,
  showHelpText = true,
  className = '',
  variant = 'error',
}: ErrorAlertProps) {
  const classified = classifyError(error);
  const displayTitle = title || categoryTitles[classified.category];
  const styles = variantStyles[variant];

  // Determine if we should show the retry button (from onRetry prop or recovery actions)
  const showRetryButton = onRetry && classified.isRetryable;

  // Get link-type recovery actions to show
  const linkActions = showRecoveryActions
    ? classified.recoveryActions.filter((action): action is RecoveryAction & { href: string } =>
        action.type === 'link' && !!action.href
      )
    : [];

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`border rounded-lg p-4 ${styles.container} ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {/* Error icon */}
            <svg
              className="w-5 h-5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <p className={`font-semibold ${styles.title}`}>{displayTitle}</p>
          </div>
          <p className="mt-1 text-sm">{classified.userMessage}</p>
          {showHelpText && classified.helpText && (
            <p className="mt-1 text-xs opacity-75">
              {classified.helpText}
            </p>
          )}
          {showTechnical && classified.technicalMessage !== classified.userMessage && (
            <p className="mt-1 text-xs opacity-75 font-mono">
              Technical: {classified.technicalMessage}
            </p>
          )}
          {/* Recovery action links */}
          {linkActions.length > 0 && (
            <div className="mt-2 flex gap-2">
              {linkActions.map((action, index) => (
                <Link
                  key={index}
                  href={action.href}
                  className={`text-sm font-medium underline hover:no-underline ${styles.title}`}
                >
                  {action.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {showRetryButton && (
            <button
              onClick={onRetry}
              disabled={isRetrying}
              className={`px-3 py-1.5 text-sm font-medium border rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${styles.button}`}
              aria-label={isRetrying ? 'Retrying...' : 'Try again'}
            >
              {isRetrying ? (
                <span className="flex items-center gap-1.5">
                  <span
                    className={`animate-spin w-3.5 h-3.5 border-2 border-t-transparent rounded-full ${styles.spinner}`}
                    aria-hidden="true"
                  />
                  Retrying...
                </span>
              ) : (
                'Try Again'
              )}
            </button>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className={`p-1.5 rounded-md transition-colors ${styles.button}`}
              aria-label="Dismiss error"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ErrorAlert;

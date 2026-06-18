'use client';

import React from 'react';
import Link from 'next/link';
import { classifyError, ErrorCategory, RecoveryAction } from '@/lib/error-messages';
import { Banner, type BannerTone } from '@/components/ui/Banner';
import type { IconName } from '@/components/ui/Icon';

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
  /** Additional CSS classes applied to the wrapper element */
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
  'warming-up': 'Code Runner Starting Up',
  unknown: 'Error',
};

/**
 * Maps the ErrorAlert variant to the Banner tone + icon. ErrorAlert is now a
 * thin classification wrapper around the single token-driven Banner primitive;
 * it no longer hand-rolls its own toned message strip.
 */
const variantToBanner: Record<NonNullable<ErrorAlertProps['variant']>, { tone: BannerTone; icon: IconName }> = {
  error: { tone: 'danger', icon: 'alert' },
  warning: { tone: 'warn', icon: 'alert' },
  info: { tone: 'info', icon: 'info' },
};

/**
 * Reusable error alert component with consistent styling.
 *
 * Adds error classification (user-friendly messages, recovery links, retry
 * gating, help text) on top of the shared {@link Banner} primitive, which
 * provides the actual token-driven message-strip presentation. Banner is the
 * one and only message-strip primitive; ErrorAlert composes it.
 *
 * Features:
 * - Automatic error classification for user-friendly messages
 * - Optional retry button for retryable errors
 * - Recovery action links (e.g., "Sign In", "Go Home")
 * - Optional dismiss button
 * - Help text explaining what went wrong
 * - Multiple style variants (error, warning, info)
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
  const { tone, icon } = variantToBanner[variant];

  // Determine if we should show the retry button (from onRetry prop or recovery actions)
  const showRetryButton = onRetry && classified.isRetryable;

  // Get link-type recovery actions to show
  const linkActions = showRecoveryActions
    ? classified.recoveryActions.filter((action): action is RecoveryAction & { href: string } =>
        action.type === 'link' && !!action.href
      )
    : [];

  const showTechnicalMessage =
    showTechnical && classified.technicalMessage !== classified.userMessage;

  const body = (
    <>
      <span>{classified.userMessage}</span>
      {showHelpText && classified.helpText && (
        <span style={{ display: 'block', marginTop: 4, opacity: 0.85 }}>
          {classified.helpText}
        </span>
      )}
      {showTechnicalMessage && (
        <span
          style={{ display: 'block', marginTop: 4, opacity: 0.85, fontFamily: 'monospace' }}
        >
          Technical: {classified.technicalMessage}
        </span>
      )}
      {linkActions.length > 0 && (
        <span style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {linkActions.map((action, index) => (
            <Link
              key={index}
              href={action.href}
              style={{ fontWeight: 600, color: 'var(--fg)', textDecoration: 'underline' }}
            >
              {action.label}
            </Link>
          ))}
        </span>
      )}
    </>
  );

  const retryButton = showRetryButton ? (
    <button
      type="button"
      onClick={onRetry}
      disabled={isRetrying}
      aria-label={isRetrying ? 'Retrying...' : 'Try again'}
      style={{
        background: 'none',
        border: 'none',
        color: 'var(--fg)',
        fontWeight: 600,
        cursor: isRetrying ? 'default' : 'pointer',
        padding: 0,
        fontSize: 12,
        opacity: isRetrying ? 0.5 : 1,
      }}
    >
      {isRetrying ? 'Retrying...' : 'Try Again'}
    </button>
  ) : undefined;

  return (
    <div className={className}>
      <Banner
        tone={tone}
        icon={icon}
        title={displayTitle}
        body={body}
        action={retryButton}
        onDismiss={onDismiss}
      />
    </div>
  );
}

export default ErrorAlert;

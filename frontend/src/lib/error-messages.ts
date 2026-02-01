/**
 * Error message mapper utility
 *
 * Converts technical error messages to user-friendly messages
 * that users can understand and act upon.
 */

/**
 * Error type categories for classification
 */
export type ErrorCategory =
  | 'network'
  | 'timeout'
  | 'auth'
  | 'permission'
  | 'validation'
  | 'notFound'
  | 'conflict'
  | 'server'
  | 'unknown';

/**
 * Recovery action that the user can take
 */
export interface RecoveryAction {
  /** Label for the action button */
  label: string;
  /** Type of action: 'retry' triggers onRetry, 'link' navigates to href */
  type: 'retry' | 'link';
  /** URL to navigate to for 'link' type actions */
  href?: string;
}

/**
 * Result of error classification
 */
export interface ClassifiedError {
  category: ErrorCategory;
  userMessage: string;
  technicalMessage: string;
  isRetryable: boolean;
  /** Suggested recovery actions for this error */
  recoveryActions: RecoveryAction[];
  /** Additional help text explaining what the user can do */
  helpText?: string;
}

/**
 * Error pattern matchers for classification
 */
const errorPatterns: Array<{
  patterns: RegExp[];
  category: ErrorCategory;
  userMessage: string;
  isRetryable: boolean;
  recoveryActions: RecoveryAction[];
  helpText?: string;
}> = [
  // Network errors
  {
    patterns: [
      /network/i,
      /fetch/i,
      /failed to fetch/i,
      /net::err/i,
      /econnrefused/i,
      /enotfound/i,
      /connection refused/i,
      /no internet/i,
      /offline/i,
    ],
    category: 'network',
    userMessage: 'Connection error. Please check your internet and try again.',
    isRetryable: true,
    recoveryActions: [{ label: 'Try Again', type: 'retry' }],
    helpText: 'Check your internet connection or try refreshing the page.',
  },
  // Timeout errors (but not HTTP 504 which is a server error)
  {
    patterns: [
      /^timeout$/i,
      /timed out/i,
      /etimedout/i,
      /request.*timeout/i,
      /operation.*timeout/i,
      /connection.*timeout/i,
    ],
    category: 'timeout',
    userMessage: 'Request timed out. Please try again.',
    isRetryable: true,
    recoveryActions: [{ label: 'Try Again', type: 'retry' }],
    helpText: 'The server is taking longer than expected. This may be due to high load.',
  },
  // Authentication errors
  {
    patterns: [
      /unauthorized/i,
      /unauthenticated/i,
      /not authenticated/i,
      /invalid.*token/i,
      /token.*expired/i,
      /session.*expired/i,
      /please.*sign.*in/i,
      /login.*required/i,
      /401/,
    ],
    category: 'auth',
    userMessage: 'Your session has expired. Please sign in again.',
    isRetryable: false,
    recoveryActions: [{ label: 'Sign In', type: 'link', href: '/auth/signin' }],
    helpText: 'You will need to sign in again to continue.',
  },
  // Permission errors
  {
    patterns: [
      /forbidden/i,
      /permission.*denied/i,
      /access.*denied/i,
      /not.*authorized/i,
      /insufficient.*permission/i,
      /403/,
    ],
    category: 'permission',
    userMessage: 'You do not have permission to perform this action.',
    isRetryable: false,
    recoveryActions: [],
    helpText: 'Contact your instructor or administrator if you need access.',
  },
  // Validation errors
  {
    patterns: [
      /validation/i,
      /invalid.*input/i,
      /invalid.*format/i,
      /required.*field/i,
      /must.*be/i,
      /cannot.*be.*empty/i,
      /too.*long/i,
      /too.*short/i,
      /please.*enter/i,
      /is.*required/i,
      /please.*check.*credentials/i,
      /invalid.*email.*password/i,
      /invalid.*password/i,
      /no.*account.*found/i,
      /check.*email/i,
      /400/,
    ],
    category: 'validation',
    userMessage: 'PRESERVE_ORIGINAL', // Special marker to preserve original message
    isRetryable: false,
    recoveryActions: [],
    helpText: 'Review your input for any errors or missing required fields.',
  },
  // Not found errors
  {
    patterns: [
      /not.*found/i,
      /does.*not.*exist/i,
      /no.*such/i,
      /404/,
    ],
    category: 'notFound',
    userMessage: 'The requested item could not be found.',
    isRetryable: false,
    recoveryActions: [{ label: 'Go Home', type: 'link', href: '/' }],
    helpText: 'The item may have been moved or deleted.',
  },
  // Conflict errors
  {
    patterns: [
      /conflict/i,
      /already.*exists/i,
      /duplicate/i,
      /unique.*constraint/i,
      /foreign.*key/i,
      /409/,
    ],
    category: 'conflict',
    userMessage: 'This operation conflicts with existing data. Please try a different value.',
    isRetryable: false,
    recoveryActions: [],
    helpText: 'Choose a different value that is not already in use.',
  },
  // Server errors
  {
    patterns: [
      /server.*error/i,
      /internal.*error/i,
      /500/,
      /502/,
      /503/,
      /504/,
      /service.*unavailable/i,
      /bad.*gateway/i,
    ],
    category: 'server',
    userMessage: 'The server is having trouble. Please try again in a moment.',
    isRetryable: true,
    recoveryActions: [{ label: 'Try Again', type: 'retry' }],
    helpText: 'Wait a few seconds and try again. If the problem persists, contact your instructor.',
  },
];

/**
 * Classifies an error and returns user-friendly information
 *
 * @param error - The error to classify (Error object or string)
 * @returns ClassifiedError with category, user message, retry info, and recovery actions
 */
export function classifyError(error: Error | string): ClassifiedError {
  const technicalMessage = typeof error === 'string' ? error : error.message;
  const messageLower = technicalMessage.toLowerCase();

  for (const pattern of errorPatterns) {
    for (const regex of pattern.patterns) {
      if (regex.test(messageLower)) {
        // If userMessage is 'PRESERVE_ORIGINAL', keep the original message
        const userMessage = pattern.userMessage === 'PRESERVE_ORIGINAL'
          ? technicalMessage
          : pattern.userMessage;

        return {
          category: pattern.category,
          userMessage,
          technicalMessage,
          isRetryable: pattern.isRetryable,
          recoveryActions: pattern.recoveryActions,
          helpText: pattern.helpText,
        };
      }
    }
  }

  // Default to unknown error
  return {
    category: 'unknown',
    userMessage: 'Something went wrong. Please try again.',
    technicalMessage,
    isRetryable: true,
    recoveryActions: [{ label: 'Try Again', type: 'retry' }],
    helpText: 'If this problem persists, try refreshing the page.',
  };
}

/**
 * Gets a user-friendly error message from an error
 *
 * @param error - The error to get a message for
 * @returns A user-friendly error message string
 */
export function getUserFriendlyError(error: Error | string): string {
  return classifyError(error).userMessage;
}

/**
 * Checks if an error is likely retryable
 *
 * @param error - The error to check
 * @returns true if the error is likely transient and retryable
 */
export function isRetryableError(error: Error | string): boolean {
  return classifyError(error).isRetryable;
}

/**
 * Gets the error category
 *
 * @param error - The error to categorize
 * @returns The error category
 */
export function getErrorCategory(error: Error | string): ErrorCategory {
  return classifyError(error).category;
}

/**
 * Gets recovery actions for an error
 *
 * @param error - The error to get recovery actions for
 * @returns Array of recovery actions the user can take
 */
export function getRecoveryActions(error: Error | string): RecoveryAction[] {
  return classifyError(error).recoveryActions;
}

/**
 * Gets help text for an error
 *
 * @param error - The error to get help text for
 * @returns Help text explaining what the user can do, or undefined
 */
export function getHelpText(error: Error | string): string | undefined {
  return classifyError(error).helpText;
}

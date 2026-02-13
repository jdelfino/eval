/**
 * API utilities including retry logic
 *
 * Provides utilities for making API calls with automatic retry
 * for transient failures.
 */

import { isRetryableError } from './error-messages';

/**
 * Options for retry behavior
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay between retries in ms (default: 1000) */
  initialDelay?: number;
  /** Maximum delay between retries in ms (default: 10000) */
  maxDelay?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Callback when a retry is about to happen */
  onRetry?: (attempt: number, error: Error, delay: number) => void;
  /** Custom function to determine if error is retryable */
  shouldRetry?: (error: Error) => boolean;
}

/**
 * Default retry options.
 * In test environments, use minimal delays to avoid slow backoffs hitting Jest timeouts.
 */
const isTestEnv = typeof process !== 'undefined' &&
  (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined);

const defaultRetryOptions: Required<Omit<RetryOptions, 'onRetry' | 'shouldRetry'>> = {
  maxRetries: 3,
  initialDelay: isTestEnv ? 10 : 1000,
  maxDelay: isTestEnv ? 50 : 10000,
  backoffMultiplier: 2,
};

/**
 * Delays execution for a specified time
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculates delay for a given attempt using exponential backoff with jitter
 */
function calculateDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  backoffMultiplier: number
): number {
  // Exponential backoff: initialDelay * (multiplier ^ attempt)
  const exponentialDelay = initialDelay * Math.pow(backoffMultiplier, attempt);
  // Add jitter (0-25% random variation) to prevent thundering herd
  const jitter = exponentialDelay * (Math.random() * 0.25);
  // Cap at maxDelay
  return Math.min(exponentialDelay + jitter, maxDelay);
}

/**
 * Wraps an async function with retry logic for transient failures
 *
 * Uses exponential backoff with jitter between retries.
 * Only retries errors that are classified as retryable.
 *
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @returns Promise resolving to the function result
 * @throws The last error if all retries fail
 *
 * @example
 * ```ts
 * const data = await withRetry(
 *   () => fetch('/api/data').then(r => r.json()),
 *   { maxRetries: 3, onRetry: (attempt, err) => console.log(`Retry ${attempt}`) }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = defaultRetryOptions.maxRetries,
    initialDelay = defaultRetryOptions.initialDelay,
    maxDelay = defaultRetryOptions.maxDelay,
    backoffMultiplier = defaultRetryOptions.backoffMultiplier,
    onRetry,
    shouldRetry,
  } = options;

  let lastError: Error;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      const canRetry = shouldRetry ? shouldRetry(lastError) : isRetryableError(lastError);

      // If we can't retry or have exhausted retries, throw
      if (!canRetry || attempt >= maxRetries) {
        throw lastError;
      }

      // Calculate delay for next retry
      const retryDelay = calculateDelay(attempt, initialDelay, maxDelay, backoffMultiplier);

      // Notify about retry
      if (onRetry) {
        onRetry(attempt + 1, lastError, retryDelay);
      }

      // Wait before retrying
      await delay(retryDelay);
      attempt++;
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError!;
}



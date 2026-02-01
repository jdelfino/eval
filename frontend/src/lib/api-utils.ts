/**
 * API utilities including retry logic
 *
 * Provides utilities for making API calls with automatic retry
 * for transient failures.
 */

import { isRetryableError, classifyError } from './error-messages';

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
 * Result type for operations that may fail with retry info
 */
export interface RetryResult<T> {
  data: T;
  attempts: number;
  wasRetried: boolean;
}

/**
 * Default retry options
 */
const defaultRetryOptions: Required<Omit<RetryOptions, 'onRetry' | 'shouldRetry'>> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
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

/**
 * Wraps an async function with retry logic and returns detailed result info
 *
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @returns Promise resolving to RetryResult with data and attempt info
 */
export async function withRetryInfo<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
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
      const data = await fn();
      return {
        data,
        attempts: attempt + 1,
        wasRetried: attempt > 0,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const canRetry = shouldRetry ? shouldRetry(lastError) : isRetryableError(lastError);

      if (!canRetry || attempt >= maxRetries) {
        throw lastError;
      }

      const retryDelay = calculateDelay(attempt, initialDelay, maxDelay, backoffMultiplier);

      if (onRetry) {
        onRetry(attempt + 1, lastError, retryDelay);
      }

      await delay(retryDelay);
      attempt++;
    }
  }

  throw lastError!;
}

/**
 * Options for fetchWithRetry
 */
export interface FetchWithRetryOptions extends RetryOptions {
  /** Fetch options (method, headers, body, etc.) */
  fetchOptions?: RequestInit;
  /** HTTP status codes that should trigger a retry (default: [408, 429, 500, 502, 503, 504]) */
  retryStatusCodes?: number[];
}

/**
 * Default HTTP status codes that should trigger retry
 */
const defaultRetryStatusCodes = [408, 429, 500, 502, 503, 504];

/**
 * Fetch wrapper with automatic retry for transient failures
 *
 * Retries on network errors and configurable HTTP status codes.
 *
 * @param url - The URL to fetch
 * @param options - Fetch and retry options
 * @returns Promise resolving to the fetch Response
 *
 * @example
 * ```ts
 * const response = await fetchWithRetry('/api/data', {
 *   fetchOptions: { method: 'POST', body: JSON.stringify(data) },
 *   maxRetries: 2,
 * });
 * ```
 */
export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const {
    fetchOptions,
    retryStatusCodes = defaultRetryStatusCodes,
    ...retryOptions
  } = options;

  return withRetry(
    async () => {
      const response = await fetch(url, fetchOptions);

      // Check if we should retry based on status code
      if (retryStatusCodes.includes(response.status)) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      return response;
    },
    retryOptions
  );
}

/**
 * Fetch JSON data with automatic retry
 *
 * @param url - The URL to fetch
 * @param options - Fetch and retry options
 * @returns Promise resolving to the parsed JSON data
 */
export async function fetchJsonWithRetry<T>(
  url: string,
  options: FetchWithRetryOptions = {}
): Promise<T> {
  const response = await fetchWithRetry(url, options);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Request failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Creates an error with a user-friendly message while preserving the original
 *
 * @param error - The original error
 * @returns Error with user-friendly message
 */
export function createUserFriendlyError(error: Error | string): Error {
  const classified = classifyError(error);
  const userError = new Error(classified.userMessage);
  (userError as any).originalError = error;
  (userError as any).category = classified.category;
  (userError as any).isRetryable = classified.isRetryable;
  return userError;
}

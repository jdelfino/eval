/**
 * Structured logging for Vercel Sandbox operations
 *
 * Provides consistent JSON logging for sandbox lifecycle events,
 * enabling monitoring, debugging, and performance analysis.
 */

/**
 * Sandbox event types
 */
export type SandboxEventType =
  | 'sandbox_create'
  | 'sandbox_reconnect'
  | 'sandbox_recreate'
  | 'sandbox_execute'
  | 'sandbox_trace'
  | 'sandbox_cleanup'
  | 'sandbox_error';

/**
 * Structured log entry for sandbox operations
 */
export interface SandboxLogEntry {
  /** Event type */
  event: SandboxEventType;
  /** Session ID */
  sessionId: string;
  /** Sandbox ID (if available) */
  sandboxId?: string;
  /** Operation duration in milliseconds */
  durationMs?: number;
  /** Whether operation succeeded */
  success: boolean;
  /** Error message (if failed) */
  error?: string;
  /** Error code from SandboxError */
  errorCode?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Log a sandbox event with structured JSON output
 *
 * Logs are formatted for easy parsing by log aggregation tools.
 * In Vercel, these will be captured in the function logs.
 */
export function logSandboxEvent(entry: SandboxLogEntry): void {
  const logLine = JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'vercel-sandbox',
    level: entry.success ? 'info' : 'error',
    ...entry,
  });

  if (entry.success) {
    // eslint-disable-next-line no-console -- structured info logging for log aggregation
    console.log(logLine);
  } else {
    console.error(logLine);
  }
}

/**
 * Helper to measure operation duration and log result
 */
export async function withSandboxLogging<T>(
  event: SandboxEventType,
  sessionId: string,
  operation: () => Promise<T>,
  getMetadata?: (result: T) => Record<string, unknown>
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await operation();
    const durationMs = Date.now() - startTime;

    logSandboxEvent({
      event,
      sessionId,
      durationMs,
      success: true,
      metadata: getMetadata?.(result),
    });

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;

    logSandboxEvent({
      event,
      sessionId,
      durationMs,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorCode: (error as { code?: string })?.code,
    });

    throw error;
  }
}

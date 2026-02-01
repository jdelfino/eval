/**
 * Shared utilities for code execution
 */

export const DEFAULT_TIMEOUT = 10000; // 10 seconds
export const MAX_FILE_SIZE = 10 * 1024; // 10KB per file
export const MAX_FILES = 5;

// Input size limits (security hardening)
export const CODE_MAX_BYTES = 100 * 1024;     // 100 KB
export const STDIN_MAX_BYTES = 1024 * 1024;   // 1 MB
export const OUTPUT_MAX_BYTES = 1024 * 1024;  // 1 MB
export const TRACE_MAX_STEPS = 50_000;

/**
 * Validate attached files
 */
export function validateAttachedFiles(files: Array<{ name: string; content: string }>): void {
  if (files.length > MAX_FILES) {
    throw new Error(`Too many files attached (max ${MAX_FILES})`);
  }

  for (const file of files) {
    if (!file.name || !file.content) {
      throw new Error('Invalid file: name and content are required');
    }

    const size = Buffer.byteLength(file.content, 'utf-8');
    if (size > MAX_FILE_SIZE) {
      throw new Error(`File "${file.name}" exceeds size limit (${MAX_FILE_SIZE} bytes)`);
    }
  }
}

/**
 * Sanitize filename to prevent path traversal
 */
export function sanitizeFilename(filename: string): string {
  // Remove path separators and parent directory references
  const sanitized = filename
    .replace(/[/\\]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/^\.+/, '_');

  // Ensure filename is not empty
  if (!sanitized || sanitized.trim() === '') {
    return 'unnamed_file.txt';
  }

  return sanitized;
}

/**
 * Sanitize error messages to remove sensitive information
 */
export function sanitizeError(error: string): string {
  // Remove file paths from error messages
  return error
    .replace(/File ".*?", line/g, 'File "<student code>", line')
    .replace(/\[Errno \d+\]/g, '[Error]');
}

/**
 * Validate code size (throws if too large)
 */
export function validateCodeSize(code: string): void {
  const size = Buffer.byteLength(code, 'utf-8');
  if (size > CODE_MAX_BYTES) {
    throw new Error(`Code exceeds maximum size of ${CODE_MAX_BYTES / 1024} KB`);
  }
}

/**
 * Validate stdin size (throws if too large)
 */
export function validateStdinSize(stdin: string | undefined): void {
  if (stdin && Buffer.byteLength(stdin, 'utf-8') > STDIN_MAX_BYTES) {
    throw new Error(`Input exceeds maximum size of ${STDIN_MAX_BYTES / 1024} KB`);
  }
}

/**
 * Validate and cap maxSteps for trace execution
 */
export function validateMaxSteps(maxSteps: number | undefined): number {
  if (maxSteps === undefined) return TRACE_MAX_STEPS;
  return Math.min(maxSteps, TRACE_MAX_STEPS);
}

/**
 * Truncate output if it exceeds the maximum size
 */
export function truncateOutput(output: string): string {
  const size = Buffer.byteLength(output, 'utf-8');
  if (size > OUTPUT_MAX_BYTES) {
    // Find a safe truncation point (don't cut in the middle of a multi-byte char)
    let truncated = output;
    while (Buffer.byteLength(truncated, 'utf-8') > OUTPUT_MAX_BYTES) {
      truncated = truncated.slice(0, -1000);
    }
    return truncated + '\n... [output truncated]';
  }
  return output;
}

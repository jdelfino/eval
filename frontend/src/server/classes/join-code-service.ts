/**
 * Join code generator utility
 *
 * Simple stateless utility for generating unique, readable join codes.
 * No dependencies - just pure code generation.
 *
 * Join codes are stored internally without dashes (6 chars: ABC123)
 * but can be entered by users with or without dashes (ABC-123 or ABC123).
 */

import * as crypto from 'crypto';

/**
 * Characters to use in join codes
 * Excludes ambiguous characters: O/0, I/1, L/l
 */
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Generate a unique join code
 *
 * Format: ABC123 (6 characters, no dashes)
 * Uses crypto.randomBytes for cryptographically secure randomness
 *
 * @returns A join code string (6 uppercase alphanumeric characters)
 */
export function generateJoinCode(): string {
  let code = '';

  for (let i = 0; i < 6; i++) {
    const randomByte = crypto.randomBytes(1)[0];
    const index = randomByte % CHARSET.length;
    code += CHARSET[index];
  }

  return code;
}

/**
 * Normalize a join code to standard format for storage/lookup
 *
 * - Removes all dashes and whitespace
 * - Converts to uppercase
 * - Returns the raw 6-character code
 *
 * @param code - The join code to normalize (may include dashes)
 * @returns Normalized 6-character uppercase code, or empty string if invalid input
 */
export function normalizeJoinCode(code: string): string {
  if (!code || typeof code !== 'string') {
    return '';
  }

  // Remove dashes, whitespace, and convert to uppercase
  return code.replace(/[-\s]/g, '').trim().toUpperCase();
}

/**
 * Format a join code for display (with dashes)
 *
 * Takes a normalized 6-character code and formats it as XXX-XXX
 * for easier reading.
 *
 * @param code - The normalized join code (6 characters)
 * @returns Formatted code with dash (e.g., ABC-123), or original if not 6 chars
 */
export function formatJoinCodeForDisplay(code: string): string {
  if (!code || typeof code !== 'string') {
    return '';
  }

  const normalized = normalizeJoinCode(code);

  // Only format if it's exactly 6 characters
  if (normalized.length !== 6) {
    return code;
  }

  // Format as XXX-XXX
  return `${normalized.slice(0, 3)}-${normalized.slice(3)}`;
}

/**
 * Validate join code format
 *
 * Accepts codes in various formats:
 * - 6 chars without dashes: ABC123
 * - 7 chars with one dash: ABC-123
 * - Old format with two dashes: ABC-123-XYZ (9 chars normalized)
 *
 * Validation is lenient to support codes from old generators and user input.
 * Actual code existence is validated at lookup time.
 *
 * @param code - The join code to validate
 * @returns true if format is valid after normalization
 */
export function isValidJoinCodeFormat(code: string): boolean {
  if (!code || typeof code !== 'string') {
    return false;
  }

  const normalized = normalizeJoinCode(code);

  // Must be exactly 6 alphanumeric characters after normalization
  // Lenient validation: accepts any A-Z and 0-9 for backwards compatibility
  return /^[A-Z0-9]{6}$/.test(normalized);
}

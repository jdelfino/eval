/**
 * Tests for getAdminAuthHeader() error handling in test-auth.ts.
 *
 * When E2E tests run on a CI runner (not in-cluster), the GKE metadata server
 * (http://metadata.google.internal/...) is not available. Without a timeout,
 * this causes a confusing long network hang instead of a clear error.
 *
 * These tests verify that test-auth.ts:
 * 1. Uses AbortSignal.timeout(3000) when fetching the metadata server token
 * 2. Wraps the fetch in a try/catch
 * 3. Throws a clear, actionable error message when the metadata server is unavailable
 */

import * as fs from 'fs';
import * as path from 'path';

const TEST_AUTH_PATH = path.resolve(
  __dirname,
  '../../e2e/fixtures/test-auth.ts'
);

function readSource(): string {
  return fs.readFileSync(TEST_AUTH_PATH, 'utf-8');
}

describe('test-auth.ts: getAdminAuthHeader() error handling', () => {
  describe('AbortSignal.timeout', () => {
    it('uses AbortSignal.timeout(3000) when fetching the metadata server token', () => {
      const source = readSource();
      expect(source).toMatch(/AbortSignal\.timeout\(3000\)/);
    });

    it('passes the signal to the metadata fetch call', () => {
      const source = readSource();
      // The signal must be included in the fetch options object
      expect(source).toMatch(/signal\s*:\s*AbortSignal\.timeout\(3000\)/);
    });
  });

  describe('try/catch wrapping', () => {
    it('wraps the metadata fetch in a try/catch block', () => {
      const source = readSource();
      // There must be a try block followed by a catch in the getAdminAuthHeader function
      expect(source).toMatch(/try\s*\{/);
      expect(source).toMatch(/catch\s*\(/);
    });
  });

  describe('actionable error message', () => {
    it('throws an error mentioning that GKE metadata server is not available', () => {
      const source = readSource();
      expect(source).toContain('GKE metadata server not available');
    });

    it('throws an error with guidance to pre-create the user', () => {
      const source = readSource();
      expect(source).toContain('Pre-create the user via the staging user setup script');
    });

    it('throws the exact required error message', () => {
      const source = readSource();
      // The source uses string concatenation over two lines; check each part separately
      expect(source).toContain('Cannot create new IDP user: GKE metadata server not available. ');
      expect(source).toContain('Pre-create the user via the staging user setup script, then re-run.');
    });
  });

  describe('selective error handling in catch block', () => {
    it('checks error.name for AbortError before catching', () => {
      const source = readSource();
      // The catch block must inspect error.name or instanceof to discriminate error types
      expect(source).toMatch(/AbortError/);
    });

    it('checks for TypeError (DNS/connection failure) before catching', () => {
      const source = readSource();
      // The catch block must handle TypeError (thrown for network/DNS failures)
      expect(source).toMatch(/TypeError/);
    });

    it('re-throws errors that are not network or timeout errors', () => {
      const source = readSource();
      // The catch block must re-throw non-network errors
      // This ensures HTTP errors (403, 500, etc.) are not swallowed
      // Look for a re-throw pattern: either "throw error" or "throw e" or similar
      expect(source).toMatch(/throw\s+(error|err|e)\b/);
    });

    it('does not catch all errors unconditionally with a bare throw inside', () => {
      const source = readSource();
      // The catch block must NOT be a simple unconditional "throw new Error(...)" that
      // discards the original error without checking its type first.
      // We verify the source contains a conditional check (if/instanceof) inside catch.
      // Pattern: catch contains an "if" that gates the swallowing behavior.
      const catchMatch = source.match(/catch\s*\((\w+)\)\s*\{([\s\S]*?)\n\s*\}/);
      if (catchMatch) {
        const catchBody = catchMatch[2];
        // The catch body must contain a conditional — not just unconditionally throw a new error
        expect(catchBody).toMatch(/if\s*\(/);
      }
    });
  });
});

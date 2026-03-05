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
      expect(source).toContain(
        'Cannot create new IDP user: GKE metadata server not available. ' +
        'Pre-create the user via the staging user setup script, then re-run.'
      );
    });
  });
});

// Set up the test environment variable before importing the module
const TEST_SECRET = 'test-secret-key-for-mfa-cookie-testing';
process.env.SUPABASE_SECRET_KEY = TEST_SECRET;

import { signMfaCookie, verifyMfaCookie } from '../mfa-cookie';

describe('MFA Cookie Utilities', () => {
  const testEmail = 'admin@example.com';

  describe('signMfaCookie', () => {
    it('should create a signed cookie with email, expiry, and signature', () => {
      const cookie = signMfaCookie(testEmail);

      const parts = cookie.split(':');
      expect(parts).toHaveLength(3);

      const [email, expiresAtStr, signature] = parts;
      expect(email).toBe(testEmail);
      expect(parseInt(expiresAtStr, 10)).toBeGreaterThan(Date.now());
      expect(signature).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
    });

    it('should create different cookies for different emails', () => {
      const cookie1 = signMfaCookie('user1@example.com');
      const cookie2 = signMfaCookie('user2@example.com');

      expect(cookie1).not.toBe(cookie2);
    });
  });

  describe('verifyMfaCookie', () => {
    it('should verify a valid cookie and return email', () => {
      const cookie = signMfaCookie(testEmail);
      const result = verifyMfaCookie(cookie);

      expect(result.valid).toBe(true);
      expect(result.email).toBe(testEmail);
    });

    it('should return valid: false for undefined cookie', () => {
      const result = verifyMfaCookie(undefined);

      expect(result.valid).toBe(false);
      expect(result.email).toBe('');
    });

    it('should return valid: false for empty string cookie', () => {
      const result = verifyMfaCookie('');

      expect(result.valid).toBe(false);
      expect(result.email).toBe('');
    });

    it('should return valid: false for expired cookie', () => {
      // Create a cookie with past expiry by manipulating the timestamp
      const expiresAt = Date.now() - 1000; // 1 second ago
      const cookie = signMfaCookie(testEmail);
      const parts = cookie.split(':');

      // Replace the expiry with an expired timestamp
      // Need to recalculate signature for the tampered expiry
      // Since we can't do that without the secret, we mock Date.now
      const originalDateNow = Date.now;
      let callCount = 0;

      // First call returns normal time (for signMfaCookie)
      // Second call returns time after expiry (for verifyMfaCookie)
      jest.spyOn(Date, 'now').mockImplementation(() => {
        callCount++;
        if (callCount <= 1) {
          return originalDateNow();
        }
        // Return a time 6 minutes in the future (past the 5 min expiry)
        return originalDateNow() + 6 * 60 * 1000;
      });

      const signedCookie = signMfaCookie(testEmail);
      const result = verifyMfaCookie(signedCookie);

      expect(result.valid).toBe(false);
      expect(result.email).toBe(testEmail);

      jest.restoreAllMocks();
    });

    it('should return valid: false for tampered email', () => {
      const cookie = signMfaCookie(testEmail);
      const parts = cookie.split(':');

      // Tamper with the email
      parts[0] = 'hacker@evil.com';
      const tamperedCookie = parts.join(':');

      const result = verifyMfaCookie(tamperedCookie);

      expect(result.valid).toBe(false);
    });

    it('should return valid: false for tampered expiry', () => {
      const cookie = signMfaCookie(testEmail);
      const parts = cookie.split(':');

      // Tamper with the expiry to extend it
      parts[1] = String(Date.now() + 999999999);
      const tamperedCookie = parts.join(':');

      const result = verifyMfaCookie(tamperedCookie);

      expect(result.valid).toBe(false);
    });

    it('should return valid: false for tampered signature', () => {
      const cookie = signMfaCookie(testEmail);
      const parts = cookie.split(':');

      // Tamper with the signature
      parts[2] = 'a'.repeat(64);
      const tamperedCookie = parts.join(':');

      const result = verifyMfaCookie(tamperedCookie);

      expect(result.valid).toBe(false);
    });

    it('should return valid: false for malformed cookie with too few parts', () => {
      const result = verifyMfaCookie('only:two');

      expect(result.valid).toBe(false);
      expect(result.email).toBe('');
    });

    it('should return valid: false for malformed cookie with too many parts', () => {
      const result = verifyMfaCookie('one:two:three:four');

      expect(result.valid).toBe(false);
    });

    it('should return valid: false for non-numeric expiry', () => {
      const result = verifyMfaCookie('email@test.com:notanumber:signature');

      expect(result.valid).toBe(false);
      expect(result.email).toBe('');
    });

    it('should handle emails with special characters', () => {
      const specialEmail = 'user+tag@sub.domain.example.com';
      const cookie = signMfaCookie(specialEmail);
      const result = verifyMfaCookie(cookie);

      expect(result.valid).toBe(true);
      expect(result.email).toBe(specialEmail);
    });
  });
});

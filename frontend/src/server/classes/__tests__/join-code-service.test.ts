/**
 * Unit tests for join code generation utilities
 *
 * Tests the join code generation, normalization, formatting, and validation
 * functions to ensure codes are properly formatted, use valid characters,
 * and handle various input formats consistently.
 */

import {
  generateJoinCode,
  normalizeJoinCode,
  formatJoinCodeForDisplay,
  isValidJoinCodeFormat,
} from '../join-code-service';

describe('Join Code Service', () => {
  describe('generateJoinCode', () => {
    it('should generate code in correct format (6 characters)', () => {
      const code = generateJoinCode();

      expect(code).toMatch(/^[A-Z0-9]{6}$/);
      expect(code.length).toBe(6);
    });

    it('should generate unique codes', () => {
      const codes = new Set<string>();

      // Generate 100 codes - should all be unique with high probability
      for (let i = 0; i < 100; i++) {
        codes.add(generateJoinCode());
      }

      expect(codes.size).toBe(100);
    });

    it('should only use allowed characters (no O/0/I/1/L confusion)', () => {
      // Allowed charset: ABCDEFGHJKMNPQRSTUVWXYZ23456789
      const allowedChars = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/;

      for (let i = 0; i < 20; i++) {
        const code = generateJoinCode();
        expect(code).toMatch(allowedChars);

        // Verify no confusing characters
        expect(code).not.toContain('O');
        expect(code).not.toContain('0');
        expect(code).not.toContain('I');
        expect(code).not.toContain('1');
        expect(code).not.toContain('L');
      }
    });

    it('should use cryptographically random values', () => {
      // Statistical test: in 100 codes, each position should vary
      const codes: string[] = [];
      for (let i = 0; i < 100; i++) {
        codes.push(generateJoinCode());
      }

      // Check first character varies
      const firstChars = new Set(codes.map((c) => c[0]));
      expect(firstChars.size).toBeGreaterThan(5); // Should have variation

      // Check last character varies
      const lastChars = new Set(codes.map((c) => c[5]));
      expect(lastChars.size).toBeGreaterThan(5);
    });
  });

  describe('normalizeJoinCode', () => {
    it('should return empty string for invalid inputs', () => {
      expect(normalizeJoinCode(null as any)).toBe('');
      expect(normalizeJoinCode(undefined as any)).toBe('');
      expect(normalizeJoinCode(123 as any)).toBe('');
      expect(normalizeJoinCode({} as any)).toBe('');
      expect(normalizeJoinCode([] as any)).toBe('');
    });

    it('should handle empty strings', () => {
      expect(normalizeJoinCode('')).toBe('');
    });

    it('should remove dashes from codes', () => {
      expect(normalizeJoinCode('ABC-123')).toBe('ABC123');
      expect(normalizeJoinCode('ABC-123-XYZ')).toBe('ABC123XYZ');
      expect(normalizeJoinCode('A-B-C-1-2-3')).toBe('ABC123');
    });

    it('should convert to uppercase', () => {
      expect(normalizeJoinCode('abc123')).toBe('ABC123');
      expect(normalizeJoinCode('abc-123')).toBe('ABC123');
      expect(normalizeJoinCode('AbC-123-XyZ')).toBe('ABC123XYZ');
    });

    it('should trim whitespace', () => {
      expect(normalizeJoinCode('  ABC123  ')).toBe('ABC123');
      expect(normalizeJoinCode('  ABC-123  ')).toBe('ABC123');
      expect(normalizeJoinCode('\tABC123\n')).toBe('ABC123');
    });

    it('should remove spaces within the code', () => {
      expect(normalizeJoinCode('ABC 123')).toBe('ABC123');
      expect(normalizeJoinCode('A B C 1 2 3')).toBe('ABC123');
    });

    it('should handle codes that are already normalized', () => {
      expect(normalizeJoinCode('ABC123')).toBe('ABC123');
      expect(normalizeJoinCode('XYZDEF')).toBe('XYZDEF');
    });
  });

  describe('formatJoinCodeForDisplay', () => {
    it('should return empty string for invalid inputs', () => {
      expect(formatJoinCodeForDisplay(null as any)).toBe('');
      expect(formatJoinCodeForDisplay(undefined as any)).toBe('');
      expect(formatJoinCodeForDisplay(123 as any)).toBe('');
    });

    it('should format 6-character codes with a dash', () => {
      expect(formatJoinCodeForDisplay('ABC123')).toBe('ABC-123');
      expect(formatJoinCodeForDisplay('XYZDEF')).toBe('XYZ-DEF');
      expect(formatJoinCodeForDisplay('222333')).toBe('222-333');
    });

    it('should normalize before formatting', () => {
      expect(formatJoinCodeForDisplay('abc123')).toBe('ABC-123');
      expect(formatJoinCodeForDisplay('abc-123')).toBe('ABC-123');
      expect(formatJoinCodeForDisplay('  ABC123  ')).toBe('ABC-123');
    });

    it('should return original code if not 6 chars after normalization', () => {
      expect(formatJoinCodeForDisplay('ABCDE')).toBe('ABCDE'); // 5 chars
      expect(formatJoinCodeForDisplay('ABCDEFG')).toBe('ABCDEFG'); // 7 chars
      expect(formatJoinCodeForDisplay('')).toBe('');
    });

    it('should handle codes with dashes already present', () => {
      // Should normalize first, then format
      expect(formatJoinCodeForDisplay('ABC-123')).toBe('ABC-123');
      expect(formatJoinCodeForDisplay('A-B-C-1-2-3')).toBe('ABC-123');
    });
  });

  describe('isValidJoinCodeFormat', () => {
    it('should accept valid 6-character join codes', () => {
      expect(isValidJoinCodeFormat('ABC234')).toBe(true);
      expect(isValidJoinCodeFormat('XYZ789')).toBe(true);
      expect(isValidJoinCodeFormat('AAAAAA')).toBe(true);
      expect(isValidJoinCodeFormat('222333')).toBe(true);
    });

    it('should accept codes with dashes (normalizes first)', () => {
      expect(isValidJoinCodeFormat('ABC-234')).toBe(true);
      expect(isValidJoinCodeFormat('ABC-DEF')).toBe(true);
      expect(isValidJoinCodeFormat('A-B-C-2-3-4')).toBe(true);
    });

    it('should accept lowercase (normalizes to uppercase)', () => {
      expect(isValidJoinCodeFormat('abc234')).toBe(true);
      expect(isValidJoinCodeFormat('abc-234')).toBe(true);
      expect(isValidJoinCodeFormat('AbC-DeF')).toBe(true);
    });

    it('should accept codes with whitespace (trims)', () => {
      expect(isValidJoinCodeFormat('  ABC234  ')).toBe(true);
      expect(isValidJoinCodeFormat('  ABC-234  ')).toBe(true);
      expect(isValidJoinCodeFormat(' abc234 ')).toBe(true);
    });

    it('should reject codes that are too short after normalization', () => {
      expect(isValidJoinCodeFormat('ABCDE')).toBe(false); // 5 chars
      expect(isValidJoinCodeFormat('ABC-D')).toBe(false); // 4 chars after normalization
    });

    it('should reject codes that are too long after normalization', () => {
      expect(isValidJoinCodeFormat('ABCDEFG')).toBe(false); // 7 chars
      expect(isValidJoinCodeFormat('ABC-234-XYZ')).toBe(false); // 9 chars after normalization
    });

    it('should reject codes with invalid characters', () => {
      expect(isValidJoinCodeFormat('ABC#2X')).toBe(false);
      expect(isValidJoinCodeFormat('AB@23X')).toBe(false);
      expect(isValidJoinCodeFormat('ABC12$')).toBe(false);
    });

    it('should accept codes with any alphanumeric characters for backwards compatibility', () => {
      // Even though generator excludes O/0/I/1/L, validation is lenient
      // to support codes from old generators or manual entry
      // The actual validation happens at lookup time
      expect(isValidJoinCodeFormat('ABCO23')).toBe(true);
      expect(isValidJoinCodeFormat('ABC023')).toBe(true);
      expect(isValidJoinCodeFormat('ABCI23')).toBe(true);
      expect(isValidJoinCodeFormat('ABC123')).toBe(true);
      expect(isValidJoinCodeFormat('ABCL23')).toBe(true);
    });

    it('should reject null, undefined, and non-string inputs', () => {
      expect(isValidJoinCodeFormat(null as any)).toBe(false);
      expect(isValidJoinCodeFormat(undefined as any)).toBe(false);
      expect(isValidJoinCodeFormat(123 as any)).toBe(false);
      expect(isValidJoinCodeFormat({} as any)).toBe(false);
      expect(isValidJoinCodeFormat([] as any)).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidJoinCodeFormat('')).toBe(false);
      expect(isValidJoinCodeFormat('   ')).toBe(false);
      expect(isValidJoinCodeFormat('---')).toBe(false);
    });
  });

  describe('Integration: round-trip', () => {
    it('should generate codes that pass validation', () => {
      for (let i = 0; i < 20; i++) {
        const code = generateJoinCode();
        expect(isValidJoinCodeFormat(code)).toBe(true);
      }
    });

    it('should generate codes that can be formatted and normalized back', () => {
      for (let i = 0; i < 20; i++) {
        const original = generateJoinCode();
        const formatted = formatJoinCodeForDisplay(original);
        const normalized = normalizeJoinCode(formatted);
        expect(normalized).toBe(original);
      }
    });

    it('should accept user input with various formats for generated codes', () => {
      const code = generateJoinCode();
      const formatted = formatJoinCodeForDisplay(code);

      // All these inputs should normalize to the same value
      expect(normalizeJoinCode(code)).toBe(code);
      expect(normalizeJoinCode(formatted)).toBe(code);
      expect(normalizeJoinCode(code.toLowerCase())).toBe(code);
      expect(normalizeJoinCode(formatted.toLowerCase())).toBe(code);
      expect(normalizeJoinCode('  ' + code + '  ')).toBe(code);
    });
  });
});

/**
 * Unit tests for join-code utilities.
 *
 * Covers: normalizeJoinCode, formatJoinCodeForDisplay, and the new
 * formatJoinCodeInput (partial-value formatter for controlled inputs).
 *
 * @jest-environment node
 */

import {
  normalizeJoinCode,
  formatJoinCodeForDisplay,
  formatJoinCodeInput,
  isCompleteJoinCode,
} from '../join-code';

describe('isCompleteJoinCode', () => {
  it('returns true for a 6-char uppercase alphanumeric code', () => {
    expect(isCompleteJoinCode('ABC123')).toBe(true);
  });

  it('returns true for a dash-formatted code like ABC-123', () => {
    expect(isCompleteJoinCode('ABC-123')).toBe(true);
  });

  it('returns true for a lowercase code (normalised to uppercase)', () => {
    expect(isCompleteJoinCode('abc123')).toBe(true);
  });

  it('returns false for fewer than 6 chars', () => {
    expect(isCompleteJoinCode('ABC12')).toBe(false);
  });

  it('returns false for more than 6 chars', () => {
    expect(isCompleteJoinCode('ABC1234')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isCompleteJoinCode('')).toBe(false);
  });

  it('returns false for code with special characters', () => {
    expect(isCompleteJoinCode('ABC!23')).toBe(false);
  });
});

describe('normalizeJoinCode', () => {
  it('strips dashes and uppercases', () => {
    expect(normalizeJoinCode('abc-123')).toBe('ABC123');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeJoinCode('')).toBe('');
  });
});

describe('formatJoinCodeForDisplay', () => {
  it('formats 6-char code as XXX-XXX', () => {
    expect(formatJoinCodeForDisplay('ABC123')).toBe('ABC-123');
  });

  it('returns original for non-6-char codes', () => {
    expect(formatJoinCodeForDisplay('AB')).toBe('AB');
  });
});

describe('formatJoinCodeInput', () => {
  it.each([
    ['abc123', 'ABC-123'],
    ['ab', 'AB'],
    ['abc1', 'ABC-1'],
    ['a b#c1', 'ABC-1'],
    ['abc123xyz', 'ABC-123'],
  ])('formats %s → %s', (input, expected) => {
    expect(formatJoinCodeInput(input)).toBe(expected);
  });

  it('strips non-alphanumeric characters and uppercases', () => {
    expect(formatJoinCodeInput('a b#c1')).toBe('ABC-1');
  });

  it('caps at 6 characters', () => {
    expect(formatJoinCodeInput('abc123xyz')).toBe('ABC-123');
  });

  it('returns empty string for empty input', () => {
    expect(formatJoinCodeInput('')).toBe('');
  });

  it('returns partial result for less than 3 chars', () => {
    expect(formatJoinCodeInput('ab')).toBe('AB');
  });

  it('handles exactly 3 chars without adding trailing dash', () => {
    expect(formatJoinCodeInput('abc')).toBe('ABC');
  });

  it('adds dash after first 3 chars when 4 chars entered', () => {
    expect(formatJoinCodeInput('abc1')).toBe('ABC-1');
  });
});

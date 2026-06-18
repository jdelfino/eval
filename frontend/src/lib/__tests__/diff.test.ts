/**
 * Unit tests for the unified line-diff utility (lib/diff.ts).
 *
 * Contract: lineDiff renders a unified-diff text (context "  ", removed "- ",
 * added "+ ") between two strings. It is consumed verbatim by the Solution
 * viewer (G7-T5) and Replay (G7-T6) CodeBlocks, so the prefix conventions and
 * graceful handling of empty/identical inputs must stay stable.
 */

import { lineDiff } from '@/lib/diff';

describe('lineDiff', () => {
  it('renders identical inputs entirely as context lines', () => {
    const text = 'a\nb\nc';
    const result = lineDiff(text, text);
    expect(result).toBe('  a\n  b\n  c');
  });

  it('marks added lines with "+ " and removed lines with "- "', () => {
    const before = 'def f():\n    return 1';
    const after = 'def f():\n    return 2';
    const result = lineDiff(before, after);
    expect(result).toContain('  def f():');
    expect(result).toContain('-     return 1');
    expect(result).toContain('+     return 2');
  });

  it('treats an empty before side as all additions', () => {
    const result = lineDiff('', 'x\ny');
    expect(result).toBe('+ x\n+ y');
  });

  it('treats an empty after side as all removals', () => {
    const result = lineDiff('x\ny', '');
    expect(result).toBe('- x\n- y');
  });

  it('preserves shared context around a changed region', () => {
    const before = 'one\ntwo\nthree';
    const after = 'one\nTWO\nthree';
    const result = lineDiff(before, after);
    const lines = result.split('\n');
    expect(lines[0]).toBe('  one');
    expect(lines).toContain('- two');
    expect(lines).toContain('+ TWO');
    expect(lines[lines.length - 1]).toBe('  three');
  });

  it('returns an empty string when both inputs are empty', () => {
    expect(lineDiff('', '')).toBe('');
  });
});

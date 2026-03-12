/**
 * Unit tests for parseErrorLineNumber utility.
 *
 * Tests the parsing of Python traceback error line numbers from error text.
 */

import { parseErrorLineNumber } from '../parse-error-line';

describe('parseErrorLineNumber', () => {
  it('returns null for empty string', () => {
    expect(parseErrorLineNumber('')).toBeNull();
  });

  it('returns null when no traceback pattern present', () => {
    expect(parseErrorLineNumber('NameError: name "x" is not defined')).toBeNull();
  });

  it('returns null for unrelated file references', () => {
    expect(parseErrorLineNumber('File "/tmp/other.py", line 5')).toBeNull();
  });

  it('parses single traceback line', () => {
    const error = 'Traceback (most recent call last):\n  File "<student code>", line 3, in <module>\nNameError: name "x" is not defined';
    expect(parseErrorLineNumber(error)).toBe(3);
  });

  it('returns last match for multi-frame traceback', () => {
    const error = [
      'Traceback (most recent call last):',
      '  File "<student code>", line 10, in <module>',
      '    foo()',
      '  File "<student code>", line 3, in foo',
      '    raise ValueError("bad")',
      'ValueError: bad',
    ].join('\n');
    // Should return 3, the last (most specific) match
    expect(parseErrorLineNumber(error)).toBe(3);
  });

  it('parses SyntaxError format', () => {
    const error = '  File "<student code>", line 5\n    print(\n         ^\nSyntaxError: unexpected EOF while parsing';
    expect(parseErrorLineNumber(error)).toBe(5);
  });

  it('handles line number 1', () => {
    const error = 'File "<student code>", line 1\nSyntaxError: invalid syntax';
    expect(parseErrorLineNumber(error)).toBe(1);
  });

  it('handles large line numbers', () => {
    const error = 'File "<student code>", line 999\nIndexError: list index out of range';
    expect(parseErrorLineNumber(error)).toBe(999);
  });

  it('ignores unrelated file references in multi-frame traceback', () => {
    const error = [
      'Traceback (most recent call last):',
      '  File "/usr/lib/python3/dist-packages/foo.py", line 42, in run',
      '    result = exec(code)',
      '  File "<student code>", line 7, in <module>',
      '    x = 1/0',
      'ZeroDivisionError: division by zero',
    ].join('\n');
    expect(parseErrorLineNumber(error)).toBe(7);
  });
});

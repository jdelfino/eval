import { toPlainText } from '../markdown';

describe('toPlainText', () => {
  it('returns empty string for null/undefined/empty', () => {
    expect(toPlainText(null)).toBe('');
    expect(toPlainText(undefined)).toBe('');
    expect(toPlainText('')).toBe('');
  });

  it('strips headings, inline code, and fenced code from a real problem description', () => {
    // The exact shape that rendered raw on the section-detail cards (eval-62n).
    const md =
      '# Sum Two Numbers\nWrite a program that reads two numbers from input and prints their sum.\n\n' +
      '## Instructions\n1. Use `input()` to read two numbers\n2. Convert them to integers using `int()`\n3. Print the sum\n\n' +
      '## Example\nInput:\n```\n5 3\n```\nOutput:\n```\n8\n```';
    const out = toPlainText(md);

    // No raw markdown syntax leaks into the preview.
    expect(out).not.toContain('#');
    expect(out).not.toContain('`');
    expect(out).not.toContain('```');
    // Readable prose + the inner code content survive.
    expect(out).toContain('Sum Two Numbers');
    expect(out).toContain('Write a program that reads two numbers');
    expect(out).toContain('Use input() to read two numbers');
    expect(out).toContain('Convert them to integers using int()');
    expect(out).toContain('5 3');
    expect(out).toContain('8');
    // Single-line (whitespace collapsed) for line-clamping.
    expect(out).not.toContain('\n');
  });

  it('strips emphasis, links, images, blockquotes, list markers, and rules', () => {
    expect(toPlainText('**bold** and *italic* and ~~struck~~')).toBe('bold and italic and struck');
    expect(toPlainText('see [the docs](https://example.com) now')).toBe('see the docs now');
    expect(toPlainText('![alt text](img.png) caption')).toBe('alt text caption');
    expect(toPlainText('> a quoted line')).toBe('a quoted line');
    expect(toPlainText('- first\n- second\n- third')).toBe('first second third');
    expect(toPlainText('1. one\n2. two')).toBe('one two');
    expect(toPlainText('above\n\n---\n\nbelow')).toBe('above below');
  });

  it('leaves plain text unchanged (aside from whitespace collapse)', () => {
    expect(toPlainText('Just a normal sentence.')).toBe('Just a normal sentence.');
    expect(toPlainText('multiple   spaces\tand\nlines')).toBe('multiple spaces and lines');
  });
});

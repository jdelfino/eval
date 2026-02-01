import { severityStyles } from '../analysis';

describe('severityStyles', () => {
  it('has entries for all four issue severity levels', () => {
    expect(Object.keys(severityStyles)).toEqual(
      expect.arrayContaining(['error', 'misconception', 'style', 'good-pattern'])
    );
    expect(Object.keys(severityStyles)).toHaveLength(4);
  });

  it.each(Object.entries(severityStyles))('severity "%s" has bg, text, and label strings', (_key, style) => {
    expect(typeof style.bg).toBe('string');
    expect(typeof style.text).toBe('string');
    expect(typeof style.label).toBe('string');
    expect(style.bg).not.toBe('');
    expect(style.text).not.toBe('');
    expect(style.label).not.toBe('');
  });
});

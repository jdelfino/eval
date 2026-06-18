import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { CodeBlock } from '../CodeBlock';

describe('CodeBlock', () => {
  /**
   * Test case 6: Renders given code text inside pre>code and preserves
   * whitespace/newlines. Verifies CodeBlock does not mangle code or diff
   * content. If violated, multi-line solutions and unified diffs would lose
   * their layout when displayed in the Solution viewer / Replay modals.
   */
  it('renders code inside pre > code preserving whitespace and newlines', () => {
    const code = 'def add(a, b):\n    return a + b\n';
    render(<CodeBlock>{code}</CodeBlock>);

    const codeEl = screen.getByText((_content, el) => el?.tagName === 'CODE');
    expect(codeEl.tagName).toBe('CODE');
    expect(codeEl.parentElement?.tagName).toBe('PRE');
    // textContent preserves the exact text including indentation and newline.
    expect(codeEl.textContent).toBe(code);
  });

  /**
   * Verifies the inverse-background, monospace presentation contract — the
   * defining visual property of this primitive (an inverse-bg code block).
   */
  it('applies inverse background and monospace font to the pre element', () => {
    const { container } = render(<CodeBlock>x = 1</CodeBlock>);
    const pre = container.querySelector('pre') as HTMLElement;
    expect(pre).not.toBeNull();
    expect(pre.style.background).toBe('var(--bg-inverse)');
    expect(pre.style.color).toBe('var(--fg-inverse)');
    expect(pre.style.fontFamily).toMatch(/mono/i);
  });

  it('forwards aria-label and className to the pre element', () => {
    const { container } = render(
      <CodeBlock aria-label="solution code" className="extra">
        y = 2
      </CodeBlock>
    );
    const pre = container.querySelector('pre') as HTMLElement;
    expect(pre.getAttribute('aria-label')).toBe('solution code');
    expect(pre.className).toContain('extra');
  });
});

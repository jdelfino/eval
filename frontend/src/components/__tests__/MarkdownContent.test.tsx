/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import MarkdownContent from '../MarkdownContent';

describe('MarkdownContent', () => {
  describe('Headers', () => {
    it('renders h1 headers', () => {
      render(<MarkdownContent content="# Header 1" />);
      const header = screen.getByRole('heading', { level: 1 });
      expect(header).toBeInTheDocument();
      expect(header).toHaveTextContent('Header 1');
    });

    it('renders h2 headers', () => {
      render(<MarkdownContent content="## Header 2" />);
      const header = screen.getByRole('heading', { level: 2 });
      expect(header).toBeInTheDocument();
      expect(header).toHaveTextContent('Header 2');
    });

    it('renders h3 headers', () => {
      render(<MarkdownContent content="### Header 3" />);
      const header = screen.getByRole('heading', { level: 3 });
      expect(header).toBeInTheDocument();
      expect(header).toHaveTextContent('Header 3');
    });
  });

  describe('Lists', () => {
    it('renders unordered lists', () => {
      const content = `- Item 1
- Item 2
- Item 3`;
      render(<MarkdownContent content={content} />);
      const list = screen.getByRole('list');
      expect(list).toBeInTheDocument();
      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 2')).toBeInTheDocument();
      expect(screen.getByText('Item 3')).toBeInTheDocument();
    });

    it('renders ordered lists', () => {
      const content = `1. First
2. Second
3. Third`;
      render(<MarkdownContent content={content} />);
      const list = screen.getByRole('list');
      expect(list).toBeInTheDocument();
      expect(screen.getByText('First')).toBeInTheDocument();
      expect(screen.getByText('Second')).toBeInTheDocument();
      expect(screen.getByText('Third')).toBeInTheDocument();
    });
  });

  describe('Code', () => {
    it('renders inline code', () => {
      render(<MarkdownContent content="Use the `print()` function" />);
      const code = screen.getByText('print()');
      expect(code.tagName).toBe('CODE');
    });

    it('renders code blocks', () => {
      const content = `\`\`\`python
print('hello')
\`\`\``;
      render(<MarkdownContent content={content} />);
      const code = screen.getByText("print('hello')");
      expect(code).toBeInTheDocument();
      expect(code.tagName).toBe('CODE');
    });
  });

  describe('Text formatting', () => {
    it('renders bold text', () => {
      render(<MarkdownContent content="This is **bold** text" />);
      const bold = screen.getByText('bold');
      expect(bold.tagName).toBe('STRONG');
    });

    it('renders italic text', () => {
      render(<MarkdownContent content="This is *italic* text" />);
      const italic = screen.getByText('italic');
      expect(italic.tagName).toBe('EM');
    });

    it('renders bold and italic together', () => {
      render(<MarkdownContent content="This is ***bold and italic*** text" />);
      // The text should be wrapped in both strong and em tags
      const text = screen.getByText('bold and italic');
      expect(text).toBeInTheDocument();
    });
  });

  describe('Links', () => {
    it('renders links with correct href', () => {
      render(<MarkdownContent content="[Click here](https://example.com)" />);
      const link = screen.getByRole('link', { name: 'Click here' });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', 'https://example.com');
    });

    it('opens links in new tab with security attributes', () => {
      render(<MarkdownContent content="[External](https://example.com)" />);
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  describe('Paragraphs', () => {
    it('renders paragraphs', () => {
      const content = `This is a paragraph.

This is another paragraph.`;
      render(<MarkdownContent content={content} />);
      expect(screen.getByText('This is a paragraph.')).toBeInTheDocument();
      expect(screen.getByText('This is another paragraph.')).toBeInTheDocument();
    });
  });

  describe('Blockquotes', () => {
    it('renders blockquotes', () => {
      render(<MarkdownContent content="> This is a quote" />);
      const blockquote = screen.getByText('This is a quote');
      expect(blockquote.closest('blockquote')).toBeInTheDocument();
    });
  });

  describe('Horizontal rules', () => {
    it('renders horizontal rules', () => {
      const content = `Above

---

Below`;
      const { container } = render(<MarkdownContent content={content} />);
      const hr = container.querySelector('hr');
      expect(hr).toBeInTheDocument();
    });
  });

  describe('Complex content', () => {
    it('renders a complex markdown document', () => {
      const complexMarkdown = `# Problem Title

Write a function that calculates the **factorial** of a number.

## Requirements

- Input: A non-negative integer \`n\`
- Output: The factorial of \`n\`
- Handle edge cases for \`n = 0\` and \`n = 1\`

## Example

\`\`\`python
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)
\`\`\`

For more information, see [Python docs](https://docs.python.org).`;

      render(<MarkdownContent content={complexMarkdown} />);

      // Check headers
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Problem Title');
      expect(screen.getByRole('heading', { level: 2, name: 'Requirements' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: 'Example' })).toBeInTheDocument();

      // Check bold text
      expect(screen.getByText('factorial')).toBeInTheDocument();

      // Check list items
      expect(screen.getByText(/A non-negative integer/)).toBeInTheDocument();
      expect(screen.getByText(/The factorial of/)).toBeInTheDocument();

      // Check link
      expect(screen.getByRole('link', { name: 'Python docs' })).toHaveAttribute('href', 'https://docs.python.org');
    });
  });

  describe('Props', () => {
    it('applies custom className', () => {
      const { container } = render(<MarkdownContent content="Test" className="custom-class" />);
      expect(container.firstChild).toHaveClass('custom-class');
      expect(container.firstChild).toHaveClass('markdown-content');
    });

    it('applies default markdown-content class', () => {
      const { container } = render(<MarkdownContent content="Test" />);
      expect(container.firstChild).toHaveClass('markdown-content');
    });
  });

  describe('Dark theme', () => {
    it('applies dark theme classes when darkTheme is true', () => {
      const { container } = render(<MarkdownContent content="# Title" darkTheme={true} />);
      const header = screen.getByRole('heading', { level: 1 });
      expect(header).toHaveClass('text-gray-100');
    });

    it('applies light theme classes by default', () => {
      const { container } = render(<MarkdownContent content="# Title" />);
      const header = screen.getByRole('heading', { level: 1 });
      expect(header).toHaveClass('text-gray-900');
    });

    it('applies dark theme to paragraphs', () => {
      render(<MarkdownContent content="Some text" darkTheme={true} />);
      const paragraph = screen.getByText('Some text');
      expect(paragraph).toHaveClass('text-gray-300');
    });

    it('applies dark theme to inline code', () => {
      render(<MarkdownContent content="Use `code` here" darkTheme={true} />);
      const code = screen.getByText('code');
      expect(code).toHaveClass('bg-gray-700');
      expect(code).toHaveClass('text-gray-200');
    });

    it('applies dark theme to links', () => {
      render(<MarkdownContent content="[Link](https://example.com)" darkTheme={true} />);
      const link = screen.getByRole('link');
      expect(link).toHaveClass('text-blue-400');
    });
  });

  describe('Line breaks', () => {
    it('renders single newlines as line breaks', () => {
      const content = `Line one\nLine two\nLine three`;
      const { container } = render(<MarkdownContent content={content} />);
      const brs = container.querySelectorAll('br');
      expect(brs.length).toBe(2);
    });
  });

  describe('Edge cases', () => {
    it('handles empty content', () => {
      const { container } = render(<MarkdownContent content="" />);
      expect(container.firstChild).toBeInTheDocument();
      expect(container.firstChild).toHaveClass('markdown-content');
    });

    it('handles plain text without markdown', () => {
      render(<MarkdownContent content="Just plain text without any markdown" />);
      expect(screen.getByText('Just plain text without any markdown')).toBeInTheDocument();
    });

    it('escapes HTML to prevent XSS', () => {
      render(<MarkdownContent content="<script>alert('xss')</script>" />);
      // The script tag should not be rendered as an actual script element
      // It will be displayed as escaped text by react-markdown
      // Verify no actual script element was created
      expect(document.querySelector('script')).toBeNull();
    });
  });
});

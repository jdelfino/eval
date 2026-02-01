/**
 * Mock for react-markdown
 *
 * This mock provides a simplified version of react-markdown for testing purposes.
 * It transforms basic markdown syntax to HTML elements for test assertions.
 */
import React from 'react';

interface ReactMarkdownProps {
  children: string;
  components?: Record<string, React.ComponentType<any>>;
}

// Simple markdown parser for testing
function parseMarkdown(content: string, components: Record<string, React.ComponentType<any>> = {}): React.ReactNode[] {
  const lines = content.split('\n');
  const result: React.ReactNode[] = [];
  let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;
  let codeBlock: { lang: string; lines: string[] } | null = null;
  let paragraphLines: string[] | null = null;
  let keyCounter = 0;

  const getKey = () => `md-${keyCounter++}`;

  const flushParagraph = () => {
    if (paragraphLines && paragraphLines.length > 0) {
      const PComponent = components.p || ((props: any) => <p {...props} />);
      const children: React.ReactNode[] = [];
      paragraphLines.forEach((pLine, i) => {
        if (i > 0) {
          children.push(<br key={`br-${i}`} />);
        }
        const inline = parseInline(pLine, components);
        if (Array.isArray(inline)) {
          children.push(...inline);
        } else {
          children.push(inline);
        }
      });
      result.push(<PComponent key={getKey()}>{children}</PComponent>);
      paragraphLines = null;
    }
  };

  const flushList = () => {
    if (currentList) {
      const ListComponent = currentList.type === 'ul'
        ? (components.ul || ((props: any) => <ul {...props} />))
        : (components.ol || ((props: any) => <ol {...props} />));
      const LiComponent = components.li || ((props: any) => <li {...props} />);

      result.push(
        <ListComponent key={getKey()}>
          {currentList.items.map((item, i) => (
            <LiComponent key={i}>{parseInline(item, components)}</LiComponent>
          ))}
        </ListComponent>
      );
      currentList = null;
    }
  };

  const flushCodeBlock = () => {
    if (codeBlock) {
      const PreComponent = components.pre || ((props: any) => <pre {...props} />);
      const CodeComponent = components.code || ((props: any) => <code {...props} />);
      const codeContent = codeBlock.lines.join('\n');
      result.push(
        <PreComponent key={getKey()}>
          <CodeComponent className={codeBlock.lang ? `language-${codeBlock.lang}` : undefined}>
            {codeContent}
          </CodeComponent>
        </PreComponent>
      );
      codeBlock = null;
    }
  };

  for (const line of lines) {
    // Code block start/end
    if (line.startsWith('```')) {
      if (codeBlock) {
        flushCodeBlock();
      } else {
        flushParagraph();
        flushList();
        codeBlock = { lang: line.slice(3).trim(), lines: [] };
      }
      continue;
    }

    // Inside code block
    if (codeBlock) {
      codeBlock.lines.push(line);
      continue;
    }

    // Empty line
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      flushParagraph();
      flushList();
      const HrComponent = components.hr || ((props: any) => <hr {...props} />);
      result.push(<HrComponent key={getKey()} />);
      continue;
    }

    // Headers
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      flushParagraph();
      flushList();
      const level = headerMatch[1].length;
      const text = headerMatch[2];
      const HeaderComponent = components[`h${level}`] || ((props: any) => React.createElement(`h${level}`, props));
      result.push(<HeaderComponent key={getKey()}>{parseInline(text, components)}</HeaderComponent>);
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      flushParagraph();
      flushList();
      const BlockquoteComponent = components.blockquote || ((props: any) => <blockquote {...props} />);
      const PComponent = components.p || ((props: any) => <p {...props} />);
      result.push(
        <BlockquoteComponent key={getKey()}>
          <PComponent>{parseInline(line.slice(2), components)}</PComponent>
        </BlockquoteComponent>
      );
      continue;
    }

    // Unordered list
    if (line.match(/^[-*]\s+/)) {
      if (!currentList || currentList.type !== 'ul') {
        flushParagraph();
        flushList();
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(line.replace(/^[-*]\s+/, ''));
      continue;
    }

    // Ordered list
    if (line.match(/^\d+\.\s+/)) {
      if (!currentList || currentList.type !== 'ol') {
        flushParagraph();
        flushList();
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push(line.replace(/^\d+\.\s+/, ''));
      continue;
    }

    // Regular text line - accumulate for paragraph with line breaks
    if (!paragraphLines) {
      paragraphLines = [];
    }
    paragraphLines.push(line);
    continue;
  }

  flushParagraph();
  flushList();
  flushCodeBlock();

  return result;
}

function parseInline(text: string, components: Record<string, React.ComponentType<any>> = {}): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyCounter = 0;

  const getKey = () => `inline-${keyCounter++}`;

  while (remaining.length > 0) {
    // Bold and italic (***text***)
    const boldItalicMatch = remaining.match(/^\*\*\*(.+?)\*\*\*/);
    if (boldItalicMatch) {
      const StrongComponent = components.strong || ((props: any) => <strong {...props} />);
      const EmComponent = components.em || ((props: any) => <em {...props} />);
      parts.push(
        <StrongComponent key={getKey()}>
          <EmComponent>{boldItalicMatch[1]}</EmComponent>
        </StrongComponent>
      );
      remaining = remaining.slice(boldItalicMatch[0].length);
      continue;
    }

    // Bold (**text**)
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) {
      const StrongComponent = components.strong || ((props: any) => <strong {...props} />);
      parts.push(<StrongComponent key={getKey()}>{boldMatch[1]}</StrongComponent>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic (*text*)
    const italicMatch = remaining.match(/^\*(.+?)\*/);
    if (italicMatch) {
      const EmComponent = components.em || ((props: any) => <em {...props} />);
      parts.push(<EmComponent key={getKey()}>{italicMatch[1]}</EmComponent>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Inline code (`code`)
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      const CodeComponent = components.code || ((props: any) => <code {...props} />);
      parts.push(<CodeComponent key={getKey()}>{codeMatch[1]}</CodeComponent>);
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Links ([text](url))
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      const AComponent = components.a || ((props: any) => <a {...props} />);
      parts.push(<AComponent key={getKey()} href={linkMatch[2]}>{linkMatch[1]}</AComponent>);
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Plain text (up to next special character)
    const textMatch = remaining.match(/^[^*`\[]+/);
    if (textMatch) {
      parts.push(textMatch[0]);
      remaining = remaining.slice(textMatch[0].length);
      continue;
    }

    // Single special character that didn't match any pattern
    parts.push(remaining[0]);
    remaining = remaining.slice(1);
  }

  // If only one part, return it directly
  if (parts.length === 1) {
    return parts[0];
  }

  return parts;
}

export default function ReactMarkdown({ children, components = {} }: ReactMarkdownProps) {
  return <>{parseMarkdown(children, components)}</>;
}

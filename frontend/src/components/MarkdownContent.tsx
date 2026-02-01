'use client';

/**
 * MarkdownContent Component
 *
 * Renders markdown content with styling for common elements like
 * headers, lists, code blocks, bold, italic, and links.
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';

interface MarkdownContentProps {
  content: string;
  className?: string;
  darkTheme?: boolean;
}

export default function MarkdownContent({ content, className = '', darkTheme = false }: MarkdownContentProps) {
  // Color classes based on theme
  const colors = darkTheme
    ? {
        heading: 'text-gray-100',
        headingSecondary: 'text-gray-200',
        text: 'text-gray-300',
        textMuted: 'text-gray-400',
        inlineCodeBg: 'bg-gray-700',
        inlineCodeText: 'text-gray-200',
        link: 'text-blue-400 hover:text-blue-300',
        blockquoteBorder: 'border-gray-600',
        blockquoteText: 'text-gray-400',
        hrBorder: 'border-gray-600',
      }
    : {
        heading: 'text-gray-900',
        headingSecondary: 'text-gray-800',
        text: 'text-gray-700',
        textMuted: 'text-gray-600',
        inlineCodeBg: 'bg-gray-200',
        inlineCodeText: 'text-gray-800',
        link: 'text-blue-600 hover:text-blue-800',
        blockquoteBorder: 'border-gray-300',
        blockquoteText: 'text-gray-600',
        hrBorder: 'border-gray-300',
      };

  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkBreaks]}
        components={{
          // Headers
          h1: ({ children }) => (
            <h1 className={`text-2xl font-bold ${colors.heading} mt-4 mb-2 first:mt-0`}>{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className={`text-xl font-bold ${colors.heading} mt-3 mb-2 first:mt-0`}>{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className={`text-lg font-semibold ${colors.heading} mt-3 mb-1 first:mt-0`}>{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className={`text-base font-semibold ${colors.heading} mt-2 mb-1 first:mt-0`}>{children}</h4>
          ),
          h5: ({ children }) => (
            <h5 className={`text-sm font-semibold ${colors.heading} mt-2 mb-1 first:mt-0`}>{children}</h5>
          ),
          h6: ({ children }) => (
            <h6 className={`text-sm font-medium ${colors.headingSecondary} mt-2 mb-1 first:mt-0`}>{children}</h6>
          ),
          // Paragraphs
          p: ({ children }) => (
            <p className={`${colors.text} mb-2 last:mb-0`}>{children}</p>
          ),
          // Lists
          ul: ({ children }) => (
            <ul className={`list-disc list-inside ${colors.text} mb-2 space-y-1`}>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className={`list-decimal list-inside ${colors.text} mb-2 space-y-1`}>{children}</ol>
          ),
          li: ({ children }) => (
            <li className={colors.text}>{children}</li>
          ),
          // Code
          code: ({ className: codeClassName, children, ...props }) => {
            // Check if this is a code block (has language class) or inline code
            const isCodeBlock = codeClassName?.includes('language-');
            if (isCodeBlock) {
              return (
                <code className={`block bg-gray-900 text-gray-100 p-3 rounded overflow-x-auto text-sm font-mono ${codeClassName || ''}`} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className={`${colors.inlineCodeBg} ${colors.inlineCodeText} px-1.5 py-0.5 rounded text-sm font-mono`} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="mb-2 last:mb-0">{children}</pre>
          ),
          // Links
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={`${colors.link} underline`}
            >
              {children}
            </a>
          ),
          // Strong and emphasis
          strong: ({ children }) => (
            <strong className={`font-bold ${colors.heading}`}>{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic">{children}</em>
          ),
          // Blockquote
          blockquote: ({ children }) => (
            <blockquote className={`border-l-4 ${colors.blockquoteBorder} pl-4 italic ${colors.blockquoteText} my-2`}>
              {children}
            </blockquote>
          ),
          // Horizontal rule
          hr: () => (
            <hr className={`border-t ${colors.hrBorder} my-4`} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

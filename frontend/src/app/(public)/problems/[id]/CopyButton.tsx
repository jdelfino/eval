'use client';

import { useState, useCallback, type RefObject } from 'react';

/**
 * Copy button that copies rich text (HTML with syntax highlighting) to clipboard.
 * Uses a ref to the code container to grab the rendered HTML.
 */
export default function CopyButton({ codeRef }: { codeRef: RefObject<HTMLDivElement | null> }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const el = codeRef.current;
    if (!el) return;

    const html = el.innerHTML;
    const plainText = el.innerText;

    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
        }),
      ]);
    } catch {
      // Fallback: plain text copy
      await navigator.clipboard.writeText(plainText);
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [codeRef]);

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
      title="Copy solution"
      aria-label="Copy solution"
    >
      {copied ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

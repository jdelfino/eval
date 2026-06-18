'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

export interface OpenOnLaptopProps {
  /** Heading copy. Defaults to the v4 public-problem guidance. */
  title?: string;
  /** Supporting copy. Defaults to the v4 public-problem guidance. */
  body?: string;
  /**
   * Optional secondary action rendered beneath the primary "Copy link" button —
   * e.g. a "You can still sign in →" link so an anon mobile user arriving via a
   * deep-link isn't dead-ended.
   */
  secondaryAction?: React.ReactNode;
}

/**
 * OpenOnLaptop — shared, dependency-free mobile read-only affordance (G8).
 *
 * Shown anywhere a mobile user would otherwise try to do real work (notably the
 * /student workspace guard). The "laptop URL" is simply the current URL, so the
 * "Copy link" button copies `window.location.href` via the Clipboard API — no QR
 * library, no short-URL/email backend. Clipboard failures degrade gracefully.
 *
 * This is always a fragment of a larger page, never the page landmark itself —
 * every call site already sits inside a layout/shell `<main>`. So the root is a
 * role-neutral `<div>` and the heading is an `<h2>` (not `<h1>`): a second page
 * `<main>` or page `<h1>` would be invalid HTML and break landmark/heading nav.
 */
export function OpenOnLaptop({
  title = 'Coding works best on a laptop',
  body = "You'll write code on a bigger screen.",
  secondaryAction,
}: OpenOnLaptopProps): React.ReactElement {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be unavailable (insecure context) or rejected
      // (permission denied). Leave the button usable; do not throw.
    }
  };

  return (
    <div
      style={{
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '32px 20px',
        textAlign: 'center',
        background: 'var(--bg, #fff)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 48,
          height: 48,
          borderRadius: 'var(--radius)',
          background: 'var(--accent-soft)',
          color: 'var(--accent-ink)',
        }}
        aria-hidden="true"
      >
        <Icon name="info" size={22} />
      </div>

      <div style={{ maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h2
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 22,
            fontWeight: 500,
            letterSpacing: -0.5,
            color: 'var(--fg)',
            margin: 0,
          }}
        >
          {title}
        </h2>
        <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--fg-muted)', margin: 0 }}>
          {body}
        </p>
      </div>

      <Button
        variant="accent"
        size="lg"
        onClick={handleCopy}
        style={{ minHeight: '44px', minWidth: '44px', gap: 8 }}
      >
        <Icon name="link" size={16} />
        {copied ? 'Link copied' : 'Copy link'}
      </Button>

      {secondaryAction}
    </div>
  );
}

export default OpenOnLaptop;

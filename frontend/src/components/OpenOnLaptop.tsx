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
 * "Copy link" button copies `window.location.href` — no QR library, no
 * short-URL/email backend.
 *
 * Copy degrades through three tiers so the affordance always communicates:
 *   1. navigator.clipboard.writeText (secure context) → "Link copied".
 *   2. document.execCommand('copy') fallback (insecure context, where
 *      navigator.clipboard is undefined) → "Link copied".
 *   3. If neither works, the URL is revealed as selectable text so the user can
 *      copy it manually — the button never silently no-ops (G8 polish).
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
  // The URL is revealed as selectable text only after every copy mechanism fails,
  // so an insecure-context user can still copy it by hand (tier 3).
  const [showUrl, setShowUrl] = useState(false);

  const markCopied = () => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  /**
   * execCommand('copy') fallback for insecure contexts where
   * navigator.clipboard is undefined. Selects a transient off-screen textarea and
   * asks the document to copy it. Returns whether the copy succeeded.
   */
  const copyViaExecCommand = (text: string): boolean => {
    if (typeof document.execCommand !== 'function') return false;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    // Keep it out of view and unfocusable to the eye, but selectable.
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    try {
      textarea.select();
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  };

  const handleCopy = async () => {
    const url = window.location.href;

    // Tier 1: Clipboard API (secure context).
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        markCopied();
        return;
      } catch {
        // Permission denied or rejected — fall through to the execCommand tier.
      }
    }

    // Tier 2: execCommand('copy') (insecure context, where clipboard is absent).
    if (copyViaExecCommand(url)) {
      markCopied();
      return;
    }

    // Tier 3: nothing copied — reveal the URL so the user can copy it manually.
    setShowUrl(true);
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
        className="bg-accent-soft text-accent-ink"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 48,
          height: 48,
          borderRadius: 'var(--radius)',
        }}
        aria-hidden="true"
      >
        <Icon name="info" size={22} />
      </div>

      <div style={{ maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h2
          className="text-fg"
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 22,
            fontWeight: 500,
            letterSpacing: -0.5,
            margin: 0,
          }}
        >
          {title}
        </h2>
        <p className="text-fg-muted" style={{ fontSize: 14, lineHeight: 1.5, margin: 0 }}>
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

      {showUrl && (
        <p
          className="text-fg-muted"
          style={{
            fontSize: 12,
            lineHeight: 1.5,
            margin: 0,
            maxWidth: 360,
            wordBreak: 'break-all',
            userSelect: 'all',
          }}
        >
          {window.location.href}
        </p>
      )}

      {secondaryAction}
    </div>
  );
}

export default OpenOnLaptop;

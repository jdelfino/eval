'use client';

import React, { useEffect, useId, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { IconBtn } from './IconBtn';

export type ModalTone = 'danger' | 'warn' | 'info' | 'accent';

export interface ModalProps {
  /** Whether the modal is open. When false, nothing renders. */
  open: boolean;
  /** Modal title, rendered as a heading and used as the aria-label target. */
  title: string;
  /** Optional muted subtitle under the title. */
  sub?: string;
  /** Optional tone — renders a soft-bg icon chip in the header. */
  tone?: ModalTone;
  /** Panel width in pixels (capped at 100%). Default 520. */
  width?: number;
  /** Optional footer content, right-aligned on a sunken bar. */
  footer?: React.ReactNode;
  /** Called on Escape, backdrop click, or close-button press. */
  onClose: () => void;
  /** Modal body. */
  children: React.ReactNode;
  /** ARIA role for the panel. Default 'dialog'. */
  role?: string;
  /** Optional data-testid for the backdrop node. */
  backdropTestId?: string;
  /** Optional data-testid for the content (panel) node. */
  contentTestId?: string;
}

const TONE_MAP: Record<ModalTone, { bg: string; fg: string }> = {
  danger: { bg: 'var(--danger-soft)', fg: 'var(--danger)' },
  warn:   { bg: 'var(--warn-soft)',   fg: 'var(--warn)' },
  info:   { bg: 'var(--info-soft)',   fg: 'var(--info)' },
  accent: { bg: 'var(--accent-soft)', fg: 'var(--accent-ink)' },
};

/**
 * Modal — portal-based dialog primitive.
 *
 * Renders into `document.body` via createPortal with a blurred backdrop,
 * token-styled raised panel, optional tone-icon header, scrollable body, and an
 * optional right-aligned footer. A11y (focus trap on open, focus restore on
 * close, Escape-to-close, body scroll-lock, role/aria-modal/aria-labelledby) is
 * lifted verbatim from the previous hand-rolled ConfirmDialog pattern so the
 * G7 modals (and ConfirmDialog's rebuild) all share one accessible shell.
 *
 * Tabs are NOT built in — callers compose the existing Tabs primitive into the
 * body where needed (Solution viewer, Replay).
 */
export function Modal({
  open,
  title,
  sub,
  tone,
  width = 520,
  footer,
  onClose,
  children,
  role = 'dialog',
  backdropTestId,
  contentTestId,
}: ModalProps): React.ReactElement | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<Element | null>(null);
  const titleId = useId();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;

    // Store the previously focused element so we can restore it on close.
    previousActiveElement.current = document.activeElement;

    document.addEventListener('keydown', handleKeyDown);

    // Focus the first focusable element in the panel (the close button) once
    // the portal content is rendered.
    const timer = setTimeout(() => {
      const focusTarget = panelRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      focusTarget?.focus();
    }, 0);

    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
      document.body.style.overflow = '';

      if (previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus();
      }
    };
  }, [open, handleKeyDown]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  const toneStyle = tone ? TONE_MAP[tone] : null;

  return createPortal(
    <div
      role={role}
      aria-modal="true"
      aria-labelledby={titleId}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'oklch(0.18 0.012 80 / 0.42)',
        backdropFilter: 'blur(2px)',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
      }}
      data-testid={backdropTestId}
      onClick={(e) => {
        // Only the backdrop itself (not bubbled clicks from the panel) closes.
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        data-testid={contentTestId}
        style={{
          width,
          maxWidth: '100%',
          maxHeight: '100%',
          background: 'var(--bg-raised)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <header
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          {toneStyle && (
            <div
              aria-hidden="true"
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                background: toneStyle.bg,
                color: toneStyle.fg,
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <Icon name={tone === 'danger' || tone === 'warn' ? 'alert' : 'info'} size={14} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              id={titleId}
              style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.2, margin: 0 }}
            >
              {title}
            </h2>
            {sub && (
              <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>{sub}</div>
            )}
          </div>
          <IconBtn icon="x" onClick={onClose} title="Close" />
        </header>

        <div style={{ flex: 1, padding: 16, overflow: 'auto', fontSize: 13, lineHeight: 1.5 }}>
          {children}
        </div>

        {footer && (
          <footer
            style={{
              padding: 12,
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-sunken)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 8,
            }}
          >
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
}

export default Modal;

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
  /**
   * Override the auto-generated id placed on the heading title node and pointed
   * at by aria-labelledby. ConfirmDialog uses this to preserve its stable
   * `confirm-dialog-title` id.
   */
  titleId?: string;
  /** Value for the dialog's aria-describedby attribute, if any. */
  'aria-describedby'?: string;
  /**
   * CSS selector (queried within the panel) for the element to focus on open,
   * instead of the first focusable element. ConfirmDialog uses this to focus
   * its confirm button rather than the close (X) button.
   */
  initialFocusSelector?: string;
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

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
 * optional right-aligned footer. A11y (initial focus on open, Tab/Shift+Tab
 * focus trap, focus restore on close, Escape-to-close, body scroll-lock,
 * role/aria-modal/aria-labelledby) so the G7 modals (and ConfirmDialog's
 * rebuild) all share one accessible shell.
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
  titleId: titleIdProp,
  'aria-describedby': ariaDescribedBy,
  initialFocusSelector,
}: ModalProps): React.ReactElement | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<Element | null>(null);
  const generatedTitleId = useId();
  const titleId = titleIdProp ?? generatedTitleId;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      // Tab/Shift+Tab focus trap: cycle within the panel's focusable elements.
      if (event.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) return;
        const focusable = Array.from(
          panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (event.shiftKey) {
          // Shift+Tab from the first element (or outside the panel) wraps to last.
          if (active === first || !panel.contains(active)) {
            event.preventDefault();
            last.focus();
          }
        } else {
          // Tab from the last element (or outside the panel) wraps to first.
          if (active === last || !panel.contains(active)) {
            event.preventDefault();
            first.focus();
          }
        }
      }
    },
    [onClose]
  );

  // Keydown listener (Escape + focus trap). Keyed on the handler identity so it
  // stays current, but kept separate from focus/scroll management below so that
  // a transient onClose identity change does not re-run focus capture/restore.
  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  // Focus capture/restore + body scroll-lock. Keyed only on [open] (and the
  // initial-focus selector) so parent re-renders that change the onClose
  // identity do NOT tear this down and steal the user's in-modal focus.
  useEffect(() => {
    if (!open) return;

    // Store the previously focused element so we can restore it on close.
    previousActiveElement.current = document.activeElement;

    // Focus the initial target (or first focusable element) in the panel once
    // the portal content is rendered.
    const timer = setTimeout(() => {
      const focusTarget =
        (initialFocusSelector
          ? panelRef.current?.querySelector<HTMLElement>(initialFocusSelector)
          : null) ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      focusTarget?.focus();
    }, 0);

    document.body.style.overflow = 'hidden';

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = '';

      if (previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus();
      }
    };
  }, [open, initialFocusSelector]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  const toneStyle = tone ? TONE_MAP[tone] : null;

  return createPortal(
    <div
      role={role}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={ariaDescribedBy}
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
        className="bg-bg-raised border border-border"
        style={{
          position: 'relative',
          width,
          maxWidth: '100%',
          maxHeight: '100%',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <header
          className="border-b border-border"
          style={{
            padding: '14px 16px',
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
              <div className="text-fg-muted" style={{ fontSize: 12, marginTop: 2 }}>{sub}</div>
            )}
          </div>
          <IconBtn icon="x" onClick={onClose} title="Close" />
        </header>

        <div style={{ flex: 1, padding: 16, overflow: 'auto', fontSize: 13, lineHeight: 1.5 }}>
          {children}
        </div>

        {footer && (
          <footer
            className="border-t border-border bg-bg-sunken"
            style={{
              padding: 12,
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

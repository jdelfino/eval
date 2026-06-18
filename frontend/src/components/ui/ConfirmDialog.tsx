'use client';

import React, { useEffect, useCallback, useState } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';
import { JoinCodeBoxes } from './JoinCodeBoxes';
import { normalizeJoinCode, formatJoinCodeForDisplay } from '@/lib/join-code';

/**
 * Confirm dialog variant options
 */
export type ConfirmDialogVariant = 'default' | 'danger';

/**
 * Props for ConfirmDialog component
 */
export interface ConfirmDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Dialog title */
  title: string;
  /** Dialog message (context-aware, e.g., "5 students are connected. Are you sure?") */
  message: string;
  /** Label for the confirm button */
  confirmLabel?: string;
  /** Label for the cancel button */
  cancelLabel?: string;
  /** Visual variant - use 'danger' for destructive actions */
  variant?: ConfirmDialogVariant;
  /** Called when the user confirms the action */
  onConfirm: () => void;
  /** Called when the user cancels (including Escape key) */
  onCancel: () => void;
  /** Whether the confirm action is in progress */
  loading?: boolean;
  /**
   * Optional type-to-confirm phrase (e.g. a section join code, "ABC-123").
   * When set, a segmented input is shown and the confirm button stays disabled
   * (and Enter is gated) until the typed value normalizes to this phrase.
   */
  confirmPhrase?: string;
}

/**
 * ConfirmDialog component for destructive action confirmations.
 *
 * Rebuilt on the Modal primitive: focus-trap, Escape-to-close, focus restore,
 * body scroll-lock, and the portal/backdrop all come from Modal. ConfirmDialog
 * preserves its stable public API and testids (`data-confirm-button`,
 * `data-cancel-button`, `confirm-dialog-title`, `confirm-dialog-message`,
 * `confirm-dialog-backdrop` — now the Modal's real backdrop node) so its call
 * sites stay untouched.
 *
 * Features:
 * - Title and context-aware message
 * - Confirm/Cancel buttons with variant styling
 * - Keyboard support (Escape to cancel, Enter to confirm)
 * - Loading state support
 * - Optional type-to-confirm gating via `confirmPhrase`
 *
 * @example
 * ```tsx
 * <ConfirmDialog
 *   open={showConfirm}
 *   title="End Session"
 *   message="5 students are connected. Are you sure?"
 *   confirmLabel="End Session"
 *   variant="danger"
 *   onConfirm={handleEnd}
 *   onCancel={() => setShowConfirm(false)}
 * />
 * ```
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
  loading = false,
  confirmPhrase,
}: ConfirmDialogProps) {
  const [typedPhrase, setTypedPhrase] = useState('');

  const phraseRequired = typeof confirmPhrase === 'string' && confirmPhrase.length > 0;
  const phraseMatches =
    !phraseRequired ||
    normalizeJoinCode(typedPhrase) === normalizeJoinCode(confirmPhrase as string);

  const confirmDisabled = loading || !phraseMatches;

  // Reset the typed phrase whenever the dialog opens (or closes), so a reopen
  // never leaks the previously-typed value.
  useEffect(() => {
    setTypedPhrase('');
  }, [open]);

  // Enter-to-confirm (unless focus is on the cancel button), gated on loading
  // and — when a phrase is required — on the phrase matching.
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!open) return;
      if (event.key !== 'Enter' || confirmDisabled) return;

      // Don't fire when the cancel button is focused (Enter there is a cancel).
      const activeElement = document.activeElement;
      if (!activeElement?.hasAttribute('data-cancel-button')) {
        event.preventDefault();
        onConfirm();
      }
    },
    [open, onConfirm, confirmDisabled]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) {
    return null;
  }

  const confirmButtonVariant = variant === 'danger' ? 'danger' : 'primary';

  const footer = (
    <>
      <Button
        variant="secondary"
        onClick={onCancel}
        disabled={loading}
        data-cancel-button
      >
        {cancelLabel}
      </Button>
      <Button
        variant={confirmButtonVariant}
        onClick={onConfirm}
        loading={loading}
        disabled={confirmDisabled}
        data-confirm-button
      >
        {confirmLabel}
      </Button>
    </>
  );

  return (
    <Modal
      open={open}
      title={title}
      tone={variant === 'danger' ? 'danger' : undefined}
      onClose={onCancel}
      footer={footer}
      titleId="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      backdropTestId="confirm-dialog-backdrop"
      initialFocusSelector="[data-confirm-button]"
    >
      <div>
        <p id="confirm-dialog-message" style={{ margin: 0 }}>
          {message}
        </p>
        {phraseRequired && (
          <div style={{ marginTop: 16 }}>
            <label
              htmlFor="confirm-phrase"
              style={{
                display: 'block',
                fontSize: 12,
                color: 'var(--fg-muted)',
                marginBottom: 8,
              }}
            >
              Type &ldquo;{formatJoinCodeForDisplay(confirmPhrase as string)}&rdquo; to confirm
            </label>
            <JoinCodeBoxes
              id="confirm-phrase"
              size="md"
              value={typedPhrase}
              onChange={setTypedPhrase}
              aria-label="Type the confirmation phrase"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

export default ConfirmDialog;

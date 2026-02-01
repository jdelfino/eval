'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { Button } from './Button';

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
}

/**
 * ConfirmDialog component for destructive action confirmations
 *
 * Features:
 * - Modal overlay with focus trap
 * - Title and context-aware message
 * - Confirm/Cancel buttons with variant styling
 * - Keyboard support (Escape to cancel, Enter to confirm)
 * - Loading state support
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
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElement = useRef<Element | null>(null);

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!open) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      } else if (event.key === 'Enter' && !loading) {
        // Only trigger if not focused on the cancel button
        const activeElement = document.activeElement;
        const cancelButton = dialogRef.current?.querySelector('[data-cancel-button]');
        if (activeElement !== cancelButton) {
          event.preventDefault();
          onConfirm();
        }
      }
    },
    [open, onCancel, onConfirm, loading]
  );

  // Set up keyboard listeners and focus management
  useEffect(() => {
    if (open) {
      // Store the previously focused element
      previousActiveElement.current = document.activeElement;

      // Add keyboard listener
      document.addEventListener('keydown', handleKeyDown);

      // Focus the confirm button
      // Use timeout to ensure the dialog is rendered
      const timer = setTimeout(() => {
        confirmButtonRef.current?.focus();
      }, 0);

      // Prevent body scroll
      document.body.style.overflow = 'hidden';

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        clearTimeout(timer);
        document.body.style.overflow = '';

        // Restore focus to the previously focused element
        if (previousActiveElement.current instanceof HTMLElement) {
          previousActiveElement.current.focus();
        }
      };
    }
  }, [open, handleKeyDown]);

  // Don't render anything if not open
  if (!open) {
    return null;
  }

  const confirmButtonVariant = variant === 'danger' ? 'danger' : 'primary';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity"
        onClick={onCancel}
        aria-hidden="true"
        data-testid="confirm-dialog-backdrop"
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 transform transition-all"
        role="document"
      >
        {/* Title */}
        <h2
          id="confirm-dialog-title"
          className="text-lg font-semibold text-gray-900 mb-2"
        >
          {title}
        </h2>

        {/* Message */}
        <p
          id="confirm-dialog-message"
          className="text-sm text-gray-600 mb-6"
        >
          {message}
        </p>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={loading}
            data-cancel-button
          >
            {cancelLabel}
          </Button>
          <Button
            ref={confirmButtonRef}
            variant={confirmButtonVariant}
            onClick={onConfirm}
            loading={loading}
            data-confirm-button
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;

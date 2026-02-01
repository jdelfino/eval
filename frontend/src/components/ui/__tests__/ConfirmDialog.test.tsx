/**
 * Unit tests for ConfirmDialog component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '../ConfirmDialog';

describe('ConfirmDialog', () => {
  const defaultProps = {
    open: true,
    title: 'Confirm Action',
    message: 'Are you sure you want to proceed?',
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render when open is true', () => {
      render(<ConfirmDialog {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Confirm Action')).toBeInTheDocument();
      expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
    });

    it('should not render when open is false', () => {
      render(<ConfirmDialog {...defaultProps} open={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should render with default button labels', () => {
      render(<ConfirmDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('should render with custom button labels', () => {
      render(
        <ConfirmDialog
          {...defaultProps}
          confirmLabel="End Session"
          cancelLabel="Go Back"
        />
      );

      expect(screen.getByRole('button', { name: 'End Session' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Go Back' })).toBeInTheDocument();
    });

    it('should render context-aware messages', () => {
      render(
        <ConfirmDialog
          {...defaultProps}
          title="End Session"
          message="5 students are connected. Are you sure?"
        />
      );

      expect(screen.getByText('End Session')).toBeInTheDocument();
      expect(screen.getByText('5 students are connected. Are you sure?')).toBeInTheDocument();
    });
  });

  describe('variants', () => {
    it('should render with default variant (primary confirm button)', () => {
      render(<ConfirmDialog {...defaultProps} />);

      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      expect(confirmButton).toHaveClass('bg-gradient-to-r');
      expect(confirmButton).toHaveClass('from-indigo-600');
    });

    it('should render with danger variant (red confirm button)', () => {
      render(<ConfirmDialog {...defaultProps} variant="danger" />);

      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      expect(confirmButton).toHaveClass('bg-red-600');
    });

    it('should always render cancel button as secondary', () => {
      render(<ConfirmDialog {...defaultProps} variant="danger" />);

      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      expect(cancelButton).toHaveClass('bg-white');
      expect(cancelButton).toHaveClass('border-gray-300');
    });
  });

  describe('interactions', () => {
    it('should call onConfirm when confirm button is clicked', async () => {
      const onConfirm = jest.fn();
      render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);

      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('should call onCancel when cancel button is clicked', async () => {
      const onCancel = jest.fn();
      render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('should call onCancel when backdrop is clicked', async () => {
      const onCancel = jest.fn();
      render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);

      fireEvent.click(screen.getByTestId('confirm-dialog-backdrop'));

      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('keyboard support', () => {
    it('should call onCancel when Escape key is pressed', async () => {
      const onCancel = jest.fn();
      render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('should call onConfirm when Enter key is pressed', async () => {
      const onConfirm = jest.fn();
      render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);

      fireEvent.keyDown(document, { key: 'Enter' });

      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('should not call onConfirm when Enter is pressed and cancel button is focused', async () => {
      const onConfirm = jest.fn();
      render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);

      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      cancelButton.focus();

      fireEvent.keyDown(document, { key: 'Enter' });

      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('should not respond to keyboard events when closed', async () => {
      const onCancel = jest.fn();
      const onConfirm = jest.fn();
      render(
        <ConfirmDialog {...defaultProps} open={false} onCancel={onCancel} onConfirm={onConfirm} />
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      fireEvent.keyDown(document, { key: 'Enter' });

      expect(onCancel).not.toHaveBeenCalled();
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  describe('loading state', () => {
    it('should show loading state on confirm button', () => {
      render(<ConfirmDialog {...defaultProps} loading={true} />);

      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      expect(confirmButton).toBeDisabled();
      expect(confirmButton).toHaveAttribute('aria-busy', 'true');
    });

    it('should disable cancel button when loading', () => {
      render(<ConfirmDialog {...defaultProps} loading={true} />);

      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      expect(cancelButton).toBeDisabled();
    });

    it('should not call onConfirm when Enter is pressed during loading', async () => {
      const onConfirm = jest.fn();
      render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} loading={true} />);

      fireEvent.keyDown(document, { key: 'Enter' });

      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  describe('focus management', () => {
    it('should focus confirm button when dialog opens', async () => {
      render(<ConfirmDialog {...defaultProps} />);

      await waitFor(() => {
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Confirm' }));
      });
    });

    it('should restore focus when dialog closes', async () => {
      const triggerButton = document.createElement('button');
      triggerButton.textContent = 'Open Dialog';
      document.body.appendChild(triggerButton);
      triggerButton.focus();

      const { rerender } = render(<ConfirmDialog {...defaultProps} open={true} />);

      // Wait for focus to move to confirm button
      await waitFor(() => {
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Confirm' }));
      });

      // Close the dialog
      rerender(<ConfirmDialog {...defaultProps} open={false} />);

      // Focus should be restored to the trigger button
      await waitFor(() => {
        expect(document.activeElement).toBe(triggerButton);
      });

      document.body.removeChild(triggerButton);
    });
  });

  describe('body scroll prevention', () => {
    it('should prevent body scroll when open', () => {
      render(<ConfirmDialog {...defaultProps} />);

      expect(document.body.style.overflow).toBe('hidden');
    });

    it('should restore body scroll when closed', () => {
      const { rerender } = render(<ConfirmDialog {...defaultProps} open={true} />);

      expect(document.body.style.overflow).toBe('hidden');

      rerender(<ConfirmDialog {...defaultProps} open={false} />);

      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(<ConfirmDialog {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'confirm-dialog-title');
      expect(dialog).toHaveAttribute('aria-describedby', 'confirm-dialog-message');
    });

    it('should have accessible title', () => {
      render(<ConfirmDialog {...defaultProps} title="Delete Item" />);

      const title = screen.getByRole('heading', { name: 'Delete Item' });
      expect(title).toHaveAttribute('id', 'confirm-dialog-title');
    });

    it('should have accessible message', () => {
      render(<ConfirmDialog {...defaultProps} message="This action cannot be undone." />);

      const message = screen.getByText('This action cannot be undone.');
      expect(message).toHaveAttribute('id', 'confirm-dialog-message');
    });

    it('should have aria-hidden on backdrop', () => {
      render(<ConfirmDialog {...defaultProps} />);

      const backdrop = screen.getByTestId('confirm-dialog-backdrop');
      expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('styling', () => {
    it('should have modal overlay styling', () => {
      render(<ConfirmDialog {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveClass('fixed');
      expect(dialog).toHaveClass('inset-0');
      expect(dialog).toHaveClass('z-50');
    });

    it('should have backdrop with semi-transparent background', () => {
      render(<ConfirmDialog {...defaultProps} />);

      const backdrop = screen.getByTestId('confirm-dialog-backdrop');
      expect(backdrop).toHaveClass('bg-black/50');
    });

    it('should have dialog panel styling', () => {
      render(<ConfirmDialog {...defaultProps} />);

      const panel = screen.getByRole('document');
      expect(panel).toHaveClass('bg-white');
      expect(panel).toHaveClass('rounded-lg');
      expect(panel).toHaveClass('shadow-xl');
      expect(panel).toHaveClass('max-w-md');
    });

    it('should have proper title styling', () => {
      render(<ConfirmDialog {...defaultProps} />);

      const title = screen.getByRole('heading');
      expect(title).toHaveClass('text-lg');
      expect(title).toHaveClass('font-semibold');
      expect(title).toHaveClass('text-gray-900');
    });

    it('should have proper message styling', () => {
      render(<ConfirmDialog {...defaultProps} />);

      const message = screen.getByText(defaultProps.message);
      expect(message).toHaveClass('text-sm');
      expect(message).toHaveClass('text-gray-600');
    });

    it('should have proper button container styling', () => {
      render(<ConfirmDialog {...defaultProps} />);

      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      const buttonContainer = confirmButton.parentElement;

      expect(buttonContainer).toHaveClass('flex');
      expect(buttonContainer).toHaveClass('justify-end');
      expect(buttonContainer).toHaveClass('gap-3');
    });
  });

  describe('real-world scenarios', () => {
    it('should work for ending a session with connected students', () => {
      const onConfirm = jest.fn();
      const onCancel = jest.fn();

      render(
        <ConfirmDialog
          open={true}
          title="End Session"
          message="5 students are connected. Are you sure you want to end this session?"
          confirmLabel="End Session"
          variant="danger"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      // Title appears in heading
      expect(screen.getByRole('heading', { name: 'End Session' })).toBeInTheDocument();
      expect(screen.getByText('5 students are connected. Are you sure you want to end this session?')).toBeInTheDocument();

      const confirmButton = screen.getByRole('button', { name: 'End Session' });
      expect(confirmButton).toHaveClass('bg-red-600');

      fireEvent.click(confirmButton);
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('should work for deleting a section', () => {
      const onConfirm = jest.fn();
      const onCancel = jest.fn();

      render(
        <ConfirmDialog
          open={true}
          title="Delete Section"
          message="This will permanently delete the section and all its sessions. This action cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Keep Section"
          variant="danger"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Keep Section' })).toBeInTheDocument();
    });

    it('should work for a non-destructive confirmation', () => {
      const onConfirm = jest.fn();
      const onCancel = jest.fn();

      render(
        <ConfirmDialog
          open={true}
          title="Submit Assignment"
          message="You will not be able to make changes after submission."
          confirmLabel="Submit"
          variant="default"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      const confirmButton = screen.getByRole('button', { name: 'Submit' });
      expect(confirmButton).toHaveClass('from-indigo-600');
      expect(confirmButton).not.toHaveClass('bg-red-600');
    });
  });
});

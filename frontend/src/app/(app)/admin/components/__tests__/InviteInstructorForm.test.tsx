/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InviteInstructorForm from '../InviteInstructorForm';

describe('InviteInstructorForm', () => {
  const mockOnSubmit = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the form with email input and submit button', () => {
    render(<InviteInstructorForm onSubmit={mockOnSubmit} loading={false} />);

    expect(screen.getByText('Invite Instructor')).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send invitation/i })).toBeInTheDocument();
  });

  it('shows validation error when submitting empty form', async () => {
    render(<InviteInstructorForm onSubmit={mockOnSubmit} loading={false} />);

    const form = screen.getByRole('button', { name: /send invitation/i }).closest('form');
    if (form) {
      fireEvent.submit(form);
    }

    await waitFor(() => {
      expect(screen.getByText(/please enter an email address/i)).toBeInTheDocument();
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('shows validation error for invalid email format', async () => {
    const user = userEvent.setup();
    render(<InviteInstructorForm onSubmit={mockOnSubmit} loading={false} />);

    const emailInput = screen.getByLabelText(/email address/i);
    await user.type(emailInput, 'invalid-email');

    const form = screen.getByRole('button', { name: /send invitation/i }).closest('form');
    if (form) {
      fireEvent.submit(form);
    }

    await waitFor(() => {
      expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument();
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with email when form is valid', async () => {
    mockOnSubmit.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<InviteInstructorForm onSubmit={mockOnSubmit} loading={false} />);

    const emailInput = screen.getByLabelText(/email address/i);
    await user.type(emailInput, 'instructor@example.com');

    const form = screen.getByRole('button', { name: /send invitation/i }).closest('form');
    if (form) {
      fireEvent.submit(form);
    }

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith('instructor@example.com');
    });
  });

  it('shows success message after successful submission', async () => {
    mockOnSubmit.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<InviteInstructorForm onSubmit={mockOnSubmit} loading={false} />);

    const emailInput = screen.getByLabelText(/email address/i);
    await user.type(emailInput, 'instructor@example.com');

    const form = screen.getByRole('button', { name: /send invitation/i }).closest('form');
    if (form) {
      fireEvent.submit(form);
    }

    await waitFor(() => {
      expect(screen.getByText(/invitation sent to instructor@example.com/i)).toBeInTheDocument();
    });
  });

  it('clears email input after successful submission', async () => {
    mockOnSubmit.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<InviteInstructorForm onSubmit={mockOnSubmit} loading={false} />);

    const emailInput = screen.getByLabelText(/email address/i) as HTMLInputElement;
    await user.type(emailInput, 'instructor@example.com');

    const form = screen.getByRole('button', { name: /send invitation/i }).closest('form');
    if (form) {
      fireEvent.submit(form);
    }

    await waitFor(() => {
      expect(emailInput.value).toBe('');
    });
  });

  it('shows error message when submission fails', async () => {
    mockOnSubmit.mockRejectedValue(new Error('Duplicate invitation'));
    const user = userEvent.setup();
    render(<InviteInstructorForm onSubmit={mockOnSubmit} loading={false} />);

    const emailInput = screen.getByLabelText(/email address/i);
    await user.type(emailInput, 'existing@example.com');

    const form = screen.getByRole('button', { name: /send invitation/i }).closest('form');
    if (form) {
      fireEvent.submit(form);
    }

    await waitFor(() => {
      expect(screen.getByText(/duplicate invitation/i)).toBeInTheDocument();
    });
  });

  it('disables input and button when loading', () => {
    render(<InviteInstructorForm onSubmit={mockOnSubmit} loading={true} />);

    const emailInput = screen.getByLabelText(/email address/i);
    const submitButton = screen.getByRole('button', { name: /sending/i });

    expect(emailInput).toBeDisabled();
    expect(submitButton).toBeDisabled();
  });

  it('trims whitespace from email before submission', async () => {
    mockOnSubmit.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<InviteInstructorForm onSubmit={mockOnSubmit} loading={false} />);

    const emailInput = screen.getByLabelText(/email address/i);
    await user.type(emailInput, '  instructor@example.com  ');

    const form = screen.getByRole('button', { name: /send invitation/i }).closest('form');
    if (form) {
      fireEvent.submit(form);
    }

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith('instructor@example.com');
    });
  });

  it('clears error message when user types in email field', async () => {
    const user = userEvent.setup();
    render(<InviteInstructorForm onSubmit={mockOnSubmit} loading={false} />);

    // First, trigger a validation error
    const form = screen.getByRole('button', { name: /send invitation/i }).closest('form');
    if (form) {
      fireEvent.submit(form);
    }

    await waitFor(() => {
      expect(screen.getByText(/please enter an email address/i)).toBeInTheDocument();
    });

    // Now type in the field - error should clear
    const emailInput = screen.getByLabelText(/email address/i);
    await user.type(emailInput, 't');

    expect(screen.queryByText(/please enter an email address/i)).not.toBeInTheDocument();
  });
});

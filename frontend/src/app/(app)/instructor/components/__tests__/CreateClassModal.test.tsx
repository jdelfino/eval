/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateClassModal from '../CreateClassModal';

describe('CreateClassModal', () => {
  const mockOnClose = jest.fn();
  const mockOnSuccess = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the modal with form fields', () => {
    render(<CreateClassModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    expect(screen.getByText('Create New Class')).toBeInTheDocument();
    expect(screen.getByLabelText(/class name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create class/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('closes modal when cancel button is clicked', () => {
    render(<CreateClassModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('closes modal when clicking outside the modal content', () => {
    render(<CreateClassModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const backdrop = screen.getByText('Create New Class').closest('div')?.parentElement?.parentElement;
    if (backdrop) {
      fireEvent.click(backdrop);
    }

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('does not close modal when clicking inside the modal content', () => {
    render(<CreateClassModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const modalContent = screen.getByText('Create New Class').parentElement;
    if (modalContent) {
      fireEvent.click(modalContent);
    }

    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('shows validation error when submitting empty form', async () => {
    render(<CreateClassModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const form = screen.getByRole('button', { name: /create class/i }).closest('form');
    if (form) {
      fireEvent.submit(form);
    }

    // ErrorAlert displays for validation error - classifies "Class name is required" as validation
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows validation error for name exceeding max length', async () => {
    render(<CreateClassModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/class name/i);
    fireEvent.change(nameInput, { target: { value: 'a'.repeat(101) } });
    fireEvent.click(screen.getByRole('button', { name: /create class/i }));

    // ErrorAlert displays for validation error
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows validation error for description exceeding max length', async () => {
    render(<CreateClassModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/class name/i);
    const descInput = screen.getByLabelText(/description/i);

    fireEvent.change(nameInput, { target: { value: 'Valid Name' } });
    fireEvent.change(descInput, { target: { value: 'a'.repeat(501) } });
    fireEvent.click(screen.getByRole('button', { name: /create class/i }));

    // ErrorAlert displays for validation error
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('successfully creates a class with name only', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ class: { id: 'class-1', name: 'CS101' } }),
    });

    render(<CreateClassModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/class name/i);
    fireEvent.change(nameInput, { target: { value: 'CS101' } });
    fireEvent.click(screen.getByRole('button', { name: /create class/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'CS101',
          description: '',
        }),
      });
    });

    expect(mockOnSuccess).toHaveBeenCalledTimes(1);
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('successfully creates a class with name and description', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ class: { id: 'class-1', name: 'CS101', description: 'Intro to CS' } }),
    });

    render(<CreateClassModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/class name/i);
    const descInput = screen.getByLabelText(/description/i);
    
    fireEvent.change(nameInput, { target: { value: 'CS101' } });
    fireEvent.change(descInput, { target: { value: 'Intro to CS' } });
    fireEvent.click(screen.getByRole('button', { name: /create class/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'CS101',
          description: 'Intro to CS',
        }),
      });
    });

    expect(mockOnSuccess).toHaveBeenCalledTimes(1);
  });

  it('trims whitespace from name', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ class: { id: 'class-1', name: 'CS101' } }),
    });

    render(<CreateClassModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/class name/i);
    fireEvent.change(nameInput, { target: { value: '  CS101  ' } });
    fireEvent.click(screen.getByRole('button', { name: /create class/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/classes', expect.objectContaining({
        body: JSON.stringify({
          name: 'CS101',
          description: '',
        }),
      }));
    });
  });

  it('shows loading state while creating class', async () => {
    (global.fetch as jest.Mock).mockImplementationOnce(() => 
      new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: async () => ({ class: { id: 'class-1', name: 'CS101' } }),
      }), 100))
    );

    render(<CreateClassModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/class name/i);
    fireEvent.change(nameInput, { target: { value: 'CS101' } });
    fireEvent.click(screen.getByRole('button', { name: /create class/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /creating/i })).toBeDisabled();
    });

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  it('shows error when API returns error', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Database error' }),
    });

    render(<CreateClassModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/class name/i);
    fireEvent.change(nameInput, { target: { value: 'CS101' } });
    fireEvent.click(screen.getByRole('button', { name: /create class/i }));

    // ErrorAlert displays for API error
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it('shows generic error when API fails without error message', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });

    render(<CreateClassModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/class name/i);
    fireEvent.change(nameInput, { target: { value: 'CS101' } });
    fireEvent.click(screen.getByRole('button', { name: /create class/i }));

    // ErrorAlert displays for API error
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it('shows error when network request fails', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    render(<CreateClassModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/class name/i);
    fireEvent.change(nameInput, { target: { value: 'CS101' } });

    const form = screen.getByRole('button', { name: /create class/i }).closest('form');
    fireEvent.submit(form!);

    // Wait for fetch to be called and error to be displayed
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    // ErrorAlert shows user-friendly message
    await waitFor(() => {
      expect(screen.getByText('Connection Error')).toBeInTheDocument();
    });
    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it('disables form inputs while loading', async () => {
    (global.fetch as jest.Mock).mockImplementationOnce(() => 
      new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: async () => ({ class: { id: 'class-1', name: 'CS101' } }),
      }), 100))
    );

    render(<CreateClassModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/class name/i);
    fireEvent.change(nameInput, { target: { value: 'CS101' } });
    fireEvent.click(screen.getByRole('button', { name: /create class/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/class name/i)).toBeDisabled();
      expect(screen.getByLabelText(/description/i)).toBeDisabled();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    });

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });
});

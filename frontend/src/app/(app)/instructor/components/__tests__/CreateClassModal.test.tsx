/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateClassModal from '../CreateClassModal';
import * as classesModule from '@/lib/api/classes';

jest.mock('@/lib/api/classes');

const mockCreateClass = jest.mocked(classesModule.createClass);

const mockClassResponse = {
  id: 'class-1',
  name: 'Test Class',
  namespace_id: 'ns-1',
  description: null,
  created_by: 'user-1',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

describe('CreateClassModal', () => {
  const mockOnClose = jest.fn();
  const mockOnSuccess = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateClass.mockResolvedValue(mockClassResponse);
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

    expect(mockCreateClass).not.toHaveBeenCalled();
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

    expect(mockCreateClass).not.toHaveBeenCalled();
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

    expect(mockCreateClass).not.toHaveBeenCalled();
  });

  it('successfully creates a class with name only', async () => {
    mockCreateClass.mockResolvedValueOnce({ ...mockClassResponse, name: 'CS101' });

    render(<CreateClassModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/class name/i);
    fireEvent.change(nameInput, { target: { value: 'CS101' } });
    fireEvent.click(screen.getByRole('button', { name: /create class/i }));

    await waitFor(() => {
      expect(mockCreateClass).toHaveBeenCalledWith('CS101', undefined);
    });

    expect(mockOnSuccess).toHaveBeenCalledTimes(1);
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('successfully creates a class with name and description', async () => {
    mockCreateClass.mockResolvedValueOnce({ ...mockClassResponse, name: 'CS101', description: 'Intro to CS' });

    render(<CreateClassModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/class name/i);
    const descInput = screen.getByLabelText(/description/i);

    fireEvent.change(nameInput, { target: { value: 'CS101' } });
    fireEvent.change(descInput, { target: { value: 'Intro to CS' } });
    fireEvent.click(screen.getByRole('button', { name: /create class/i }));

    await waitFor(() => {
      expect(mockCreateClass).toHaveBeenCalledWith('CS101', 'Intro to CS');
    });

    expect(mockOnSuccess).toHaveBeenCalledTimes(1);
  });

  it('trims whitespace from name', async () => {
    mockCreateClass.mockResolvedValueOnce({ ...mockClassResponse, name: 'CS101' });

    render(<CreateClassModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/class name/i);
    fireEvent.change(nameInput, { target: { value: '  CS101  ' } });
    fireEvent.click(screen.getByRole('button', { name: /create class/i }));

    await waitFor(() => {
      expect(mockCreateClass).toHaveBeenCalledWith('CS101', undefined);
    });
  });

  it('shows loading state while creating class', async () => {
    mockCreateClass.mockImplementationOnce(() =>
      new Promise(resolve => setTimeout(() => resolve({
        ...mockClassResponse, name: 'CS101'
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
    mockCreateClass.mockRejectedValueOnce(new Error('Database error'));

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

  it('does not call onSuccess when API fails without error message', async () => {
    // When API throws an empty error message, the error state is set to ''
    // which is falsy so no alert is shown, but onSuccess is still not called
    mockCreateClass.mockRejectedValueOnce(new Error(''));

    render(<CreateClassModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/class name/i);
    fireEvent.change(nameInput, { target: { value: 'CS101' } });
    fireEvent.click(screen.getByRole('button', { name: /create class/i }));

    // Wait for the API call to complete
    await waitFor(() => {
      expect(mockCreateClass).toHaveBeenCalled();
    });

    // Success should not be called even though no error is displayed
    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it('shows error when network request fails', async () => {
    mockCreateClass.mockRejectedValueOnce(new Error('Network error'));

    render(<CreateClassModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/class name/i);
    fireEvent.change(nameInput, { target: { value: 'CS101' } });

    const form = screen.getByRole('button', { name: /create class/i }).closest('form');
    fireEvent.submit(form!);

    // Wait for createClass to be called and error to be displayed
    await waitFor(() => {
      expect(mockCreateClass).toHaveBeenCalled();
    });

    // ErrorAlert classifies "Network error" as a connection error
    await waitFor(() => {
      expect(screen.getByText('Connection Error')).toBeInTheDocument();
    });
    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it('disables form inputs while loading', async () => {
    mockCreateClass.mockImplementationOnce(() =>
      new Promise(resolve => setTimeout(() => resolve({
        ...mockClassResponse, name: 'CS101'
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

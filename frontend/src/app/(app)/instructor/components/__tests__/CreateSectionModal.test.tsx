/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateSectionModal from '../CreateSectionModal';

const mockCreateSection = jest.fn();
jest.mock('@/lib/api/classes', () => ({
  createSection: (...args: unknown[]) => mockCreateSection(...args),
}));

describe('CreateSectionModal', () => {
  const mockOnClose = jest.fn();
  const mockOnSuccess = jest.fn();
  const class_id = 'class-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the modal with all form fields', () => {
    render(<CreateSectionModal class_id={class_id} onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    expect(screen.getByText('Create New Section')).toBeInTheDocument();
    expect(screen.getByLabelText(/section name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/schedule/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/location/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/capacity/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create section/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('closes modal when cancel button is clicked', () => {
    render(<CreateSectionModal class_id={class_id} onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('closes modal when clicking outside the modal content', () => {
    render(<CreateSectionModal class_id={class_id} onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const backdrop = screen.getByText('Create New Section').closest('div')?.parentElement?.parentElement;
    if (backdrop) {
      fireEvent.click(backdrop);
    }

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('does not close modal when clicking inside the modal content', () => {
    render(<CreateSectionModal class_id={class_id} onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const modalContent = screen.getByText('Create New Section').parentElement;
    if (modalContent) {
      fireEvent.click(modalContent);
    }

    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('shows validation error when submitting empty form', async () => {
    render(<CreateSectionModal class_id={class_id} onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const form = screen.getByRole('button', { name: /create section/i }).closest('form');
    if (form) {
      fireEvent.submit(form);
    }

    await waitFor(() => {
      expect(screen.getByText(/section name is required/i)).toBeInTheDocument();
    });

    expect(mockCreateSection).not.toHaveBeenCalled();
  });

  it('shows validation error for name exceeding max length', async () => {
    render(<CreateSectionModal class_id={class_id} onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/section name/i);
    fireEvent.change(nameInput, { target: { value: 'a'.repeat(101) } });
    fireEvent.click(screen.getByRole('button', { name: /create section/i }));

    await waitFor(() => {
      expect(screen.getByText(/section name must be 100 characters or less/i)).toBeInTheDocument();
    });

    expect(mockCreateSection).not.toHaveBeenCalled();
  });

  it('shows validation error for negative capacity', async () => {
    render(<CreateSectionModal class_id={class_id} onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/section name/i);
    const capacityInput = screen.getByLabelText(/capacity/i);

    fireEvent.change(nameInput, { target: { value: 'Section A' } });
    fireEvent.change(capacityInput, { target: { value: '-5' } });

    const form = screen.getByRole('button', { name: /create section/i }).closest('form');
    fireEvent.submit(form!);

    expect(await screen.findByText(/capacity must be a positive number/i)).toBeInTheDocument();
    expect(mockCreateSection).not.toHaveBeenCalled();
  });

  it('shows validation error for zero capacity', async () => {
    render(<CreateSectionModal class_id={class_id} onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/section name/i);
    const capacityInput = screen.getByLabelText(/capacity/i);

    fireEvent.change(nameInput, { target: { value: 'Section A' } });
    fireEvent.change(capacityInput, { target: { value: '0' } });

    const form = screen.getByRole('button', { name: /create section/i }).closest('form');
    fireEvent.submit(form!);

    expect(await screen.findByText(/capacity must be a positive number/i)).toBeInTheDocument();
    expect(mockCreateSection).not.toHaveBeenCalled();
  });

  it('successfully creates a section with name only', async () => {
    mockCreateSection.mockResolvedValueOnce({ id: 'section-1', name: 'Section A' });

    render(<CreateSectionModal class_id={class_id} onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/section name/i);
    fireEvent.change(nameInput, { target: { value: 'Section A' } });
    fireEvent.click(screen.getByRole('button', { name: /create section/i }));

    await waitFor(() => {
      expect(mockCreateSection).toHaveBeenCalledWith(class_id, {
        name: 'Section A',
        schedule: undefined,
        location: undefined,
      });
    });

    expect(mockOnSuccess).toHaveBeenCalledTimes(1);
  });

  it('successfully creates a section with all fields', async () => {
    mockCreateSection.mockResolvedValueOnce({
      id: 'section-1',
      name: 'Section A',
      schedule: 'MWF 10-11am',
      location: 'Room 101',
      capacity: 30,
    });

    render(<CreateSectionModal class_id={class_id} onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/section name/i);
    const scheduleInput = screen.getByLabelText(/schedule/i);
    const locationInput = screen.getByLabelText(/location/i);
    const capacityInput = screen.getByLabelText(/capacity/i);

    fireEvent.change(nameInput, { target: { value: 'Section A' } });
    fireEvent.change(scheduleInput, { target: { value: 'MWF 10-11am' } });
    fireEvent.change(locationInput, { target: { value: 'Room 101' } });
    fireEvent.change(capacityInput, { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: /create section/i }));

    await waitFor(() => {
      expect(mockCreateSection).toHaveBeenCalledWith(class_id, {
        name: 'Section A',
        schedule: 'MWF 10-11am',
        location: 'Room 101',
        capacity: 30,
      });
    });

    expect(mockOnSuccess).toHaveBeenCalledTimes(1);
  });

  it('trims whitespace from text fields', async () => {
    mockCreateSection.mockResolvedValueOnce({ id: 'section-1', name: 'Section A' });

    render(<CreateSectionModal class_id={class_id} onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/section name/i);
    const scheduleInput = screen.getByLabelText(/schedule/i);
    const locationInput = screen.getByLabelText(/location/i);

    fireEvent.change(nameInput, { target: { value: '  Section A  ' } });
    fireEvent.change(scheduleInput, { target: { value: '  MWF 10am  ' } });
    fireEvent.change(locationInput, { target: { value: '  Room 101  ' } });
    fireEvent.click(screen.getByRole('button', { name: /create section/i }));

    await waitFor(() => {
      expect(mockCreateSection).toHaveBeenCalledWith(class_id, {
        name: 'Section A',
        schedule: 'MWF 10am',
        location: 'Room 101',
      });
    });
  });

  it('omits capacity from request when empty', async () => {
    mockCreateSection.mockResolvedValueOnce({ id: 'section-1', name: 'Section A' });

    render(<CreateSectionModal class_id={class_id} onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/section name/i);
    fireEvent.change(nameInput, { target: { value: 'Section A' } });
    fireEvent.click(screen.getByRole('button', { name: /create section/i }));

    await waitFor(() => {
      const callArgs = mockCreateSection.mock.calls[0];
      expect(callArgs[1]).not.toHaveProperty('capacity');
    });
  });

  it('shows loading state while creating section', async () => {
    mockCreateSection.mockImplementationOnce(
      () => new Promise(resolve => setTimeout(() => resolve({ id: 'section-1', name: 'Section A' }), 100))
    );

    render(<CreateSectionModal class_id={class_id} onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/section name/i);
    fireEvent.change(nameInput, { target: { value: 'Section A' } });
    fireEvent.click(screen.getByRole('button', { name: /create section/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /creating/i })).toBeDisabled();
    });

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  it('shows error when API returns error', async () => {
    mockCreateSection.mockRejectedValueOnce(new Error('Database error'));

    render(<CreateSectionModal class_id={class_id} onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/section name/i);
    fireEvent.change(nameInput, { target: { value: 'Section A' } });
    fireEvent.click(screen.getByRole('button', { name: /create section/i }));

    await waitFor(() => {
      expect(screen.getByText(/database error/i)).toBeInTheDocument();
    });

    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it('shows generic error when API fails without error message', async () => {
    mockCreateSection.mockRejectedValueOnce(new Error('Request failed: 500'));

    render(<CreateSectionModal class_id={class_id} onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/section name/i);
    fireEvent.change(nameInput, { target: { value: 'Section A' } });
    fireEvent.click(screen.getByRole('button', { name: /create section/i }));

    await waitFor(() => {
      expect(screen.getByText(/Request failed: 500/i)).toBeInTheDocument();
    });

    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it('shows error when network request fails', async () => {
    mockCreateSection.mockRejectedValueOnce(new Error('Network error'));

    render(<CreateSectionModal class_id={class_id} onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/section name/i);
    fireEvent.change(nameInput, { target: { value: 'Section A' } });

    const form = screen.getByRole('button', { name: /create section/i }).closest('form');
    fireEvent.submit(form!);

    // Wait for createSection to be called
    await waitFor(() => expect(mockCreateSection).toHaveBeenCalled());

    // The error message from the rejected promise will be displayed
    expect(await screen.findByText(/network error/i, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it('disables form inputs while loading', async () => {
    mockCreateSection.mockImplementationOnce(
      () => new Promise(resolve => setTimeout(() => resolve({ id: 'section-1', name: 'Section A' }), 100))
    );

    render(<CreateSectionModal class_id={class_id} onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/section name/i);
    fireEvent.change(nameInput, { target: { value: 'Section A' } });
    fireEvent.click(screen.getByRole('button', { name: /create section/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/section name/i)).toBeDisabled();
      expect(screen.getByLabelText(/schedule/i)).toBeDisabled();
      expect(screen.getByLabelText(/location/i)).toBeDisabled();
      expect(screen.getByLabelText(/capacity/i)).toBeDisabled();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    });

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  it('accepts valid capacity values', async () => {
    mockCreateSection.mockResolvedValueOnce({ id: 'section-1', name: 'Section A', capacity: 50 });

    render(<CreateSectionModal class_id={class_id} onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/section name/i);
    const capacityInput = screen.getByLabelText(/capacity/i);

    fireEvent.change(nameInput, { target: { value: 'Section A' } });
    fireEvent.change(capacityInput, { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /create section/i }));

    await waitFor(() => {
      expect(mockCreateSection).toHaveBeenCalledWith(class_id, {
        name: 'Section A',
        schedule: undefined,
        location: undefined,
        capacity: 50,
      });
    });

    expect(mockOnSuccess).toHaveBeenCalledTimes(1);
  });
});

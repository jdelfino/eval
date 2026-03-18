/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CreateSectionModal from '../CreateSectionModal';

jest.mock('@/lib/api/classes');

import * as classesApi from '@/lib/api/classes';
const mockCreateSection = jest.mocked(classesApi.createSection);

const mockSectionResponse = {
  id: 'section-1',
  name: 'Section A',
  namespace_id: 'ns-1',
  class_id: 'class-123',
  semester: null,
  join_code: 'ABC123',
  active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

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

  it('renders the modal with form fields', () => {
    render(<CreateSectionModal class_id={class_id} onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    expect(screen.getByText('Create New Section')).toBeInTheDocument();
    expect(screen.getByLabelText(/section name/i)).toBeInTheDocument();
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

  it('successfully creates a section with name only', async () => {
    mockCreateSection.mockResolvedValueOnce(mockSectionResponse);

    render(<CreateSectionModal class_id={class_id} onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/section name/i);
    fireEvent.change(nameInput, { target: { value: 'Section A' } });
    fireEvent.click(screen.getByRole('button', { name: /create section/i }));

    await waitFor(() => {
      expect(mockCreateSection).toHaveBeenCalledWith(class_id, {
        name: 'Section A',
      });
    });

    expect(mockOnSuccess).toHaveBeenCalledTimes(1);
  });

  it('trims whitespace from name', async () => {
    mockCreateSection.mockResolvedValueOnce(mockSectionResponse);

    render(<CreateSectionModal class_id={class_id} onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/section name/i);
    fireEvent.change(nameInput, { target: { value: '  Section A  ' } });
    fireEvent.click(screen.getByRole('button', { name: /create section/i }));

    await waitFor(() => {
      expect(mockCreateSection).toHaveBeenCalledWith(class_id, {
        name: 'Section A',
      });
    });
  });

  it('shows loading state while creating section', async () => {
    mockCreateSection.mockImplementationOnce(
      () => new Promise(resolve => setTimeout(() => resolve(mockSectionResponse), 100))
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
      () => new Promise(resolve => setTimeout(() => resolve(mockSectionResponse), 100))
    );

    render(<CreateSectionModal class_id={class_id} onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    const nameInput = screen.getByLabelText(/section name/i);
    fireEvent.change(nameInput, { target: { value: 'Section A' } });
    fireEvent.click(screen.getByRole('button', { name: /create section/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/section name/i)).toBeDisabled();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    });

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });
});

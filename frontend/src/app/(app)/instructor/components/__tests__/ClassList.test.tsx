/**
 * Unit tests for ClassList component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ClassList from '../ClassList';

// Mock the API module
const mockListClasses = jest.fn();
const mockDeleteClass = jest.fn();

jest.mock('@/lib/api/classes', () => ({
  listClasses: () => mockListClasses(),
  deleteClass: (id: string) => mockDeleteClass(id),
}));

describe('ClassList', () => {
  const mockOnSelectClass = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should render loading state initially', () => {
    mockListClasses.mockImplementation(() =>
      new Promise(() => {}) // Never resolves
    );

    render(<ClassList onSelectClass={mockOnSelectClass} />);

    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should fetch and display classes', async () => {
    const mockClasses = [
      { id: 'class-1', namespace_id: 'ns-1', name: 'CS101', description: 'Intro to CS', created_by: 'user-1', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
      { id: 'class-2', namespace_id: 'ns-1', name: 'CS102', description: 'Data Structures', created_by: 'user-1', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
    ];

    mockListClasses.mockResolvedValueOnce(mockClasses);

    render(<ClassList onSelectClass={mockOnSelectClass} />);

    await waitFor(() => {
      expect(screen.getByText('CS101')).toBeInTheDocument();
      expect(screen.getByText('CS102')).toBeInTheDocument();
    });

    expect(screen.getByText('Intro to CS')).toBeInTheDocument();
    expect(screen.getByText('Data Structures')).toBeInTheDocument();
  });

  it('should display empty state when no classes', async () => {
    mockListClasses.mockResolvedValueOnce([]);

    render(<ClassList onSelectClass={mockOnSelectClass} />);

    await waitFor(() => {
      expect(screen.getByText('No Classes Yet')).toBeInTheDocument();
    });

    expect(screen.getByText(/Create your first class to get started/)).toBeInTheDocument();
  });

  it('should display error state on fetch failure', async () => {
    mockListClasses.mockRejectedValueOnce(new Error('Server error'));

    render(<ClassList onSelectClass={mockOnSelectClass} />);

    await waitFor(() => {
      expect(screen.getByText('Error loading classes')).toBeInTheDocument();
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('should handle network errors', async () => {
    mockListClasses.mockRejectedValueOnce(new Error('Network error'));

    render(<ClassList onSelectClass={mockOnSelectClass} />);

    await waitFor(() => {
      expect(screen.getByText('Error loading classes')).toBeInTheDocument();
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('should call onSelectClass when class is clicked', async () => {
    const mockClasses = [
      { id: 'class-1', namespace_id: 'ns-1', name: 'CS101', description: 'Intro', created_by: 'user-1', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
    ];

    mockListClasses.mockResolvedValueOnce(mockClasses);

    render(<ClassList onSelectClass={mockOnSelectClass} />);

    await waitFor(() => {
      expect(screen.getByText('CS101')).toBeInTheDocument();
    });

    const classButton = screen.getByRole('button', { name: /CS101/ });
    fireEvent.click(classButton);

    expect(mockOnSelectClass).toHaveBeenCalledWith('class-1');
    expect(mockOnSelectClass).toHaveBeenCalledTimes(1);
  });

  it('should retry loading classes on error retry button click', async () => {
    const mockClasses = [
      { id: 'class-1', namespace_id: 'ns-1', name: 'CS101', description: '', created_by: 'user-1', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
    ];

    mockListClasses
      .mockRejectedValueOnce(new Error('Server error'))
      .mockResolvedValueOnce(mockClasses);

    render(<ClassList onSelectClass={mockOnSelectClass} />);

    await waitFor(() => {
      expect(screen.getByText('Error loading classes')).toBeInTheDocument();
    });

    const retryButton = screen.getByText('Try Again');
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText('CS101')).toBeInTheDocument();
    });
  });

  it('should call listClasses API function', async () => {
    mockListClasses.mockResolvedValueOnce([]);

    render(<ClassList onSelectClass={mockOnSelectClass} />);

    await waitFor(() => {
      expect(mockListClasses).toHaveBeenCalled();
    });
  });

  it('should handle classes without descriptions', async () => {
    const mockClasses = [
      { id: 'class-1', namespace_id: 'ns-1', name: 'CS101', description: null, created_by: 'user-1', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
    ];

    mockListClasses.mockResolvedValueOnce(mockClasses);

    render(<ClassList onSelectClass={mockOnSelectClass} />);

    await waitFor(() => {
      expect(screen.getByText('CS101')).toBeInTheDocument();
    });

    // Description should not be rendered
    expect(screen.queryByText('Intro')).not.toBeInTheDocument();
  });
});

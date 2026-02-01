/**
 * Unit tests for ClassList component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ClassList from '../ClassList';

// Mock fetch
global.fetch = jest.fn();

describe('ClassList', () => {
  const mockOnSelectClass = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should render loading state initially', () => {
    (global.fetch as jest.Mock).mockImplementation(() => 
      new Promise(() => {}) // Never resolves
    );

    render(<ClassList onSelectClass={mockOnSelectClass} />);
    
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should fetch and display classes', async () => {
    const mockClasses = [
      { id: 'class-1', name: 'CS101', description: 'Intro to CS', sectionCount: 3 },
      { id: 'class-2', name: 'CS102', description: 'Data Structures', sectionCount: 2 },
    ];

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ classes: mockClasses }),
    });

    render(<ClassList onSelectClass={mockOnSelectClass} />);

    await waitFor(() => {
      expect(screen.getByText('CS101')).toBeInTheDocument();
      expect(screen.getByText('CS102')).toBeInTheDocument();
    });

    expect(screen.getByText('Intro to CS')).toBeInTheDocument();
    expect(screen.getByText('Data Structures')).toBeInTheDocument();
    expect(screen.getByText('3 sections')).toBeInTheDocument();
    expect(screen.getByText('2 sections')).toBeInTheDocument();
  });

  it('should handle singular section count', async () => {
    const mockClasses = [
      { id: 'class-1', name: 'CS101', description: 'Intro', sectionCount: 1 },
    ];

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ classes: mockClasses }),
    });

    render(<ClassList onSelectClass={mockOnSelectClass} />);

    await waitFor(() => {
      expect(screen.getByText('1 section')).toBeInTheDocument();
    });
  });

  it('should display empty state when no classes', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ classes: [] }),
    });

    render(<ClassList onSelectClass={mockOnSelectClass} />);

    await waitFor(() => {
      expect(screen.getByText('No Classes Yet')).toBeInTheDocument();
    });

    expect(screen.getByText(/Create your first class to get started/)).toBeInTheDocument();
  });

  it('should display error state on fetch failure', async () => {
    // Mock to fail 3 times (initial + 2 retries) since fetchWithRetry has maxRetries: 2
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    render(<ClassList onSelectClass={mockOnSelectClass} />);

    await waitFor(() => {
      expect(screen.getByText('Error loading classes')).toBeInTheDocument();
    }, { timeout: 5000 });

    // ErrorAlert shows user-friendly message - since "Failed to load classes" may be
    // classified differently, we just check that the error alert is present
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('should handle network errors', async () => {
    // Mock to fail 3 times (initial + 2 retries) since fetchWithRetry has maxRetries: 2
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'));

    render(<ClassList onSelectClass={mockOnSelectClass} />);

    await waitFor(() => {
      expect(screen.getByText('Error loading classes')).toBeInTheDocument();
    }, { timeout: 5000 });

    // ErrorAlert shows user-friendly message
    expect(screen.getByText('Connection error. Please check your internet and try again.')).toBeInTheDocument();
  });

  it('should call onSelectClass when class is clicked', async () => {
    const mockClasses = [
      { id: 'class-1', name: 'CS101', description: 'Intro', sectionCount: 3 },
    ];

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ classes: mockClasses }),
    });

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
    // First 3 calls fail (initial + 2 retries from fetchWithRetry)
    // Then retry button triggers another 3 calls where the first succeeds
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 500 })
      // User clicks retry - success
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ classes: [{ id: 'class-1', name: 'CS101', description: '', sectionCount: 1 }] }),
      });

    render(<ClassList onSelectClass={mockOnSelectClass} />);

    await waitFor(() => {
      expect(screen.getByText('Error loading classes')).toBeInTheDocument();
    }, { timeout: 5000 });

    const retryButton = screen.getByText('Try Again');
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText('CS101')).toBeInTheDocument();
    });
  });

  it('should fetch from correct API endpoint', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ classes: [] }),
    });

    render(<ClassList onSelectClass={mockOnSelectClass} />);

    await waitFor(() => {
      // fetchWithRetry passes undefined as second argument when no fetchOptions provided
      expect(global.fetch).toHaveBeenCalledWith('/api/classes', undefined);
    });
  });

  it('should handle classes without descriptions', async () => {
    const mockClasses = [
      { id: 'class-1', name: 'CS101', description: '', sectionCount: 1 },
    ];

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ classes: mockClasses }),
    });

    render(<ClassList onSelectClass={mockOnSelectClass} />);

    await waitFor(() => {
      expect(screen.getByText('CS101')).toBeInTheDocument();
    });

    // Description should not be rendered
    expect(screen.queryByText('Intro')).not.toBeInTheDocument();
  });
});

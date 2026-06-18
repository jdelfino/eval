/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const mockReportError = jest.fn();

jest.mock('@/lib/api/error-reporting', () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

import ErrorBoundary from '../error';

describe('ErrorBoundary (error.tsx)', () => {
  const mockReset = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockReportError.mockResolvedValue(undefined);
  });

  it('renders the 500 EmptyState with code badge and "work is safe" copy', () => {
    const error = new Error('Test crash');
    render(<ErrorBoundary error={error} reset={mockReset} />);

    expect(screen.getByText(/500 ·/)).toBeInTheDocument();
    expect(screen.getByText(/your work is safe/i)).toBeInTheDocument();
  });

  it('renders a danger-toned icon circle', () => {
    const error = new Error('Test crash');
    const { container } = render(<ErrorBoundary error={error} reset={mockReset} />);

    expect(container.querySelector('.bg-danger-soft')).toBeInTheDocument();
  });

  it('renders a "Try again" button', () => {
    const error = new Error('Test crash');
    render(<ErrorBoundary error={error} reset={mockReset} />);

    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('calls reset when the Try again button is clicked', () => {
    const error = new Error('Test crash');
    render(<ErrorBoundary error={error} reset={mockReset} />);

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('calls reportError with the error on mount', async () => {
    const error = new Error('Test crash');
    render(<ErrorBoundary error={error} reset={mockReset} />);

    // Wait for useEffect to fire
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockReportError).toHaveBeenCalledWith(error);
  });

  it('renders the incident-id footer when error.digest is present', () => {
    const error = Object.assign(new Error('Test crash'), { digest: 'abc123digest' });
    render(<ErrorBoundary error={error} reset={mockReset} />);

    expect(screen.getByText(/abc123digest/)).toBeInTheDocument();
    expect(screen.getByText(/incident id/i)).toBeInTheDocument();
  });

  it('omits the incident-id footer when error.digest is absent', () => {
    const error = new Error('Test crash');
    render(<ErrorBoundary error={error} reset={mockReset} />);

    expect(screen.queryByText(/incident id/i)).not.toBeInTheDocument();
  });
});

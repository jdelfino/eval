/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const mockReportError = jest.fn();

jest.mock('@/lib/api/error-reporting', () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

// Mock useEffect to run synchronously in tests
jest.mock('react', () => ({
  ...jest.requireActual('react'),
}));

import ErrorBoundary from '../error';

describe('ErrorBoundary (error.tsx)', () => {
  const mockReset = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockReportError.mockResolvedValue(undefined);
  });

  it('renders "Something went wrong" heading', () => {
    const error = new Error('Test crash');
    render(<ErrorBoundary error={error} reset={mockReset} />);

    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument();
  });

  it('renders a retry button', () => {
    const error = new Error('Test crash');
    render(<ErrorBoundary error={error} reset={mockReset} />);

    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('calls reset when retry button is clicked', () => {
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
});

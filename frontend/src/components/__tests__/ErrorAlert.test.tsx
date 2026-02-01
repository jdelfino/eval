/**
 * Unit tests for ErrorAlert component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorAlert } from '../ErrorAlert';

describe('ErrorAlert', () => {
  describe('rendering', () => {
    it('should render with Error object', () => {
      render(<ErrorAlert error={new Error('Network error')} />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Connection Error')).toBeInTheDocument();
      expect(screen.getByText('Connection error. Please check your internet and try again.')).toBeInTheDocument();
    });

    it('should render with string error', () => {
      render(<ErrorAlert error="Something went wrong" />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
    });

    it('should display custom title', () => {
      render(<ErrorAlert error="Error message" title="Custom Title" />);

      expect(screen.getByText('Custom Title')).toBeInTheDocument();
    });

    it('should use default title based on error category', () => {
      render(<ErrorAlert error={new Error('Unauthorized')} />);

      expect(screen.getByText('Authentication Required')).toBeInTheDocument();
    });
  });

  describe('retry button', () => {
    it('should show retry button for retryable errors with onRetry', () => {
      const onRetry = jest.fn();
      render(<ErrorAlert error={new Error('Network error')} onRetry={onRetry} />);

      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    it('should not show retry button for non-retryable errors', () => {
      const onRetry = jest.fn();
      render(<ErrorAlert error={new Error('Unauthorized')} onRetry={onRetry} />);

      expect(screen.queryByText('Try Again')).not.toBeInTheDocument();
    });

    it('should not show retry button when onRetry not provided', () => {
      render(<ErrorAlert error={new Error('Network error')} />);

      expect(screen.queryByText('Try Again')).not.toBeInTheDocument();
    });

    it('should call onRetry when clicked', () => {
      const onRetry = jest.fn();
      render(<ErrorAlert error={new Error('Network error')} onRetry={onRetry} />);

      fireEvent.click(screen.getByText('Try Again'));

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('should show loading state when isRetrying is true', () => {
      const onRetry = jest.fn();
      render(<ErrorAlert error={new Error('Network error')} onRetry={onRetry} isRetrying />);

      expect(screen.getByText('Retrying...')).toBeInTheDocument();
    });

    it('should disable button when isRetrying is true', () => {
      const onRetry = jest.fn();
      render(<ErrorAlert error={new Error('Network error')} onRetry={onRetry} isRetrying />);

      const button = screen.getByRole('button', { name: /retrying/i });
      expect(button).toBeDisabled();
    });
  });

  describe('dismiss button', () => {
    it('should show dismiss button when onDismiss is provided', () => {
      const onDismiss = jest.fn();
      render(<ErrorAlert error="Error" onDismiss={onDismiss} />);

      expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
    });

    it('should not show dismiss button when onDismiss not provided', () => {
      render(<ErrorAlert error="Error" />);

      expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument();
    });

    it('should call onDismiss when clicked', () => {
      const onDismiss = jest.fn();
      render(<ErrorAlert error="Error" onDismiss={onDismiss} />);

      fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('variants', () => {
    it('should apply error variant styles by default', () => {
      render(<ErrorAlert error="Error" />);

      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('bg-red-50');
    });

    it('should apply warning variant styles', () => {
      render(<ErrorAlert error="Warning" variant="warning" />);

      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('bg-yellow-50');
    });

    it('should apply info variant styles', () => {
      render(<ErrorAlert error="Info" variant="info" />);

      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('bg-blue-50');
    });
  });

  describe('technical message', () => {
    it('should not show technical message by default', () => {
      render(<ErrorAlert error={new Error('ECONNREFUSED at localhost:3000')} />);

      expect(screen.queryByText(/Technical:/)).not.toBeInTheDocument();
    });

    it('should show technical message when showTechnical is true', () => {
      render(<ErrorAlert error={new Error('ECONNREFUSED at localhost:3000')} showTechnical />);

      expect(screen.getByText(/Technical:/)).toBeInTheDocument();
      expect(screen.getByText(/ECONNREFUSED at localhost:3000/)).toBeInTheDocument();
    });

    it('should not show duplicate technical message if same as user message', () => {
      // When technical message maps to the same user message,
      // we shouldn't show duplicate text as "Technical: ..."
      render(<ErrorAlert error="Something went wrong. Please try again." showTechnical />);

      // Technical prefix should not appear since technical === userMessage
      expect(screen.queryByText(/^Technical:/)).not.toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have alert role', () => {
      render(<ErrorAlert error="Error" />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('should have aria-live assertive', () => {
      render(<ErrorAlert error="Error" />);

      expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
    });

    it('should have accessible button labels', () => {
      const onRetry = jest.fn();
      const onDismiss = jest.fn();
      render(<ErrorAlert error={new Error('Network error')} onRetry={onRetry} onDismiss={onDismiss} />);

      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
    });
  });

  describe('custom className', () => {
    it('should apply custom className', () => {
      render(<ErrorAlert error="Error" className="my-custom-class" />);

      expect(screen.getByRole('alert')).toHaveClass('my-custom-class');
    });
  });

  describe('error categories', () => {
    const categoryTests = [
      { error: 'Network error', expectedTitle: 'Connection Error' },
      { error: 'Timeout', expectedTitle: 'Request Timeout' },
      { error: 'Unauthorized', expectedTitle: 'Authentication Required' },
      { error: 'Forbidden', expectedTitle: 'Permission Denied' },
      { error: 'Invalid input', expectedTitle: 'Invalid Input' },
      { error: 'Not found', expectedTitle: 'Not Found' },
      { error: 'Already exists', expectedTitle: 'Conflict' },
      { error: 'Server error', expectedTitle: 'Server Error' },
    ];

    it.each(categoryTests)('should display correct title for "$error"', ({ error, expectedTitle }) => {
      render(<ErrorAlert error={new Error(error)} />);

      expect(screen.getByText(expectedTitle)).toBeInTheDocument();
    });
  });
});

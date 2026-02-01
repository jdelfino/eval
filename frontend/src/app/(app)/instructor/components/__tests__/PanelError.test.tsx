/**
 * Tests for PanelError and PanelErrorBoundary components
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PanelError, PanelErrorBoundary } from '../PanelError';

describe('PanelError', () => {
  describe('rendering', () => {
    it('displays the panel title in the error message', () => {
      render(<PanelError title="Problem Setup" />);

      expect(screen.getByText('Problem Setup failed to load')).toBeInTheDocument();
    });

    it('displays custom error message when provided', () => {
      render(
        <PanelError
          title="Problem Setup"
          error="Network request failed"
        />
      );

      expect(screen.getByText('Network request failed')).toBeInTheDocument();
    });

    it('has role="alert" for accessibility', () => {
      render(<PanelError title="Test Panel" />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('generates correct data-testid from title', () => {
      render(<PanelError title="Problem Setup" />);

      expect(screen.getByTestId('panel-error-problem-setup')).toBeInTheDocument();
    });
  });

  describe('retry functionality', () => {
    it('shows retry button when onRetry is provided', () => {
      const mockRetry = jest.fn();
      render(<PanelError title="Test Panel" onRetry={mockRetry} />);

      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });

    it('does not show retry button when onRetry is not provided', () => {
      render(<PanelError title="Test Panel" />);

      expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
    });

    it('calls onRetry when retry button is clicked', () => {
      const mockRetry = jest.fn();
      render(<PanelError title="Test Panel" onRetry={mockRetry} />);

      fireEvent.click(screen.getByRole('button', { name: /try again/i }));

      expect(mockRetry).toHaveBeenCalledTimes(1);
    });
  });
});

describe('PanelErrorBoundary', () => {
  // Suppress console errors for error boundary tests
  const originalError = console.error;
  beforeAll(() => {
    console.error = jest.fn();
  });
  afterAll(() => {
    console.error = originalError;
  });

  const ThrowingComponent = () => {
    throw new Error('Test error message');
  };

  describe('normal operation', () => {
    it('renders children when no error occurs', () => {
      render(
        <PanelErrorBoundary title="Test Panel">
          <div>Child content</div>
        </PanelErrorBoundary>
      );

      expect(screen.getByText('Child content')).toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('renders PanelError when child throws', () => {
      render(
        <PanelErrorBoundary title="Problem Setup">
          <ThrowingComponent />
        </PanelErrorBoundary>
      );

      expect(screen.getByText('Problem Setup failed to load')).toBeInTheDocument();
    });

    it('displays the error message from the thrown error', () => {
      render(
        <PanelErrorBoundary title="Test Panel">
          <ThrowingComponent />
        </PanelErrorBoundary>
      );

      expect(screen.getByText('Test error message')).toBeInTheDocument();
    });

    it('renders custom fallback when provided', () => {
      render(
        <PanelErrorBoundary
          title="Test Panel"
          fallback={<div>Custom fallback</div>}
        >
          <ThrowingComponent />
        </PanelErrorBoundary>
      );

      expect(screen.getByText('Custom fallback')).toBeInTheDocument();
      expect(screen.queryByText('Test Panel failed to load')).not.toBeInTheDocument();
    });

    it('provides retry functionality that resets the error state', () => {
      let shouldThrow = true;
      const ConditionalThrower = () => {
        if (shouldThrow) {
          throw new Error('Test error');
        }
        return <div>Recovered content</div>;
      };

      render(
        <PanelErrorBoundary title="Test Panel">
          <ConditionalThrower />
        </PanelErrorBoundary>
      );

      // Should show error state
      expect(screen.getByText('Test Panel failed to load')).toBeInTheDocument();

      // Fix the condition and retry
      shouldThrow = false;
      fireEvent.click(screen.getByRole('button', { name: /try again/i }));

      // Should now show recovered content
      expect(screen.getByText('Recovered content')).toBeInTheDocument();
    });
  });
});

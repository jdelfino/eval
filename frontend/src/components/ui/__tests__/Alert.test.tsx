/**
 * Unit tests for Alert component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Alert } from '../Alert';

describe('Alert', () => {
  describe('basic rendering', () => {
    it('should render children content', () => {
      render(<Alert>This is an alert message</Alert>);

      expect(screen.getByText('This is an alert message')).toBeInTheDocument();
    });

    it('should render with role="alert"', () => {
      render(<Alert>Alert content</Alert>);

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(
        <Alert className="custom-alert" data-testid="alert">
          Content
        </Alert>
      );

      expect(screen.getByTestId('alert')).toHaveClass('custom-alert');
    });

    it('should pass through additional HTML attributes', () => {
      render(
        <Alert data-testid="alert" aria-describedby="description">
          Content
        </Alert>
      );

      expect(screen.getByTestId('alert')).toHaveAttribute('aria-describedby', 'description');
    });
  });

  describe('variants', () => {
    it('should render info variant by default', () => {
      render(<Alert data-testid="alert">Info message</Alert>);

      const alert = screen.getByTestId('alert');
      expect(alert).toHaveClass('bg-info-50');
      expect(alert).toHaveClass('border-info-200');
      expect(alert).toHaveClass('text-info-800');
    });

    it('should render error variant', () => {
      render(
        <Alert variant="error" data-testid="alert">
          Error message
        </Alert>
      );

      const alert = screen.getByTestId('alert');
      expect(alert).toHaveClass('bg-error-50');
      expect(alert).toHaveClass('border-error-200');
      expect(alert).toHaveClass('text-error-800');
    });

    it('should render warning variant', () => {
      render(
        <Alert variant="warning" data-testid="alert">
          Warning message
        </Alert>
      );

      const alert = screen.getByTestId('alert');
      expect(alert).toHaveClass('bg-warning-50');
      expect(alert).toHaveClass('border-warning-200');
      expect(alert).toHaveClass('text-warning-800');
    });

    it('should render success variant', () => {
      render(
        <Alert variant="success" data-testid="alert">
          Success message
        </Alert>
      );

      const alert = screen.getByTestId('alert');
      expect(alert).toHaveClass('bg-success-50');
      expect(alert).toHaveClass('border-success-200');
      expect(alert).toHaveClass('text-success-800');
    });

    it('should render info variant explicitly', () => {
      render(
        <Alert variant="info" data-testid="alert">
          Info message
        </Alert>
      );

      const alert = screen.getByTestId('alert');
      expect(alert).toHaveClass('bg-info-50');
      expect(alert).toHaveClass('border-info-200');
      expect(alert).toHaveClass('text-info-800');
    });
  });

  describe('icons', () => {
    it('should render an icon', () => {
      render(<Alert>Alert with icon</Alert>);

      // Icons are rendered as SVG elements
      const alert = screen.getByRole('alert');
      const svg = alert.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should have aria-hidden on icon', () => {
      render(<Alert>Alert content</Alert>);

      const alert = screen.getByRole('alert');
      const svg = alert.querySelector('svg');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('dismissible', () => {
    it('should not show dismiss button by default', () => {
      render(<Alert>Non-dismissible alert</Alert>);

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('should show dismiss button when dismissible is true', () => {
      render(<Alert dismissible>Dismissible alert</Alert>);

      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should have aria-label on dismiss button', () => {
      render(<Alert dismissible>Dismissible alert</Alert>);

      expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Dismiss');
    });

    it('should call onDismiss when dismiss button is clicked', () => {
      const handleDismiss = jest.fn();
      render(
        <Alert dismissible onDismiss={handleDismiss}>
          Dismissible alert
        </Alert>
      );

      fireEvent.click(screen.getByRole('button'));

      expect(handleDismiss).toHaveBeenCalledTimes(1);
    });

    it('should not throw when dismiss clicked without onDismiss handler', () => {
      render(<Alert dismissible>Dismissible alert</Alert>);

      expect(() => {
        fireEvent.click(screen.getByRole('button'));
      }).not.toThrow();
    });
  });

  describe('complex content', () => {
    it('should render with React elements as children', () => {
      render(
        <Alert variant="warning">
          <strong>Warning:</strong> This action cannot be undone.
        </Alert>
      );

      expect(screen.getByText('Warning:')).toBeInTheDocument();
      expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
    });

    it('should render with nested components', () => {
      render(
        <Alert variant="error">
          <div data-testid="nested">
            <p>Error details</p>
            <ul>
              <li>Issue 1</li>
              <li>Issue 2</li>
            </ul>
          </div>
        </Alert>
      );

      expect(screen.getByTestId('nested')).toBeInTheDocument();
      expect(screen.getByText('Issue 1')).toBeInTheDocument();
      expect(screen.getByText('Issue 2')).toBeInTheDocument();
    });
  });

  describe('ref forwarding', () => {
    it('should forward ref to Alert container', () => {
      const ref = React.createRef<HTMLDivElement>();
      render(<Alert ref={ref}>Content</Alert>);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe('styling', () => {
    it('should have rounded corners', () => {
      render(<Alert data-testid="alert">Content</Alert>);

      expect(screen.getByTestId('alert')).toHaveClass('rounded-lg');
    });

    it('should have border', () => {
      render(<Alert data-testid="alert">Content</Alert>);

      expect(screen.getByTestId('alert')).toHaveClass('border');
    });

    it('should have padding', () => {
      render(<Alert data-testid="alert">Content</Alert>);

      expect(screen.getByTestId('alert')).toHaveClass('p-4');
    });

    it('should use flexbox layout', () => {
      render(<Alert data-testid="alert">Content</Alert>);

      expect(screen.getByTestId('alert')).toHaveClass('flex');
    });
  });
});

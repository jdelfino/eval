/**
 * Unit tests for StatusBadge component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StatusBadge } from '../StatusBadge';

describe('StatusBadge', () => {
  describe('basic rendering', () => {
    it('should render with default label for status', () => {
      render(<StatusBadge status="active" />);

      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('should render as a span (inherits from Badge)', () => {
      render(<StatusBadge status="pending" />);

      expect(screen.getByText('Pending').tagName).toBe('SPAN');
    });

    it('should apply custom className', () => {
      render(<StatusBadge status="active" className="custom-class" />);

      expect(screen.getByText('Active')).toHaveClass('custom-class');
    });
  });

  describe('status variants', () => {
    it('should render pending status with warning styling', () => {
      render(<StatusBadge status="pending" />);

      const badge = screen.getByText('Pending');
      expect(badge).toHaveClass('bg-warning-50');
      expect(badge).toHaveClass('text-warning-700');
    });

    it('should render active status with success styling', () => {
      render(<StatusBadge status="active" />);

      const badge = screen.getByText('Active');
      expect(badge).toHaveClass('bg-success-50');
      expect(badge).toHaveClass('text-success-700');
    });

    it('should render expired status with default styling', () => {
      render(<StatusBadge status="expired" />);

      const badge = screen.getByText('Expired');
      expect(badge).toHaveClass('bg-gray-100');
      expect(badge).toHaveClass('text-gray-700');
    });

    it('should render revoked status with error styling', () => {
      render(<StatusBadge status="revoked" />);

      const badge = screen.getByText('Revoked');
      expect(badge).toHaveClass('bg-error-50');
      expect(badge).toHaveClass('text-error-700');
    });

    it('should render consumed status with info styling', () => {
      render(<StatusBadge status="consumed" />);

      const badge = screen.getByText('Consumed');
      expect(badge).toHaveClass('bg-info-50');
      expect(badge).toHaveClass('text-info-700');
    });
  });

  describe('default labels', () => {
    it('should display "Pending" for pending status', () => {
      render(<StatusBadge status="pending" />);
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    it('should display "Active" for active status', () => {
      render(<StatusBadge status="active" />);
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('should display "Expired" for expired status', () => {
      render(<StatusBadge status="expired" />);
      expect(screen.getByText('Expired')).toBeInTheDocument();
    });

    it('should display "Revoked" for revoked status', () => {
      render(<StatusBadge status="revoked" />);
      expect(screen.getByText('Revoked')).toBeInTheDocument();
    });

    it('should display "Consumed" for consumed status', () => {
      render(<StatusBadge status="consumed" />);
      expect(screen.getByText('Consumed')).toBeInTheDocument();
    });
  });

  describe('custom labels', () => {
    it('should render custom label when children provided', () => {
      render(<StatusBadge status="active">Online</StatusBadge>);

      expect(screen.getByText('Online')).toBeInTheDocument();
      expect(screen.queryByText('Active')).not.toBeInTheDocument();
    });

    it('should use correct variant styling with custom label', () => {
      render(<StatusBadge status="pending">Waiting</StatusBadge>);

      const badge = screen.getByText('Waiting');
      expect(badge).toHaveClass('bg-warning-50');
      expect(badge).toHaveClass('text-warning-700');
    });

    it('should render React elements as children', () => {
      render(
        <StatusBadge status="active">
          <span data-testid="icon">*</span>
          <span>Custom</span>
        </StatusBadge>
      );

      expect(screen.getByTestId('icon')).toBeInTheDocument();
      expect(screen.getByText('Custom')).toBeInTheDocument();
    });
  });

  describe('badge inheritance', () => {
    it('should have pill-shaped styling from Badge', () => {
      render(<StatusBadge status="active" />);

      expect(screen.getByText('Active')).toHaveClass('rounded-full');
    });

    it('should have small text from Badge', () => {
      render(<StatusBadge status="active" />);

      expect(screen.getByText('Active')).toHaveClass('text-xs');
    });

    it('should have inline-flex layout from Badge', () => {
      render(<StatusBadge status="active" />);

      expect(screen.getByText('Active')).toHaveClass('inline-flex');
    });
  });

  describe('all status types render correctly', () => {
    it('should render all status types without errors', () => {
      const { rerender } = render(<StatusBadge status="pending" />);
      expect(screen.getByText('Pending')).toBeInTheDocument();

      rerender(<StatusBadge status="active" />);
      expect(screen.getByText('Active')).toBeInTheDocument();

      rerender(<StatusBadge status="expired" />);
      expect(screen.getByText('Expired')).toBeInTheDocument();

      rerender(<StatusBadge status="revoked" />);
      expect(screen.getByText('Revoked')).toBeInTheDocument();

      rerender(<StatusBadge status="consumed" />);
      expect(screen.getByText('Consumed')).toBeInTheDocument();
    });
  });
});

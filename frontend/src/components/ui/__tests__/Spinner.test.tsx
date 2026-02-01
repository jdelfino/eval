/**
 * Unit tests for Spinner component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Spinner } from '../Spinner';

describe('Spinner', () => {
  describe('rendering', () => {
    it('should render with default props', () => {
      render(<Spinner />);

      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('should have default aria-label of Loading', () => {
      render(<Spinner />);

      expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading');
    });

    it('should include sr-only Loading text when no label', () => {
      render(<Spinner />);

      expect(screen.getByText('Loading')).toHaveClass('sr-only');
    });
  });

  describe('sizes', () => {
    it('should apply small size classes', () => {
      render(<Spinner size="sm" />);

      const spinnerElement = screen.getByRole('status').querySelector('[aria-hidden="true"]');
      expect(spinnerElement).toHaveClass('w-4', 'h-4');
    });

    it('should apply medium size classes by default', () => {
      render(<Spinner />);

      const spinnerElement = screen.getByRole('status').querySelector('[aria-hidden="true"]');
      expect(spinnerElement).toHaveClass('w-6', 'h-6');
    });

    it('should apply large size classes', () => {
      render(<Spinner size="lg" />);

      const spinnerElement = screen.getByRole('status').querySelector('[aria-hidden="true"]');
      expect(spinnerElement).toHaveClass('w-8', 'h-8');
    });
  });

  describe('label', () => {
    it('should display visible label when provided', () => {
      render(<Spinner label="Loading content..." />);

      expect(screen.getByText('Loading content...')).toBeInTheDocument();
      expect(screen.getByText('Loading content...')).not.toHaveClass('sr-only');
    });

    it('should use label as aria-label', () => {
      render(<Spinner label="Loading content..." />);

      expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading content...');
    });

    it('should not show sr-only text when label is provided', () => {
      render(<Spinner label="Loading content..." />);

      // Should not have an element with sr-only class
      expect(screen.queryByText('Loading')).not.toBeInTheDocument();
    });
  });

  describe('animation', () => {
    it('should have animate-spin class', () => {
      render(<Spinner />);

      const spinnerElement = screen.getByRole('status').querySelector('[aria-hidden="true"]');
      expect(spinnerElement).toHaveClass('animate-spin');
    });

    it('should have brand color classes', () => {
      render(<Spinner />);

      const spinnerElement = screen.getByRole('status').querySelector('[aria-hidden="true"]');
      expect(spinnerElement).toHaveClass('border-brand-600');
      expect(spinnerElement).toHaveClass('border-t-transparent');
    });
  });

  describe('accessibility', () => {
    it('should have role status', () => {
      render(<Spinner />);

      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('should have spinner element marked as aria-hidden', () => {
      render(<Spinner />);

      const spinnerElement = screen.getByRole('status').querySelector('[aria-hidden="true"]');
      expect(spinnerElement).toBeInTheDocument();
    });
  });

  describe('custom className', () => {
    it('should apply custom className', () => {
      render(<Spinner className="my-custom-class" />);

      expect(screen.getByRole('status')).toHaveClass('my-custom-class');
    });
  });
});

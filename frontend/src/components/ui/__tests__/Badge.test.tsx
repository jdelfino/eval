/**
 * Unit tests for Badge component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Badge } from '../Badge';

describe('Badge', () => {
  describe('rendering', () => {
    it('should render children content', () => {
      render(<Badge>Active</Badge>);

      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('should render as a span element', () => {
      render(<Badge>Status</Badge>);

      const badge = screen.getByText('Status');
      expect(badge.tagName).toBe('SPAN');
    });
  });

  describe('custom className', () => {
    it('should apply custom className', () => {
      render(<Badge className="my-custom-class">Custom</Badge>);

      expect(screen.getByText('Custom')).toHaveClass('my-custom-class');
    });
  });

  describe('complex children', () => {
    it('should render with React elements as children', () => {
      render(
        <Badge>
          <span data-testid="icon">*</span>
          <span>With Icon</span>
        </Badge>
      );

      expect(screen.getByTestId('icon')).toBeInTheDocument();
      expect(screen.getByText('With Icon')).toBeInTheDocument();
    });
  });

  describe('variants', () => {
    it('should render all variants without errors', () => {
      const { rerender } = render(<Badge variant="default">Default</Badge>);
      expect(screen.getByText('Default')).toBeInTheDocument();

      rerender(<Badge variant="success">Success</Badge>);
      expect(screen.getByText('Success')).toBeInTheDocument();

      rerender(<Badge variant="warning">Warning</Badge>);
      expect(screen.getByText('Warning')).toBeInTheDocument();

      rerender(<Badge variant="error">Error</Badge>);
      expect(screen.getByText('Error')).toBeInTheDocument();

      rerender(<Badge variant="info">Info</Badge>);
      expect(screen.getByText('Info')).toBeInTheDocument();
    });
  });
});

/**
 * Unit tests for Button component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../Button';

describe('Button', () => {
  describe('rendering', () => {
    it('should render with children', () => {
      render(<Button>Click me</Button>);

      expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
    });
  });

  describe('states', () => {
    it('should be disabled when disabled prop is true', () => {
      render(<Button disabled>Disabled</Button>);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('should show loading spinner and be disabled when loading', () => {
      render(<Button loading>Loading</Button>);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');

      // Check for spinner SVG
      const spinner = button.querySelector('svg');
      expect(spinner).toBeInTheDocument();
    });

    it('should still show children when loading', () => {
      render(<Button loading>Submitting...</Button>);

      expect(screen.getByText('Submitting...')).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('should call onClick when clicked', () => {
      const handleClick = jest.fn();
      render(<Button onClick={handleClick}>Click me</Button>);

      fireEvent.click(screen.getByRole('button'));

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should not call onClick when disabled', () => {
      const handleClick = jest.fn();
      render(
        <Button onClick={handleClick} disabled>
          Disabled
        </Button>
      );

      fireEvent.click(screen.getByRole('button'));

      expect(handleClick).not.toHaveBeenCalled();
    });

    it('should not call onClick when loading', () => {
      const handleClick = jest.fn();
      render(
        <Button onClick={handleClick} loading>
          Loading
        </Button>
      );

      fireEvent.click(screen.getByRole('button'));

      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('forwarded ref', () => {
    it('should forward ref to button element', () => {
      const ref = React.createRef<HTMLButtonElement>();
      render(<Button ref={ref}>Ref Button</Button>);

      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
      expect(ref.current?.textContent).toContain('Ref Button');
    });
  });

  describe('asChild pattern', () => {
    it('should render child element when asChild is true', () => {
      render(
        <Button asChild variant="primary">
          <a href="/test">Link Button</a>
        </Button>
      );

      expect(screen.getByRole('link', { name: 'Link Button' })).toBeInTheDocument();
    });

    it('should pass aria-disabled to child when disabled', () => {
      render(
        <Button asChild disabled>
          <a href="/test">Disabled Link</a>
        </Button>
      );

      expect(screen.getByRole('link')).toHaveAttribute('aria-disabled', 'true');
    });
  });

  describe('button attributes', () => {
    it('should pass through native button attributes', () => {
      render(
        <Button type="submit" name="submit-btn" data-testid="test-button">
          Submit
        </Button>
      );

      const button = screen.getByTestId('test-button');
      expect(button).toHaveAttribute('type', 'submit');
      expect(button).toHaveAttribute('name', 'submit-btn');
    });
  });

  describe('accessibility', () => {
    it('should be focusable', () => {
      render(<Button>Focusable</Button>);

      const button = screen.getByRole('button');
      button.focus();

      expect(document.activeElement).toBe(button);
    });

    it('should support aria-label', () => {
      render(<Button aria-label="Close dialog">X</Button>);

      expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
    });
  });

  describe('new token-driven variants', () => {
    /**
     * Verifies the `run` variant uses the --run CSS token for its background.
     * If this breaks, the "Run all" button in the test rail loses its semantic
     * green signal color and blends in with other buttons.
     */
    it('variant=run renders with --run background via inline style', () => {
      render(<Button variant="run">Run all</Button>);
      const button = screen.getByRole('button', { name: 'Run all' });
      expect(button).toHaveStyle({ background: 'var(--run)' });
    });

    it('variant=run renders with --accent-fg text color', () => {
      render(<Button variant="run">Run all</Button>);
      const button = screen.getByRole('button', { name: 'Run all' });
      expect(button).toHaveStyle({ color: 'var(--accent-fg)' });
    });

    /**
     * Verifies the `quiet` variant uses transparent background with a border.
     * If this breaks, quiet buttons lose their subtle appearance and may look
     * identical to primary or secondary buttons.
     */
    it('variant=quiet renders with transparent background', () => {
      render(<Button variant="quiet">Cancel</Button>);
      const button = screen.getByRole('button', { name: 'Cancel' });
      expect(button).toHaveStyle({ background: 'transparent' });
    });

    it('variant=quiet renders with --border token for border', () => {
      render(<Button variant="quiet">Cancel</Button>);
      const button = screen.getByRole('button', { name: 'Cancel' });
      // border should reference the --border token
      expect(button.style.border).toContain('var(--border)');
    });

    it('variant=quiet renders with --fg-muted text color', () => {
      render(<Button variant="quiet">Cancel</Button>);
      const button = screen.getByRole('button', { name: 'Cancel' });
      expect(button).toHaveStyle({ color: 'var(--fg-muted)' });
    });
  });
});

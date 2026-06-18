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

  describe('style prop merging with variant inline styles', () => {
    /**
     * Regression for eval-3b0: caller `style` was replacing `variantInlineStyles`
     * entirely, so token variants rendered unstyled when a `style` prop was passed.
     * Now both are merged: variant styles come first, caller style overrides on top.
     */
    it('variant=accent keeps var(--accent) background when style prop is also passed', () => {
      render(<Button variant="accent" style={{ width: '100%' }}>Accept</Button>);
      const button = screen.getByRole('button', { name: 'Accept' });
      // Both variant background AND caller width must be present
      expect(button).toHaveStyle({ background: 'var(--accent)', width: '100%' });
    });

    it('caller style overrides variant inline style when keys conflict', () => {
      render(<Button variant="accent" style={{ background: 'red' }}>Override</Button>);
      const button = screen.getByRole('button', { name: 'Override' });
      // Caller style takes precedence
      expect(button).toHaveStyle({ background: 'red' });
    });

    it('variant=accent renders with var(--accent) background (no caller style)', () => {
      render(<Button variant="accent">Join</Button>);
      const button = screen.getByRole('button', { name: 'Join' });
      expect(button).toHaveStyle({ background: 'var(--accent)' });
    });

    it('asChild preserves variant inline style and merges caller style', () => {
      render(
        <Button asChild variant="accent" style={{ flex: 1 }}>
          <a href="/test">Link Button</a>
        </Button>
      );
      const link = screen.getByRole('link', { name: 'Link Button' });
      expect(link).toHaveStyle({ background: 'var(--accent)', flex: '1' });
    });
  });

  describe('size variants', () => {
    it('size=xs renders with text-xs class (12px font)', () => {
      render(<Button size="xs">Tiny</Button>);
      const button = screen.getByRole('button', { name: 'Tiny' });
      expect(button.className).toContain('text-xs');
    });

    it('size=xs works with variant=accent', () => {
      render(
        <Button variant="accent" size="xs">
          Practice
        </Button>
      );
      const button = screen.getByRole('button', { name: 'Practice' });
      expect(button.className).toContain('text-xs');
      expect(button).toHaveStyle({ background: 'var(--accent)' });
    });

    it('size=xs works with variant=quiet', () => {
      render(
        <Button variant="quiet" size="xs">
          View Solution
        </Button>
      );
      const button = screen.getByRole('button', { name: 'View Solution' });
      expect(button.className).toContain('text-xs');
      expect(button).toHaveStyle({ background: 'transparent' });
    });

    it('size=sm renders with text-sm and compact padding', () => {
      render(<Button size="sm">Small</Button>);
      const button = screen.getByRole('button', { name: 'Small' });
      expect(button.className).toContain('text-sm');
    });

    it('size=md is the default size', () => {
      render(<Button>Default</Button>);
      const button = screen.getByRole('button', { name: 'Default' });
      expect(button.className).toContain('text-sm');
      expect(button.className).toContain('px-4');
    });

    it('size=lg renders with text-base', () => {
      render(<Button size="lg">Large</Button>);
      const button = screen.getByRole('button', { name: 'Large' });
      expect(button.className).toContain('text-base');
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

    /**
     * Canonical primary is the brand accent (eval-7lg). The legacy indigo/purple
     * gradient was removed; primary must now render the --accent token background
     * (identical treatment to the `accent` variant) so the default Button matches
     * the redesign's orange brand color.
     */
    it('variant=primary renders with --accent background via inline style', () => {
      render(<Button variant="primary">Save</Button>);
      const button = screen.getByRole('button', { name: 'Save' });
      expect(button).toHaveStyle({ background: 'var(--accent)' });
    });

    it('variant=primary renders with --accent-fg text color', () => {
      render(<Button variant="primary">Save</Button>);
      const button = screen.getByRole('button', { name: 'Save' });
      expect(button).toHaveStyle({ color: 'var(--accent-fg)' });
    });

    it('default Button (no variant) renders with --accent background', () => {
      render(<Button>Default</Button>);
      const button = screen.getByRole('button', { name: 'Default' });
      expect(button).toHaveStyle({ background: 'var(--accent)' });
    });
  });
});

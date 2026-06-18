/**
 * Unit tests for EmptyState component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('renders the title', () => {
    render(<EmptyState title="No items yet" />);
    expect(screen.getByText('No items yet')).toBeInTheDocument();
  });

  // v4 vocabulary: body prop
  it('renders body text when provided', () => {
    render(<EmptyState title="No items" body="Get started by creating one." />);
    expect(screen.getByText('Get started by creating one.')).toBeInTheDocument();
  });

  // Backward-compat alias: blurb still works
  it('renders body text from deprecated blurb prop', () => {
    render(<EmptyState title="No items" blurb="Blurb text here." />);
    expect(screen.getByText('Blurb text here.')).toBeInTheDocument();
  });

  it('does not render body text when neither body nor blurb provided', () => {
    render(<EmptyState title="No items" />);
    // no <p> sibling with body text
    expect(screen.queryByRole('paragraph')).toBeNull();
  });

  // v4 vocabulary: primary prop
  it('renders primary action when provided via primary prop', () => {
    render(
      <EmptyState
        title="No items"
        primary={<button>Create one</button>}
      />
    );
    expect(screen.getByRole('button', { name: 'Create one' })).toBeInTheDocument();
  });

  // Backward-compat alias: action still works
  it('renders primary action from deprecated action prop', () => {
    render(
      <EmptyState
        title="No items"
        action={<button>Create one</button>}
      />
    );
    expect(screen.getByRole('button', { name: 'Create one' })).toBeInTheDocument();
  });

  it('renders secondary action when provided', () => {
    render(
      <EmptyState
        title="No items"
        primary={<button>Primary</button>}
        secondary={<button>Secondary</button>}
      />
    );
    expect(screen.getByRole('button', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Secondary' })).toBeInTheDocument();
  });

  it('applies additional className', () => {
    const { container } = render(
      <EmptyState title="No items" className="custom-class" />
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('renders the icon element', () => {
    const { container } = render(<EmptyState title="No items" icon="book" />);
    // Icon renders an SVG
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  // T5a: optional `code` badge (mono chip above the icon) used by 404/403/500 surfaces
  describe('code badge', () => {
    it('renders the mono code chip with the provided text when code is set', () => {
      render(<EmptyState title="Not found" code="404 · Not found" />);
      expect(screen.getByText('404 · Not found')).toBeInTheDocument();
    });

    it('renders the code chip before the icon circle and title', () => {
      const { container } = render(
        <EmptyState title="Server error" code="500 · Something on our end" tone="danger" />
      );
      const root = container.firstChild as HTMLElement;
      const chip = screen.getByText('500 · Something on our end');
      const circle = container.querySelector('.bg-red-100');
      const heading = screen.getByRole('heading', { name: 'Server error' });
      const order = Array.from(root.children);
      // chip is the first child, before the icon circle and the title
      expect(order.indexOf(chip)).toBe(0);
      expect(order.indexOf(chip)).toBeLessThan(order.indexOf(circle as Element));
      expect(order.indexOf(chip)).toBeLessThan(order.indexOf(heading));
    });

    it('uses a monospace font for the code chip', () => {
      render(<EmptyState title="Not found" code="404 · Not found" />);
      expect(screen.getByText('404 · Not found')).toHaveClass('font-mono');
    });

    it('renders no code chip when code is absent (existing callers unchanged)', () => {
      const { container } = render(<EmptyState title="No items" />);
      expect(container.querySelector('.font-mono')).toBeNull();
    });
  });

  describe('tone prop', () => {
    it('defaults to neutral tone (gray icon circle)', () => {
      const { container } = render(<EmptyState title="No items" />);
      const circle = container.querySelector('.bg-gray-100');
      expect(circle).toBeInTheDocument();
    });

    it('applies info tone (blue icon circle)', () => {
      const { container } = render(<EmptyState title="No items" tone="info" />);
      const circle = container.querySelector('.bg-blue-100');
      expect(circle).toBeInTheDocument();
    });

    it('applies ok tone (green icon circle)', () => {
      const { container } = render(<EmptyState title="No items" tone="ok" />);
      const circle = container.querySelector('.bg-green-100');
      expect(circle).toBeInTheDocument();
    });

    it('applies warn tone (yellow icon circle)', () => {
      const { container } = render(<EmptyState title="No items" tone="warn" />);
      const circle = container.querySelector('.bg-yellow-100');
      expect(circle).toBeInTheDocument();
    });

    it('applies danger tone (red icon circle)', () => {
      const { container } = render(<EmptyState title="No items" tone="danger" />);
      const circle = container.querySelector('.bg-red-100');
      expect(circle).toBeInTheDocument();
    });
  });
});

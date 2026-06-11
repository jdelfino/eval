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

  it('renders the blurb when provided', () => {
    render(<EmptyState title="No items" blurb="Get started by creating one." />);
    expect(screen.getByText('Get started by creating one.')).toBeInTheDocument();
  });

  it('does not render blurb when not provided', () => {
    render(<EmptyState title="No items" />);
    // no <p> sibling with blurb text
    expect(screen.queryByRole('paragraph')).toBeNull();
  });

  it('renders the action when provided', () => {
    render(
      <EmptyState
        title="No items"
        action={<button>Create one</button>}
      />
    );
    expect(screen.getByRole('button', { name: 'Create one' })).toBeInTheDocument();
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
});

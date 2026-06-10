/**
 * Unit tests for Chip.
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Chip } from '../Chip';

describe('Chip', () => {
  it('renders children', () => {
    render(<Chip>#loops</Chip>);
    expect(screen.getByText('#loops')).toBeInTheDocument();
  });

  it('renders as a span when no onClick provided', () => {
    const { container } = render(<Chip>tag</Chip>);
    expect(container.querySelector('span')).toBeInTheDocument();
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders as a button when onClick provided', () => {
    render(<Chip onClick={() => {}}>tag</Chip>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handler = jest.fn();
    render(<Chip onClick={handler}>tag</Chip>);
    fireEvent.click(screen.getByRole('button'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('shows count when provided', () => {
    render(<Chip count={5}>tag</Chip>);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('does not show count element when count is undefined', () => {
    render(<Chip>tag</Chip>);
    // No number element
    expect(screen.queryByText(/^\d+$/)).toBeNull();
  });

  it('applies active styles when active=true', () => {
    render(<Chip active onClick={() => {}}>tag</Chip>);
    const btn = screen.getByRole('button');
    // When active, fontWeight should be 600
    expect(btn).toHaveStyle({ fontWeight: 600 });
  });

  it('applies data-testid', () => {
    render(<Chip data-testid="my-chip">tag</Chip>);
    expect(screen.getByTestId('my-chip')).toBeInTheDocument();
  });
});

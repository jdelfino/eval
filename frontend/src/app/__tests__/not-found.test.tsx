/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

// Mock next/link to render a plain anchor so href assertions work
jest.mock('next/link', () => {
  const MockLink = ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  );
  MockLink.displayName = 'MockLink';
  return MockLink;
});

import NotFound from '../not-found';

describe('NotFound (not-found.tsx)', () => {
  it('renders the 404 EmptyState with the code badge', () => {
    render(<NotFound />);
    expect(screen.getByText('404 · Not found')).toBeInTheDocument();
    expect(screen.getByText('404 · Not found')).toHaveClass('font-mono');
  });

  it('renders a "Browse library" action linking to the library', () => {
    render(<NotFound />);
    const browse = screen.getByRole('link', { name: /browse library/i });
    expect(browse).toBeInTheDocument();
    expect(browse).toHaveAttribute('href', '/instructor/problems');
  });

  it('renders a "Back home" action linking to home', () => {
    render(<NotFound />);
    const home = screen.getByRole('link', { name: /back home/i });
    expect(home).toBeInTheDocument();
    expect(home).toHaveAttribute('href', '/');
  });
});

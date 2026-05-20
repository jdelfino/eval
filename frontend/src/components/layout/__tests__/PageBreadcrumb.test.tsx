/**
 * Tests for PageBreadcrumb component — v4 reskin.
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/hooks/useBreadcrumbs', () => ({
  useBreadcrumbs: () => [],
}));

jest.mock('next/link', () => {
  const MockLink = ({ href, children, style }: { href: string; children: React.ReactNode; style?: React.CSSProperties }) => (
    <a href={href} style={style}>{children}</a>
  );
  MockLink.displayName = 'Link';
  return MockLink;
});

import { PageBreadcrumb } from '../PageBreadcrumb';

describe('PageBreadcrumb (v4 reskin)', () => {
  it('returns null when there are no breadcrumbs', () => {
    const { container } = render(<PageBreadcrumb />);
    expect(container.firstChild).toBeNull();
  });

  it('renders custom items with CSS-var-driven styles — no leading Home icon link', () => {
    /**
     * Contract: v4 PageBreadcrumb uses CSS variable tokens (--fg, --fg-muted) and drops the
     * leading Home icon link that was present in v3.
     * Why it matters: The reskin relies on CSS vars for theming; hardcoded Tailwind classes would
     * break dark mode and design token changes. Home icon link is dropped per v4 spec.
     * What breaks: If old Tailwind classes are present instead of CSS vars, or Home icon renders.
     */
    render(
      <PageBreadcrumb
        items={[
          { label: 'Classes', href: '/classes' },
          { label: 'CS101' },
        ]}
      />
    );

    // No Home icon link (no aria-label="Home" link)
    expect(screen.queryByRole('link', { name: /home/i })).toBeNull();

    // Current page item (last) should have fg color and fontWeight 500
    const currentPage = screen.getByText('CS101');
    expect(currentPage).toHaveStyle({ color: 'var(--fg)', fontWeight: 500 });

    // Non-last item (Classes) should have fg-muted color
    const classesLink = screen.getByRole('link', { name: 'Classes' });
    expect(classesLink).toHaveStyle({ color: 'var(--fg-muted)', fontWeight: 400 });
  });

  it('uses slash separator between items instead of ChevronRight', () => {
    /**
     * Contract: v4 uses "/" text separator, not the ChevronRight icon component.
     * Why it matters: Icon components add visual weight inconsistent with the slim v4 AppBarLite.
     * What breaks: If ChevronRight is used, accessibility semantics differ and icon import costs remain.
     */
    const { container } = render(
      <PageBreadcrumb
        items={[
          { label: 'Classes', href: '/classes' },
          { label: 'CS101' },
        ]}
      />
    );

    // Should have a "/" separator
    const separators = Array.from(container.querySelectorAll('[aria-hidden="true"]'));
    const slashSep = separators.find(el => el.textContent === '/');
    expect(slashSep).toBeTruthy();
  });

  it('uses aria-current=page on the last item', () => {
    render(
      <PageBreadcrumb
        items={[
          { label: 'Classes', href: '/classes' },
          { label: 'CS101' },
        ]}
      />
    );

    const currentPage = screen.getByText('CS101');
    expect(currentPage).toHaveAttribute('aria-current', 'page');
  });

  it('renders nav with aria-label Breadcrumb', () => {
    render(<PageBreadcrumb items={[{ label: 'Classes' }]} />);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
  });

  it('uses fontSize 12.5 on the nav container', () => {
    const { container } = render(<PageBreadcrumb items={[{ label: 'Classes' }]} />);
    const nav = container.querySelector('nav');
    expect(nav).toHaveStyle({ fontSize: '12.5px' });
  });
});

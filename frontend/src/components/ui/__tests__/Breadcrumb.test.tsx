/**
 * Unit tests for Breadcrumb component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Breadcrumb, BreadcrumbItem } from '../Breadcrumb';

// Mock next/link
jest.mock('next/link', () => {
  return function MockLink({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) {
    return <a href={href} className={className}>{children}</a>;
  };
});

describe('Breadcrumb', () => {
  describe('rendering', () => {
    it('should render nothing when items array is empty', () => {
      const { container } = render(<Breadcrumb items={[]} />);

      expect(container.firstChild).toBeNull();
    });

    it('should render single item', () => {
      const items: BreadcrumbItem[] = [{ label: 'Home' }];
      render(<Breadcrumb items={items} />);

      expect(screen.getByText('Home')).toBeInTheDocument();
    });

    it('should render multiple items', () => {
      const items: BreadcrumbItem[] = [
        { label: 'Classes', href: '/classes' },
        { label: 'CS 101', href: '/classes/cs101' },
        { label: 'Section A' },
      ];
      render(<Breadcrumb items={items} />);

      expect(screen.getByText('Classes')).toBeInTheDocument();
      expect(screen.getByText('CS 101')).toBeInTheDocument();
      expect(screen.getByText('Section A')).toBeInTheDocument();
    });
  });

  describe('links', () => {
    it('should render items with href as links', () => {
      const items: BreadcrumbItem[] = [
        { label: 'Classes', href: '/classes' },
        { label: 'Current' },
      ];
      render(<Breadcrumb items={items} />);

      const link = screen.getByRole('link', { name: 'Classes' });
      expect(link).toHaveAttribute('href', '/classes');
    });

    it('should render last item as non-clickable text with aria-current', () => {
      const items: BreadcrumbItem[] = [
        { label: 'Classes', href: '/classes' },
        { label: 'Current Page' },
      ];
      render(<Breadcrumb items={items} />);

      const lastItem = screen.getByText('Current Page');
      expect(lastItem.tagName).toBe('SPAN');
      expect(lastItem).toHaveAttribute('aria-current', 'page');
    });
  });

  describe('separator', () => {
    it('should use "/" as default separator', () => {
      const items: BreadcrumbItem[] = [
        { label: 'Home', href: '/' },
        { label: 'Page' },
      ];
      render(<Breadcrumb items={items} />);

      expect(screen.getByText('/')).toBeInTheDocument();
    });

    it('should use custom separator when provided', () => {
      const items: BreadcrumbItem[] = [
        { label: 'Home', href: '/' },
        { label: 'Page' },
      ];
      render(<Breadcrumb items={items} separator=">" />);

      expect(screen.getByText('>')).toBeInTheDocument();
      expect(screen.queryByText('/')).not.toBeInTheDocument();
    });

    it('should hide separator from screen readers', () => {
      const items: BreadcrumbItem[] = [
        { label: 'Home', href: '/' },
        { label: 'Page' },
      ];
      render(<Breadcrumb items={items} />);

      const separator = screen.getByText('/');
      expect(separator).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('responsive collapse', () => {
    it('should not show ellipsis when 3 or fewer items', () => {
      const items: BreadcrumbItem[] = [
        { label: 'One', href: '/one' },
        { label: 'Two', href: '/two' },
        { label: 'Three' },
      ];
      render(<Breadcrumb items={items} />);

      expect(screen.queryByText('...')).not.toBeInTheDocument();
    });

    it('should show ellipsis when more than 3 items', () => {
      const items: BreadcrumbItem[] = [
        { label: 'One', href: '/one' },
        { label: 'Two', href: '/two' },
        { label: 'Three', href: '/three' },
        { label: 'Four' },
      ];
      render(<Breadcrumb items={items} />);

      expect(screen.getByText('...')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have navigation landmark with aria-label', () => {
      const items: BreadcrumbItem[] = [{ label: 'Home' }];
      render(<Breadcrumb items={items} />);

      const nav = screen.getByRole('navigation');
      expect(nav).toHaveAttribute('aria-label', 'Breadcrumb');
    });

    it('should use ordered list for semantic structure', () => {
      const items: BreadcrumbItem[] = [
        { label: 'Home', href: '/' },
        { label: 'Page' },
      ];
      render(<Breadcrumb items={items} />);

      expect(screen.getByRole('list')).toBeInTheDocument();
      expect(screen.getAllByRole('listitem').length).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('should handle items with special characters in labels', () => {
      const items: BreadcrumbItem[] = [
        { label: 'CS 101 & Math 200', href: '/classes' },
        { label: 'Section <A>' },
      ];
      render(<Breadcrumb items={items} />);

      expect(screen.getByText('CS 101 & Math 200')).toBeInTheDocument();
      expect(screen.getByText('Section <A>')).toBeInTheDocument();
    });
  });
});

/**
 * @jest-environment jsdom
 */

/**
 * Tests for instructor page breadcrumb integration
 *
 * Verifies:
 * - Breadcrumb items are built correctly for each view
 * - Navigation path shows correct hierarchy
 * - Links navigate to correct views
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Breadcrumb, BreadcrumbItem } from '@/components/ui/Breadcrumb';

// Mock next/link
jest.mock('next/link', () => {
  return function MockLink({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) {
    return <a href={href} className={className}>{children}</a>;
  };
});

/**
 * Helper function that mirrors the breadcrumb building logic from the instructor page
 * This allows us to test the logic in isolation
 */
function buildBreadcrumbItems(
  viewMode: 'classes' | 'sections' | 'problems' | 'sessions' | 'session' | 'details',
  classContext: { classId: string; className: string } | null,
  sessionContext: { sectionId: string; sectionName: string } | null,
  problemSubView: 'library' | 'creator'
): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [];

  // Handle problem creator view (no breadcrumbs)
  if (viewMode === 'problems' && problemSubView === 'creator') {
    return [];
  }

  // Add Classes as root for class-based navigation
  if (viewMode === 'classes' || viewMode === 'sections' || viewMode === 'session') {
    if (viewMode === 'classes') {
      items.push({ label: 'Classes' });
    } else {
      items.push({ label: 'Classes', href: '/classes' });
    }
  }

  // Add Problems as root for problem library navigation
  if (viewMode === 'problems') {
    items.push({ label: 'Problems' });
  }

  // Add Sessions as root for sessions navigation
  if (viewMode === 'sessions' || viewMode === 'details') {
    if (viewMode === 'sessions') {
      items.push({ label: 'Sessions' });
    } else {
      items.push({ label: 'Sessions', href: '/instructor' });
    }
  }

  // Add class name if we have class context
  if (classContext && (viewMode === 'sections' || viewMode === 'session')) {
    if (viewMode === 'sections') {
      items.push({ label: classContext.className });
    } else {
      items.push({ label: classContext.className, href: '/classes' });
    }
  }

  // Add section name for active session
  if (sessionContext && viewMode === 'session') {
    items.push({ label: sessionContext.sectionName });
  }

  // Add Session Details for details view
  if (viewMode === 'details') {
    items.push({ label: 'Session Details' });
  }

  return items;
}

describe('Instructor Breadcrumb Integration', () => {
  describe('Breadcrumb building logic', () => {
    describe('Classes view', () => {
      it('should show only "Classes" as current page', () => {
        const items = buildBreadcrumbItems('classes', null, null, 'library');

        expect(items).toHaveLength(1);
        expect(items[0]).toEqual({ label: 'Classes' });
        expect(items[0].href).toBeUndefined(); // Current page, no link
      });
    });

    describe('Sections view', () => {
      it('should show "Classes > ClassName" path', () => {
        const classContext = { classId: 'class-1', className: 'CS 101' };
        const items = buildBreadcrumbItems('sections', classContext, null, 'library');

        expect(items).toHaveLength(2);
        expect(items[0]).toEqual({ label: 'Classes', href: '/classes' });
        expect(items[1]).toEqual({ label: 'CS 101' }); // Current page
      });

      it('should handle class names with special characters', () => {
        const classContext = { classId: 'class-1', className: 'CS 101 & Math 200' };
        const items = buildBreadcrumbItems('sections', classContext, null, 'library');

        expect(items[1]).toEqual({ label: 'CS 101 & Math 200' });
      });
    });

    describe('Session view', () => {
      it('should show "Classes > ClassName > SectionName" path', () => {
        const classContext = { classId: 'class-1', className: 'CS 101' };
        const sessionContext = { sectionId: 'section-1', sectionName: 'Section A' };
        const items = buildBreadcrumbItems('session', classContext, sessionContext, 'library');

        expect(items).toHaveLength(3);
        expect(items[0]).toEqual({ label: 'Classes', href: '/classes' });
        expect(items[1]).toEqual({ label: 'CS 101', href: '/classes' });
        expect(items[2]).toEqual({ label: 'Section A' }); // Current page
      });

      it('should handle session without class context', () => {
        const sessionContext = { sectionId: 'section-1', sectionName: 'Section A' };
        const items = buildBreadcrumbItems('session', null, sessionContext, 'library');

        expect(items).toHaveLength(2);
        expect(items[0]).toEqual({ label: 'Classes', href: '/classes' });
        expect(items[1]).toEqual({ label: 'Section A' });
      });
    });

    describe('Problems view', () => {
      it('should show "Problems" for library subview', () => {
        const items = buildBreadcrumbItems('problems', null, null, 'library');

        expect(items).toHaveLength(1);
        expect(items[0]).toEqual({ label: 'Problems' });
      });

      it('should return empty array for creator subview', () => {
        const items = buildBreadcrumbItems('problems', null, null, 'creator');

        expect(items).toHaveLength(0);
      });
    });

    describe('Sessions view', () => {
      it('should show "Sessions" as current page', () => {
        const items = buildBreadcrumbItems('sessions', null, null, 'library');

        expect(items).toHaveLength(1);
        expect(items[0]).toEqual({ label: 'Sessions' });
      });
    });

    describe('Details view', () => {
      it('should show "Sessions > Session Details" path', () => {
        const items = buildBreadcrumbItems('details', null, null, 'library');

        expect(items).toHaveLength(2);
        expect(items[0]).toEqual({ label: 'Sessions', href: '/instructor' });
        expect(items[1]).toEqual({ label: 'Session Details' });
      });
    });
  });

  describe('Breadcrumb rendering', () => {
    it('should render Classes view breadcrumb correctly', () => {
      const items = buildBreadcrumbItems('classes', null, null, 'library');
      render(<Breadcrumb items={items} />);

      expect(screen.getByText('Classes')).toBeInTheDocument();
      expect(screen.getByText('Classes')).toHaveAttribute('aria-current', 'page');
    });

    it('should render Sections view breadcrumb with clickable link', () => {
      const classContext = { classId: 'class-1', className: 'CS 101' };
      const items = buildBreadcrumbItems('sections', classContext, null, 'library');
      render(<Breadcrumb items={items} />);

      const classesLink = screen.getByRole('link', { name: 'Classes' });
      expect(classesLink).toHaveAttribute('href', '/classes');
      expect(screen.getByText('CS 101')).toHaveAttribute('aria-current', 'page');
    });

    it('should render Session view breadcrumb with navigation hierarchy', () => {
      const classContext = { classId: 'class-1', className: 'CS 101' };
      const sessionContext = { sectionId: 'section-1', sectionName: 'Section A' };
      const items = buildBreadcrumbItems('session', classContext, sessionContext, 'library');
      render(<Breadcrumb items={items} />);

      expect(screen.getByRole('link', { name: 'Classes' })).toHaveAttribute('href', '/classes');
      expect(screen.getByRole('link', { name: 'CS 101' })).toHaveAttribute('href', '/classes');
      expect(screen.getByText('Section A')).toHaveAttribute('aria-current', 'page');
    });

    it('should render separators between items', () => {
      const classContext = { classId: 'class-1', className: 'CS 101' };
      const items = buildBreadcrumbItems('sections', classContext, null, 'library');
      render(<Breadcrumb items={items} separator="/" />);

      expect(screen.getByText('/')).toBeInTheDocument();
    });

    it('should not render when no items', () => {
      const items = buildBreadcrumbItems('problems', null, null, 'creator');
      const { container } = render(<Breadcrumb items={items} />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Accessibility', () => {
    it('should have navigation landmark', () => {
      const items = buildBreadcrumbItems('sessions', null, null, 'library');
      render(<Breadcrumb items={items} />);

      expect(screen.getByRole('navigation')).toHaveAttribute('aria-label', 'Breadcrumb');
    });

    it('should mark last item as current page', () => {
      const classContext = { classId: 'class-1', className: 'CS 101' };
      const sessionContext = { sectionId: 'section-1', sectionName: 'Section A' };
      const items = buildBreadcrumbItems('session', classContext, sessionContext, 'library');
      render(<Breadcrumb items={items} />);

      expect(screen.getByText('Section A')).toHaveAttribute('aria-current', 'page');
    });
  });
});

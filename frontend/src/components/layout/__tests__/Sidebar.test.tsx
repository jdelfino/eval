/**
 * Tests for Sidebar component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '../Sidebar';

// Mock next/navigation
const mockPathname = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}));

// Mock useAuth
const mockUser = jest.fn();
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser(),
  }),
}));

describe('Sidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname.mockReturnValue('/instructor');
    mockUser.mockReturnValue({
      id: 'user1',
      email: 'test@example.com',
      role: 'instructor',
    });
  });

  /**
   * Helper to get the sidebar aside element
   */
  function getSidebar() {
    return screen.getByRole('complementary', { name: /main navigation/i });
  }

  describe('rendering', () => {
    it('renders sidebar landmark', () => {
      render(<Sidebar />);

      expect(getSidebar()).toBeInTheDocument();
    });

    it('renders nav items for instructor role', () => {
      render(<Sidebar />);

      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Classes')).toBeInTheDocument();
      expect(screen.getByText('Problems')).toBeInTheDocument();
      // Note: Sessions removed from navigation - sessions are now managed from the dashboard
    });

    it('does not render admin items for instructor', () => {
      render(<Sidebar />);

      expect(screen.queryByText('User Management')).not.toBeInTheDocument();
      expect(screen.queryByText('Namespaces')).not.toBeInTheDocument();
    });
  });

  describe('role filtering', () => {
    it('shows only student items for student role', () => {
      mockUser.mockReturnValue({
        id: 'user1',
        email: 'student@example.com',
        role: 'student',
      });

      render(<Sidebar />);

      expect(screen.getByText('My Sections')).toBeInTheDocument();
      expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
      expect(screen.queryByText('Classes')).not.toBeInTheDocument();
    });

    it('shows admin items for namespace-admin role', () => {
      mockUser.mockReturnValue({
        id: 'user1',
        email: 'admin@example.com',
        role: 'namespace-admin',
      });

      render(<Sidebar />);

      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('User Management')).toBeInTheDocument();
      expect(screen.queryByText('Namespaces')).not.toBeInTheDocument();
    });

    it('shows all items for system-admin role', () => {
      mockUser.mockReturnValue({
        id: 'user1',
        email: 'sysadmin@example.com',
        role: 'system-admin',
      });

      render(<Sidebar />);

      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('User Management')).toBeInTheDocument();
      expect(screen.getByText('Namespaces')).toBeInTheDocument();
    });

    it('defaults to student role when no user', () => {
      mockUser.mockReturnValue(null);

      render(<Sidebar />);

      // Student role shows My Sections
      expect(screen.getByText('My Sections')).toBeInTheDocument();
      expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    });
  });

  describe('active state', () => {
    it('highlights active nav item based on pathname', () => {
      mockPathname.mockReturnValue('/instructor');

      render(<Sidebar />);

      const dashboardLink = screen.getByRole('link', { name: 'Dashboard' });
      expect(dashboardLink).toHaveAttribute('aria-current', 'page');
    });

    it('highlights nested route correctly', () => {
      mockPathname.mockReturnValue('/classes/123');

      render(<Sidebar />);

      const classesLink = screen.getByRole('link', { name: 'Classes' });
      expect(classesLink).toHaveAttribute('aria-current', 'page');
    });

    it('does not highlight non-active items', () => {
      mockPathname.mockReturnValue('/instructor');

      render(<Sidebar />);

      const classesLink = screen.getByRole('link', { name: 'Classes' });
      expect(classesLink).not.toHaveAttribute('aria-current', 'page');
    });
  });

  describe('collapsed state', () => {
    it('shows full width when not collapsed', () => {
      render(<Sidebar collapsed={false} />);

      const sidebar = getSidebar();
      expect(sidebar).toHaveClass('w-64');
    });

    it('shows narrow width when collapsed', () => {
      render(<Sidebar collapsed={true} />);

      const sidebar = getSidebar();
      expect(sidebar).toHaveClass('w-16');
    });

    it('shows labels when expanded', () => {
      render(<Sidebar collapsed={false} />);

      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    it('hides labels when collapsed', () => {
      render(<Sidebar collapsed={true} />);

      // Links should still exist but text content should not be visible
      const link = screen.getByRole('link', { name: 'Dashboard' });
      expect(link).toHaveAttribute('title', 'Dashboard');
    });

    it('shows group labels when expanded', () => {
      render(<Sidebar collapsed={false} />);

      expect(screen.getByText('Teaching')).toBeInTheDocument();
    });

    it('hides group labels when collapsed', () => {
      render(<Sidebar collapsed={true} />);

      expect(screen.queryByText('Teaching')).not.toBeInTheDocument();
    });
  });

  describe('toggle functionality', () => {
    it('shows toggle button when onToggleCollapse provided', () => {
      const onToggle = jest.fn();
      render(<Sidebar onToggleCollapse={onToggle} />);

      expect(screen.getByRole('button', { name: /collapse sidebar/i })).toBeInTheDocument();
    });

    it('hides toggle button when onToggleCollapse not provided', () => {
      render(<Sidebar />);

      expect(screen.queryByRole('button', { name: /collapse sidebar/i })).not.toBeInTheDocument();
    });

    it('calls onToggleCollapse when toggle button clicked', () => {
      const onToggle = jest.fn();
      render(<Sidebar onToggleCollapse={onToggle} />);

      fireEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));

      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('shows expand label when collapsed', () => {
      const onToggle = jest.fn();
      render(<Sidebar collapsed={true} onToggleCollapse={onToggle} />);

      expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('nav items have aria-label when collapsed', () => {
      render(<Sidebar collapsed={true} />);

      const links = screen.getAllByRole('link');
      links.forEach(link => {
        expect(link).toHaveAttribute('aria-label');
      });
    });

    it('links are navigable via keyboard', () => {
      render(<Sidebar />);

      const firstLink = screen.getByRole('link', { name: 'Dashboard' });
      firstLink.focus();

      expect(document.activeElement).toBe(firstLink);
    });
  });

  describe('nav groups', () => {
    it('renders nav groups in correct order', () => {
      mockUser.mockReturnValue({
        id: 'user1',
        email: 'sysadmin@example.com',
        role: 'system-admin',
      });

      render(<Sidebar />);

      const headings = screen.getAllByRole('heading', { level: 3 });
      const groupNames = headings.map(h => h.textContent);

      // System admin should see: Teaching, Admin, System (in that order)
      expect(groupNames).toEqual(['Teaching', 'Admin', 'System']);
    });

    it('renders only Main group for student', () => {
      mockUser.mockReturnValue({
        id: 'user1',
        email: 'student@example.com',
        role: 'student',
      });

      render(<Sidebar collapsed={false} />);

      expect(screen.getByText('Main')).toBeInTheDocument();
      expect(screen.queryByText('Teaching')).not.toBeInTheDocument();
    });
  });
});

/**
 * Tests for Help page component
 *
 * Tests:
 * - Student sees only content sections (no tabs)
 * - Instructor sees Student Guide + Instructor Guide tabs
 * - Admin sees all guide tabs
 * - Help intro text is rendered
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserRole } from '@/types/api';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/help',
}));

// Default mock user - will be overridden per test
let mockUser: {
  id: string;
  role: UserRole;
  namespace_id: string;
  email: string;
  display_name: string;
  created_at: string;
  updated_at: string;
  external_id: null;
} = {
  id: 'user-1',
  role: 'student',
  namespace_id: 'ns-1',
  email: 'student@test.com',
  display_name: 'Test Student',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  external_id: null,
};

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    isLoading: false,
  }),
}));

import HelpPage from '../page';

describe('Help Page', () => {
  beforeEach(() => {
    // Reset to student by default
    mockUser = {
      id: 'user-1',
      role: 'student',
      namespace_id: 'ns-1',
      email: 'student@test.com',
      display_name: 'Test Student',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      external_id: null,
    };
  });

  describe('student role', () => {
    it('renders help page heading', () => {
      render(<HelpPage />);
      expect(screen.getByRole('heading', { level: 1, name: /help/i })).toBeInTheDocument();
    });

    it('renders intro text', () => {
      render(<HelpPage />);
      expect(screen.getByText(/welcome/i)).toBeInTheDocument();
    });

    it('does not render tabs (only one guide)', () => {
      render(<HelpPage />);
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    });

    it('renders student guide content', () => {
      render(<HelpPage />);
      expect(screen.getByText(/student guide/i)).toBeInTheDocument();
    });

    it('does not show instructor guide content', () => {
      render(<HelpPage />);
      expect(screen.queryByText(/instructor guide/i)).not.toBeInTheDocument();
    });
  });

  describe('instructor role', () => {
    beforeEach(() => {
      mockUser = { ...mockUser, role: 'instructor' };
    });

    it('renders tabs for multiple guides', () => {
      render(<HelpPage />);
      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    it('renders Student Guide and Instructor Guide tabs', () => {
      render(<HelpPage />);
      expect(screen.getByRole('tab', { name: /student guide/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /instructor guide/i })).toBeInTheDocument();
    });

    it('does not render Admin Guide tab', () => {
      render(<HelpPage />);
      expect(screen.queryByRole('tab', { name: /admin guide/i })).not.toBeInTheDocument();
    });

    it('shows student guide content by default', () => {
      render(<HelpPage />);
      // Student guide panel should be visible with actual student guide content
      const panel = screen.getByRole('tabpanel');
      expect(panel).toBeInTheDocument();
      expect(panel).toHaveTextContent(/joining a section/i);
    });

    it('switches to instructor guide on tab click', async () => {
      const user = userEvent.setup();
      render(<HelpPage />);

      const instructorTab = screen.getByRole('tab', { name: /instructor guide/i });
      await user.click(instructorTab);

      expect(instructorTab).toHaveAttribute('aria-selected', 'true');
      // Verify instructor content is rendered in the visible panel
      const panel = screen.getByRole('tabpanel');
      expect(panel).toHaveTextContent(/creating classes and sections/i);
    });
  });

  describe('namespace-admin role', () => {
    beforeEach(() => {
      mockUser = { ...mockUser, role: 'namespace-admin' };
    });

    it('renders all three guide tabs', () => {
      render(<HelpPage />);
      expect(screen.getByRole('tab', { name: /student guide/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /instructor guide/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /admin guide/i })).toBeInTheDocument();
    });
  });

  describe('system-admin role', () => {
    beforeEach(() => {
      mockUser = { ...mockUser, role: 'system-admin' };
    });

    it('renders all three guide tabs', () => {
      render(<HelpPage />);
      expect(screen.getByRole('tab', { name: /student guide/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /instructor guide/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /admin guide/i })).toBeInTheDocument();
    });
  });
});

/**
 * Unit tests for Landing Page
 *
 * Tests:
 * - Authenticated users are redirected to their role-appropriate dashboard
 * - Unauthenticated users see join code input
 * - Join code formatting and validation
 * - Navigation to registration page
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from '../(public)/page';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

// Mock dependencies
jest.mock('@/contexts/AuthContext');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

describe('Landing Page', () => {
  const mockPush = jest.fn();
  const mockRouter = { push: mockPush };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
  });

  describe('Authenticated User Redirects', () => {
    it('redirects system-admin to /system', async () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: { id: '1', username: 'sysadmin', role: 'system-admin' },
        isLoading: false,
      });

      render(<Home />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/system');
      });
    });

    it('redirects namespace-admin to /admin', async () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: { id: '1', username: 'adam', role: 'namespace-admin' },
        isLoading: false,
      });

      render(<Home />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/admin');
      });
    });

    it('redirects instructor to /instructor', async () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: { id: '2', username: 'prof', role: 'instructor' },
        isLoading: false,
      });

      render(<Home />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/instructor');
      });
    });

    it('redirects student to /sections', async () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: { id: '3', username: 'student1', role: 'student' },
        isLoading: false,
      });

      render(<Home />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/sections');
      });
    });
  });

  describe('Unauthenticated User - Join Code UI', () => {
    beforeEach(() => {
      (useAuth as jest.Mock).mockReturnValue({
        user: null,
        isLoading: false,
      });
    });

    it('shows join code input for unauthenticated users', () => {
      render(<Home />);

      expect(screen.getByText('Code Classroom')).toBeInTheDocument();
      expect(screen.getByText('Enter your section code to get started')).toBeInTheDocument();
      expect(screen.getByLabelText('Section Join Code')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('ABC-123')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Join Section' })).toBeInTheDocument();
    });

    it('shows sign in link', () => {
      render(<Home />);

      expect(screen.getByText('Already have an account?')).toBeInTheDocument();
      const signInLink = screen.getByRole('link', { name: /sign in here/i });
      expect(signInLink).toHaveAttribute('href', '/auth/signin');
    });

    it('shows info box about email invitations', () => {
      render(<Home />);

      expect(screen.getByRole('note')).toBeInTheDocument();
      expect(screen.getByText('Invited as instructor or admin?')).toBeInTheDocument();
      expect(screen.getByText('Check your email for the invitation link.')).toBeInTheDocument();
    });

    it('does not redirect unauthenticated users', () => {
      render(<Home />);

      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe('Join Code Input Formatting', () => {
    beforeEach(() => {
      (useAuth as jest.Mock).mockReturnValue({
        user: null,
        isLoading: false,
      });
    });

    it('auto-formats code with dashes', async () => {
      const user = userEvent.setup();
      render(<Home />);

      const input = screen.getByPlaceholderText('ABC-123');
      await user.type(input, 'abc123xyz');

      expect(input).toHaveValue('ABC-123');
    });

    it('auto-uppercases input', async () => {
      const user = userEvent.setup();
      render(<Home />);

      const input = screen.getByPlaceholderText('ABC-123');
      await user.type(input, 'abc');

      expect(input).toHaveValue('ABC');
    });

    it('removes non-alphanumeric characters', async () => {
      const user = userEvent.setup();
      render(<Home />);

      const input = screen.getByPlaceholderText('ABC-123');
      await user.type(input, 'abc!@#123');

      expect(input).toHaveValue('ABC-123');
    });

    it('limits input to 6 characters (formatted as XXX-XXX)', async () => {
      const user = userEvent.setup();
      render(<Home />);

      const input = screen.getByPlaceholderText('ABC-123');
      await user.type(input, 'ABCDEFGHIJKLMNOP');

      expect(input).toHaveValue('ABC-DEF');
    });
  });

  describe('Join Code Validation', () => {
    beforeEach(() => {
      (useAuth as jest.Mock).mockReturnValue({
        user: null,
        isLoading: false,
      });
    });

    it('shows error for invalid code format', async () => {
      const user = userEvent.setup();
      render(<Home />);

      const input = screen.getByPlaceholderText('ABC-123');
      await user.type(input, 'ABC');

      const button = screen.getByRole('button', { name: 'Join Section' });
      await user.click(button);

      expect(screen.getByText('Please enter a valid join code (e.g., ABC-123)')).toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('clears error when typing', async () => {
      const user = userEvent.setup();
      render(<Home />);

      const input = screen.getByPlaceholderText('ABC-123');
      await user.type(input, 'ABC');

      const button = screen.getByRole('button', { name: 'Join Section' });
      await user.click(button);

      expect(screen.getByText('Please enter a valid join code (e.g., ABC-123)')).toBeInTheDocument();

      // Type more characters - error should clear
      await user.type(input, '123');

      expect(screen.queryByText('Please enter a valid join code (e.g., ABC-123)')).not.toBeInTheDocument();
    });

    it('navigates to registration with valid code', async () => {
      const user = userEvent.setup();
      render(<Home />);

      const input = screen.getByPlaceholderText('ABC-123');
      await user.type(input, 'ABC123');

      const button = screen.getByRole('button', { name: 'Join Section' });
      await user.click(button);

      expect(mockPush).toHaveBeenCalledWith('/register/student?code=ABC123');
    });

    it('navigates with code that has dashes', async () => {
      const user = userEvent.setup();
      render(<Home />);

      const input = screen.getByPlaceholderText('ABC-123');
      await user.type(input, 'DEF-456');

      const button = screen.getByRole('button', { name: 'Join Section' });
      await user.click(button);

      // Should strip dashes for URL
      expect(mockPush).toHaveBeenCalledWith('/register/student?code=DEF456');
    });

    it('disables button when input is empty', () => {
      render(<Home />);

      const button = screen.getByRole('button', { name: 'Join Section' });
      expect(button).toBeDisabled();
    });

    it('enables button when code is entered', async () => {
      const user = userEvent.setup();
      render(<Home />);

      const input = screen.getByPlaceholderText('ABC-123');
      await user.type(input, 'A');

      const button = screen.getByRole('button', { name: 'Join Section' });
      expect(button).not.toBeDisabled();
    });
  });

  describe('Loading State', () => {
    it('shows loading spinner while auth is loading', () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: null,
        isLoading: true,
      });

      render(<Home />);

      // Should not show the join code form or redirect
      expect(screen.queryByPlaceholderText('ABC-123')).not.toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('does not redirect while loading', () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: null,
        isLoading: true,
      });

      render(<Home />);

      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe('Form Submission', () => {
    beforeEach(() => {
      (useAuth as jest.Mock).mockReturnValue({
        user: null,
        isLoading: false,
      });
    });

    it('submits on Enter key press', async () => {
      const user = userEvent.setup();
      render(<Home />);

      const input = screen.getByPlaceholderText('ABC-123');
      await user.type(input, 'ABC123{enter}');

      expect(mockPush).toHaveBeenCalledWith('/register/student?code=ABC123');
    });

    it('shows loading state after submission', async () => {
      const user = userEvent.setup();
      render(<Home />);

      const input = screen.getByPlaceholderText('ABC-123');
      await user.type(input, 'ABC123');

      const button = screen.getByRole('button', { name: 'Join Section' });
      await user.click(button);

      // Button should show loading text
      expect(screen.getByRole('button', { name: 'Joining...' })).toBeInTheDocument();
    });
  });
});

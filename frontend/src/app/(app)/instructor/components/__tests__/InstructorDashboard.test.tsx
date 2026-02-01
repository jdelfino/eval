/**
 * Tests for InstructorDashboard component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InstructorDashboard } from '../InstructorDashboard';

// Mock the dependencies
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      role: 'instructor',
      email: 'instructor@test.com',
      namespaceId: 'namespace-1',
    },
  }),
}));

jest.mock('@/server/auth/permissions', () => ({
  hasRolePermission: (role: string, permission: string) => {
    // Instructors can create classes and sessions
    if (role === 'instructor') {
      return ['class.create', 'session.create', 'class.read'].includes(permission);
    }
    return false;
  },
}));

jest.mock('@/lib/api-utils', () => ({
  fetchWithRetry: jest.fn(),
}));

jest.mock('../CreateClassModal', () => {
  return function MockCreateClassModal({ onClose, onSuccess }: any) {
    return (
      <div data-testid="create-class-modal">
        <button onClick={onClose} data-testid="close-modal">Close</button>
        <button onClick={onSuccess} data-testid="create-success">Create</button>
      </div>
    );
  };
});

const mockFetchWithRetry = require('@/lib/api-utils').fetchWithRetry as jest.Mock;

describe('InstructorDashboard', () => {
  const defaultProps = {
    onStartSession: jest.fn(),
    onRejoinSession: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loading state', () => {
    it('shows loading spinner while fetching data', async () => {
      mockFetchWithRetry.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { container } = render(<InstructorDashboard {...defaultProps} />);

      // Check for the spinner element with animate-spin class
      expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows empty state when no classes exist', async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: true,
        json: async () => ({ classes: [] }),
      });

      render(<InstructorDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Welcome to the Instructor Dashboard')).toBeInTheDocument();
      });

      expect(screen.getByTestId('create-first-class-btn')).toBeInTheDocument();
    });
  });

  describe('dashboard table', () => {
    const mockClasses = [
      {
        id: 'class-1',
        name: 'CS 101',
        description: 'Introduction to Programming',
        sections: [
          {
            id: 'section-1',
            name: 'Section A',
            semester: 'Fall 2025',
            joinCode: 'ABC-123',
            studentCount: 25,
            activeSessionId: null,
          },
          {
            id: 'section-2',
            name: 'Section B',
            semester: 'Fall 2025',
            joinCode: 'DEF-456',
            studentCount: 30,
            activeSessionId: 'session-1',
            activeSessionJoinCode: 'XYZ-789',
          },
        ],
      },
      {
        id: 'class-2',
        name: 'CS 201',
        description: 'Data Structures',
        sections: [],
      },
    ];

    beforeEach(() => {
      mockFetchWithRetry.mockResolvedValue({
        ok: true,
        json: async () => ({ classes: mockClasses }),
      });
    });

    it('renders class and section data in table', async () => {
      render(<InstructorDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('CS 101')).toBeInTheDocument();
      });

      expect(screen.getByText('Section A')).toBeInTheDocument();
      expect(screen.getByText('Section B')).toBeInTheDocument();
      expect(screen.getByText('CS 201')).toBeInTheDocument();
      expect(screen.getByText('No sections yet')).toBeInTheDocument();
    });

    it('shows Start Session button for sections without active session', async () => {
      render(<InstructorDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('start-session-section-1')).toBeInTheDocument();
      });

      expect(screen.getByTestId('start-session-section-1')).toHaveTextContent('Start Session');
    });

    it('shows Rejoin Session button for sections with active session', async () => {
      render(<InstructorDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('rejoin-session-section-2')).toBeInTheDocument();
      });

      expect(screen.getByTestId('rejoin-session-section-2')).toHaveTextContent('Rejoin Session');
    });

    it('calls onStartSession when Start Session is clicked', async () => {
      render(<InstructorDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('start-session-section-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('start-session-section-1'));

      expect(defaultProps.onStartSession).toHaveBeenCalledWith('section-1', 'Section A');
    });

    it('calls onRejoinSession when Rejoin Session is clicked', async () => {
      render(<InstructorDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('rejoin-session-section-2')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('rejoin-session-section-2'));

      expect(defaultProps.onRejoinSession).toHaveBeenCalledWith('session-1');
    });

    it('shows active status badge for sections with active session', async () => {
      render(<InstructorDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Active')).toBeInTheDocument();
      });

      // Should have both Active and Idle badges
      expect(screen.getAllByText('Idle').length).toBeGreaterThan(0);
    });

    it('highlights rows with active sessions', async () => {
      render(<InstructorDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('section-row-section-2')).toHaveClass('bg-green-50');
      });
    });

    it('shows clickable section name linking to section detail page', async () => {
      render(<InstructorDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('section-link-section-1')).toBeInTheDocument();
      });

      expect(screen.getByTestId('section-link-section-1')).toHaveAttribute('href', '/sections/section-1');
      expect(screen.getByTestId('section-link-section-1')).toHaveTextContent('Section A');

      expect(screen.getByTestId('section-link-section-2')).toHaveAttribute('href', '/sections/section-2');
      expect(screen.getByTestId('section-link-section-2')).toHaveTextContent('Section B');
    });

    it('shows clickable class name linking to class page', async () => {
      render(<InstructorDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('class-link-class-1')).toBeInTheDocument();
      });

      expect(screen.getByTestId('class-link-class-1')).toHaveAttribute('href', '/classes/class-1');
    });
  });

  describe('create class modal', () => {
    beforeEach(() => {
      mockFetchWithRetry.mockResolvedValue({
        ok: true,
        json: async () => ({ classes: [] }),
      });
    });

    it('opens create class modal when button is clicked', async () => {
      render(<InstructorDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('create-first-class-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('create-first-class-btn'));

      expect(screen.getByTestId('create-class-modal')).toBeInTheDocument();
    });

    it('closes modal and reloads data on success', async () => {
      render(<InstructorDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('create-first-class-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('create-first-class-btn'));
      expect(screen.getByTestId('create-class-modal')).toBeInTheDocument();

      // Simulate successful creation
      fireEvent.click(screen.getByTestId('create-success'));

      // Modal should be closed
      await waitFor(() => {
        expect(screen.queryByTestId('create-class-modal')).not.toBeInTheDocument();
      });

      // Data should be reloaded (fetch called twice)
      expect(mockFetchWithRetry).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('shows error state when fetch fails', async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Server error' }),
      });

      render(<InstructorDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Error loading dashboard')).toBeInTheDocument();
      });
    });

    it('allows retry after error', async () => {
      mockFetchWithRetry
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: 'Server error' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ classes: [] }),
        });

      render(<InstructorDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Error loading dashboard')).toBeInTheDocument();
      });

      // Click retry button
      const retryButton = screen.getByRole('button', { name: /try again/i });
      fireEvent.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText('Welcome to the Instructor Dashboard')).toBeInTheDocument();
      });
    });
  });
});

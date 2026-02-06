import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { InstructorDashboard } from '../InstructorDashboard';

// Mock the API module
jest.mock('@/lib/api/instructor', () => ({
  getInstructorDashboard: jest.fn(),
}));

// Mock the auth context
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'test-user', name: 'Test User', role: 'instructor', email: 'test@example.com' },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

// Mock the permissions module
jest.mock('@/lib/permissions', () => ({
  hasRolePermission: jest.fn(() => true),
}));

// Mock the join-code module
jest.mock('@/lib/join-code', () => ({
  formatJoinCodeForDisplay: (code: string) => code,
}));

import { getInstructorDashboard } from '@/lib/api/instructor';

const mockGetInstructorDashboard = getInstructorDashboard as jest.MockedFunction<typeof getInstructorDashboard>;

describe('InstructorDashboard', () => {
  const mockOnStartSession = jest.fn();
  const mockOnRejoinSession = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading state initially', () => {
    mockGetInstructorDashboard.mockReturnValue(new Promise(() => {})); // Never resolves
    render(
      <InstructorDashboard
        onStartSession={mockOnStartSession}
        onRejoinSession={mockOnRejoinSession}
      />
    );
    expect(document.querySelector('.animate-spin')).toBeTruthy();
  });

  it('shows empty state when no classes', async () => {
    mockGetInstructorDashboard.mockResolvedValue({
      classes: [],
    });
    render(
      <InstructorDashboard
        onStartSession={mockOnStartSession}
        onRejoinSession={mockOnRejoinSession}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('Welcome to the Instructor Dashboard')).toBeInTheDocument();
    });
  });

  it('renders classes with sections', async () => {
    mockGetInstructorDashboard.mockResolvedValue({
      classes: [
        {
          id: 'class-1',
          name: 'CS 101',
          sections: [
            { id: 'sec-1', name: 'Section A', join_code: 'ABC123', semester: 'Fall 2025', studentCount: 25 },
          ],
        },
      ],
    });
    render(
      <InstructorDashboard
        onStartSession={mockOnStartSession}
        onRejoinSession={mockOnRejoinSession}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('CS 101')).toBeInTheDocument();
      expect(screen.getByText('Section A')).toBeInTheDocument();
      expect(screen.getByText('Fall 2025')).toBeInTheDocument();
    });
  });

  it('shows error state on fetch failure', async () => {
    mockGetInstructorDashboard.mockRejectedValue(new Error('Network error'));
    render(
      <InstructorDashboard
        onStartSession={mockOnStartSession}
        onRejoinSession={mockOnRejoinSession}
      />
    );
    await waitFor(() => {
      expect(screen.getByText(/Error loading dashboard/i)).toBeInTheDocument();
    });
  });
});

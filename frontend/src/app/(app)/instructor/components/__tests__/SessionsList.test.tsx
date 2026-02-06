/**
 * Unit tests for SessionsList component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SessionsList from '../SessionsList';
import * as sessionsApi from '@/lib/api/sessions';

// Mock useRouter
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock the sessions API module
jest.mock('@/lib/api/sessions', () => ({
  listSessionHistoryWithFilters: jest.fn(),
}));

describe('SessionsList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (sessionsApi.listSessionHistoryWithFilters as jest.Mock).mockResolvedValue([]);
  });

  describe('Loading state', () => {
    it('should show loading state initially', () => {
      // Use a promise that never resolves to keep loading state
      (sessionsApi.listSessionHistoryWithFilters as jest.Mock).mockReturnValue(new Promise(() => {}));

      render(<SessionsList />);

      expect(screen.getByText('Loading sessions...')).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('should show empty state when no sessions exist', async () => {
      (sessionsApi.listSessionHistoryWithFilters as jest.Mock).mockResolvedValue([]);

      render(<SessionsList />);

      await waitFor(() => {
        expect(screen.getByText('No sessions found')).toBeInTheDocument();
      });

      expect(screen.getByText('Create your first session to get started')).toBeInTheDocument();
    });

    it('should show filter hint in empty state when filters are active', async () => {
      (sessionsApi.listSessionHistoryWithFilters as jest.Mock).mockResolvedValue([]);

      render(<SessionsList />);

      await waitFor(() => {
        expect(screen.getByText('No sessions found')).toBeInTheDocument();
      });

      // Change filter to active only
      const filterSelect = screen.getByRole('combobox');
      fireEvent.change(filterSelect, { target: { value: 'active' } });

      await waitFor(() => {
        expect(screen.getByText('Try adjusting your filters')).toBeInTheDocument();
      });
    });

    it('should show filter hint when search query is present', async () => {
      (sessionsApi.listSessionHistoryWithFilters as jest.Mock).mockResolvedValue([]);

      render(<SessionsList />);

      await waitFor(() => {
        expect(screen.getByText('No sessions found')).toBeInTheDocument();
      });

      // Enter search query
      const searchInput = screen.getByPlaceholderText('Search by section...');
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

      await waitFor(() => {
        expect(screen.getByText('Try adjusting your filters')).toBeInTheDocument();
      });
    });
  });

  describe('Error state', () => {
    it('should show error state when fetch fails', async () => {
      (sessionsApi.listSessionHistoryWithFilters as jest.Mock).mockRejectedValue(
        new Error('Failed to load sessions')
      );

      render(<SessionsList />);

      await waitFor(() => {
        expect(screen.getByText('Error loading sessions')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('should retry fetch when Retry button is clicked', async () => {
      (sessionsApi.listSessionHistoryWithFilters as jest.Mock)
        .mockRejectedValueOnce(new Error('Failed to load sessions'))
        .mockResolvedValueOnce([]);

      render(<SessionsList />);

      await waitFor(() => {
        expect(screen.getByText('Error loading sessions')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

      await waitFor(() => {
        expect(screen.getByText('No sessions found')).toBeInTheDocument();
      });

      expect(sessionsApi.listSessionHistoryWithFilters).toHaveBeenCalledTimes(2);
    });
  });

  describe('Sessions list display', () => {
    const mockSessions = [
      {
        id: 'session-1',
        namespace_id: 'namespace-1',
        section_id: 'section-1',
        section_name: 'Section A',
        problem: null,
        featured_student_id: null,
        featured_code: null,
        creator_id: 'instructor-1',
        participants: ['student-1', 'student-2', 'student-3', 'student-4', 'student-5'],
        status: 'active' as const,
        created_at: new Date().toISOString(),
        last_activity: new Date().toISOString(),
        ended_at: null,
      },
      {
        id: 'session-2',
        namespace_id: 'namespace-1',
        section_id: 'section-1',
        section_name: 'Section A',
        problem: null,
        featured_student_id: null,
        featured_code: null,
        creator_id: 'instructor-1',
        participants: ['student-1', 'student-2', 'student-3', 'student-4', 'student-5', 'student-6', 'student-7', 'student-8', 'student-9', 'student-10'],
        status: 'completed' as const,
        created_at: new Date(Date.now() - 3600000).toISOString(),
        last_activity: new Date(Date.now() - 3600000).toISOString(),
        ended_at: new Date().toISOString(),
      },
    ];

    it('should display active sessions in Active Now section', async () => {
      (sessionsApi.listSessionHistoryWithFilters as jest.Mock).mockResolvedValue(mockSessions);

      render(<SessionsList />);

      await waitFor(() => {
        expect(screen.getByText('Active Now (1)')).toBeInTheDocument();
      });

      // Both sessions have section_name 'Section A', so use getAllByText
      expect(screen.getAllByText('Section A').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByRole('button', { name: 'Rejoin' })).toBeInTheDocument();
    });

    it('should display completed sessions in Past Sessions section', async () => {
      (sessionsApi.listSessionHistoryWithFilters as jest.Mock).mockResolvedValue(mockSessions);

      render(<SessionsList />);

      await waitFor(() => {
        expect(screen.getByText('Past Sessions (1)')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: 'View Details' })).toBeInTheDocument();
    });

    it('should show session count summary', async () => {
      (sessionsApi.listSessionHistoryWithFilters as jest.Mock).mockResolvedValue(mockSessions);

      render(<SessionsList />);

      await waitFor(() => {
        expect(screen.getByText(/2 total/)).toBeInTheDocument();
        expect(screen.getByText(/1 active/)).toBeInTheDocument();
        expect(screen.getByText(/1 completed/)).toBeInTheDocument();
      });
    });
  });
});

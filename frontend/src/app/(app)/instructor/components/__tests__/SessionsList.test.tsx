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
        join_code: 'ABC123',
        problem_title: 'Hello World',
        created_at: new Date().toISOString(),
        last_activity: new Date().toISOString(),
        creator_id: 'instructor-1',
        participant_count: 5,
        status: 'active' as const,
        section_id: 'section-1',
        section_name: 'Section A',
      },
      {
        id: 'session-2',
        join_code: 'XYZ789',
        problem_title: 'Two Sum',
        created_at: new Date(Date.now() - 3600000).toISOString(),
        last_activity: new Date(Date.now() - 3600000).toISOString(),
        creator_id: 'instructor-1',
        participant_count: 10,
        status: 'completed' as const,
        ended_at: new Date().toISOString(),
        section_id: 'section-1',
        section_name: 'Section A',
      },
    ];

    it('should display active sessions in Active Now section', async () => {
      (sessionsApi.listSessionHistoryWithFilters as jest.Mock).mockResolvedValue(mockSessions);

      render(<SessionsList />);

      await waitFor(() => {
        expect(screen.getByText('Active Now (1)')).toBeInTheDocument();
      });

      expect(screen.getByText('ABC123')).toBeInTheDocument();
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

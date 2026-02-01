/**
 * Unit tests for SessionsList component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SessionsList from '../SessionsList';

// Mock useRouter
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('SessionsList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: [] }),
    });
  });

  describe('Loading state', () => {
    it('should show loading state initially', () => {
      // Use a promise that never resolves to keep loading state
      mockFetch.mockReturnValue(new Promise(() => {}));

      render(<SessionsList />);

      expect(screen.getByText('Loading sessions...')).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('should show empty state when no sessions exist', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ sessions: [] }),
      });

      render(<SessionsList />);

      await waitFor(() => {
        expect(screen.getByText('No sessions found')).toBeInTheDocument();
      });

      expect(screen.getByText('Create your first session to get started')).toBeInTheDocument();
    });

    it('should show filter hint in empty state when filters are active', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ sessions: [] }),
      });

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
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ sessions: [] }),
      });

      render(<SessionsList />);

      await waitFor(() => {
        expect(screen.getByText('No sessions found')).toBeInTheDocument();
      });

      // Enter search query
      const searchInput = screen.getByPlaceholderText('Search by section or code...');
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

      await waitFor(() => {
        expect(screen.getByText('Try adjusting your filters')).toBeInTheDocument();
      });
    });
  });

  describe('Error state', () => {
    it('should show error state when fetch fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
      });

      render(<SessionsList />);

      await waitFor(() => {
        expect(screen.getByText('Error loading sessions')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('should retry fetch when Retry button is clicked', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ sessions: [] }),
        });

      render(<SessionsList />);

      await waitFor(() => {
        expect(screen.getByText('Error loading sessions')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

      await waitFor(() => {
        expect(screen.getByText('No sessions found')).toBeInTheDocument();
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Sessions list display', () => {
    const mockSessions = [
      {
        id: 'session-1',
        joinCode: 'ABC123',
        problemTitle: 'Hello World',
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        creatorId: 'instructor-1',
        participantCount: 5,
        status: 'active' as const,
        sectionId: 'section-1',
        sectionName: 'Section A',
      },
      {
        id: 'session-2',
        joinCode: 'XYZ789',
        problemTitle: 'Two Sum',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        lastActivity: new Date(Date.now() - 3600000).toISOString(),
        creatorId: 'instructor-1',
        participantCount: 10,
        status: 'completed' as const,
        endedAt: new Date().toISOString(),
        sectionId: 'section-1',
        sectionName: 'Section A',
      },
    ];

    it('should display active sessions in Active Now section', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ sessions: mockSessions }),
      });

      render(<SessionsList />);

      await waitFor(() => {
        expect(screen.getByText('Active Now (1)')).toBeInTheDocument();
      });

      expect(screen.getByText('ABC123')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Rejoin' })).toBeInTheDocument();
    });

    it('should display completed sessions in Past Sessions section', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ sessions: mockSessions }),
      });

      render(<SessionsList />);

      await waitFor(() => {
        expect(screen.getByText('Past Sessions (1)')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: 'View Details' })).toBeInTheDocument();
    });

    it('should show session count summary', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ sessions: mockSessions }),
      });

      render(<SessionsList />);

      await waitFor(() => {
        expect(screen.getByText(/2 total/)).toBeInTheDocument();
        expect(screen.getByText(/1 active/)).toBeInTheDocument();
        expect(screen.getByText(/1 completed/)).toBeInTheDocument();
      });
    });
  });
});

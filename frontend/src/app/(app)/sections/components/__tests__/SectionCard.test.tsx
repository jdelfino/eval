/**
 * Unit tests for SectionCard component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import SectionCard from '../SectionCard';
import { ACTIVE_SESSION_POLL_INTERVAL_MS } from '../SectionCard';
import type { MySectionInfo } from '@/types/api';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

describe('SectionCard', () => {
  const mockGetActiveSessions = jest.fn();

  const defaultSectionInfo: MySectionInfo = {
    section: {
      id: 'section-1',
      namespace_id: 'ns-1',
      class_id: 'class-1',
      name: 'Section A',
      semester: 'Fall 2026',
      join_code: 'ABC123',
      active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    class_name: 'CS 101',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetActiveSessions.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should poll for active sessions at the configured interval', async () => {
    render(
      <SectionCard
        sectionInfo={defaultSectionInfo}
        getActiveSessions={mockGetActiveSessions}
      />
    );

    // Initial call
    await waitFor(() => {
      expect(mockGetActiveSessions).toHaveBeenCalledTimes(1);
    });

    // Advance by the polling interval
    await act(async () => {
      jest.advanceTimersByTime(ACTIVE_SESSION_POLL_INTERVAL_MS);
    });

    expect(mockGetActiveSessions).toHaveBeenCalledTimes(2);

    // Advance again
    await act(async () => {
      jest.advanceTimersByTime(ACTIVE_SESSION_POLL_INTERVAL_MS);
    });

    expect(mockGetActiveSessions).toHaveBeenCalledTimes(3);
  });

  it('should use a polling interval of 10 seconds or less', () => {
    expect(ACTIVE_SESSION_POLL_INTERVAL_MS).toBeLessThanOrEqual(10000);
  });

  it('should render section info', async () => {
    render(
      <SectionCard
        sectionInfo={defaultSectionInfo}
        getActiveSessions={mockGetActiveSessions}
      />
    );

    expect(screen.getByText('Section A')).toBeInTheDocument();
    expect(screen.getByText('CS 101')).toBeInTheDocument();
  });

  it('should display active sessions when available', async () => {
    mockGetActiveSessions.mockResolvedValue([
      {
        id: 'session-1',
        section_id: 'section-1',
        status: 'active',
        problem: { title: 'Two Sum' },
        students: new Map([['s1', {}]]),
      },
    ]);

    render(
      <SectionCard
        sectionInfo={defaultSectionInfo}
        getActiveSessions={mockGetActiveSessions}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('1 Active Session')).toBeInTheDocument();
    });

    expect(screen.getByText('Two Sum')).toBeInTheDocument();
  });
});

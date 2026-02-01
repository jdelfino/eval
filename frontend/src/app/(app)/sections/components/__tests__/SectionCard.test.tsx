/**
 * Unit tests for SectionCard component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import SectionCard from '../SectionCard';
import { ACTIVE_SESSION_POLL_INTERVAL_MS } from '../SectionCard';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

describe('SectionCard', () => {
  const mockGetActiveSessions = jest.fn();

  const defaultSection = {
    id: 'section-1',
    classId: 'class-1',
    name: 'Section A',
    semester: 'Fall 2026',
    className: 'CS 101',
    classDescription: 'Intro to CS',
    role: 'student' as const,
    joinCode: 'ABC123',
    createdAt: '2026-01-01T00:00:00Z',
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
        section={defaultSection}
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
        section={defaultSection}
        getActiveSessions={mockGetActiveSessions}
      />
    );

    expect(screen.getByText('Section A')).toBeInTheDocument();
    expect(screen.getByText('CS 101')).toBeInTheDocument();
    expect(screen.getByText('Enrolled as student')).toBeInTheDocument();
  });

  it('should display active sessions when available', async () => {
    mockGetActiveSessions.mockResolvedValue([
      {
        id: 'session-1',
        sectionId: 'section-1',
        status: 'active',
        problem: { title: 'Two Sum' },
        students: new Map([['s1', {}]]),
      },
    ]);

    render(
      <SectionCard
        section={defaultSection}
        getActiveSessions={mockGetActiveSessions}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('1 Active Session')).toBeInTheDocument();
    });

    expect(screen.getByText('Two Sum')).toBeInTheDocument();
  });
});

/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InstructorActions from '../InstructorActions';

// Enable React act() environment
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', role: 'instructor' },
    isLoading: false,
  }),
}));

jest.mock('@/app/(app)/instructor/components/CreateSessionFromProblemModal', () => {
  return function MockModal() {
    return <div data-testid="create-session-modal">Modal</div>;
  };
});

const mockSetLastUsedSection = jest.fn();
let mockLastUsedSection: { sectionId: string; classId: string } | null = null;

jest.mock('@/lib/last-used-section', () => ({
  getLastUsedSection: () => mockLastUsedSection,
  setLastUsedSection: (...args: unknown[]) => mockSetLastUsedSection(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockLastUsedSection = null;
  global.fetch = jest.fn();
  (globalThis as Record<string, unknown>).BroadcastChannel = jest.fn().mockImplementation(() => ({
    postMessage: jest.fn(),
    close: jest.fn(),
  }));
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('InstructorActions auto-start', () => {
  it('auto-starts session without modal when only 1 section exists', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sections: [{ id: 'sec-1', name: 'Section A', joinCode: 'ABC' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          session: { id: 'session-1', joinCode: 'JOIN123' },
        }),
      });

    render(<InstructorActions problemId="prob-1" problemTitle="Test Problem" classId="class-1" className="CS 101" />);

    await userEvent.click(screen.getByText('Start Session'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/public-view?sessionId=session-1');
    });

    expect(screen.queryByTestId('create-session-modal')).not.toBeInTheDocument();
    expect(mockSetLastUsedSection).toHaveBeenCalledWith('sec-1', 'class-1');
  });

  it('auto-starts session when last-used section matches classId', async () => {
    mockLastUsedSection = { sectionId: 'sec-2', classId: 'class-1' };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sections: [
            { id: 'sec-1', name: 'Section A', joinCode: 'ABC' },
            { id: 'sec-2', name: 'Section B', joinCode: 'DEF' },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          session: { id: 'session-2', joinCode: 'JOIN456' },
        }),
      });

    render(<InstructorActions problemId="prob-1" problemTitle="Test Problem" classId="class-1" className="CS 101" />);

    await userEvent.click(screen.getByText('Start Session'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/public-view?sessionId=session-2');
    });

    expect(screen.queryByTestId('create-session-modal')).not.toBeInTheDocument();
    expect(mockSetLastUsedSection).toHaveBeenCalledWith('sec-2', 'class-1');
  });

  it('opens modal when multiple sections and no last-used match', async () => {
    mockLastUsedSection = null;

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sections: [
          { id: 'sec-1', name: 'Section A', joinCode: 'ABC' },
          { id: 'sec-2', name: 'Section B', joinCode: 'DEF' },
        ],
      }),
    });

    render(<InstructorActions problemId="prob-1" problemTitle="Test Problem" classId="class-1" className="CS 101" />);

    await userEvent.click(screen.getByText('Start Session'));

    await waitFor(() => {
      expect(screen.getByTestId('create-session-modal')).toBeInTheDocument();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('opens modal when last-used section is for a different class', async () => {
    mockLastUsedSection = { sectionId: 'sec-99', classId: 'other-class' };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sections: [
          { id: 'sec-1', name: 'Section A', joinCode: 'ABC' },
          { id: 'sec-2', name: 'Section B', joinCode: 'DEF' },
        ],
      }),
    });

    render(<InstructorActions problemId="prob-1" problemTitle="Test Problem" classId="class-1" className="CS 101" />);

    await userEvent.click(screen.getByText('Start Session'));

    await waitFor(() => {
      expect(screen.getByTestId('create-session-modal')).toBeInTheDocument();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });
});

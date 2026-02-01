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
    user: { ID: 'user-1', Role: 'instructor' },
    isLoading: false,
  }),
}));

jest.mock('@/app/(app)/instructor/components/CreateSessionFromProblemModal', () => {
  return function MockModal() {
    return <div data-testid="create-session-modal">Modal</div>;
  };
});

const mockSetLastUsedSection = jest.fn();
let mockLastUsedSection: { section_id: string; class_id: string } | null = null;

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
          sections: [{ id: 'sec-1', name: 'Section A', join_code: 'ABC' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          session: { id: 'session-1', join_code: 'JOIN123' },
        }),
      });

    render(<InstructorActions problem_id="prob-1" problem_title="Test Problem" class_id="class-1" className="CS 101" />);

    await userEvent.click(screen.getByText('Start Session'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/public-view?session_id=session-1');
    });

    expect(screen.queryByTestId('create-session-modal')).not.toBeInTheDocument();
    expect(mockSetLastUsedSection).toHaveBeenCalledWith('sec-1', 'class-1');
  });

  it('auto-starts session when last-used section matches class_id', async () => {
    mockLastUsedSection = { section_id: 'sec-2', class_id: 'class-1' };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sections: [
            { id: 'sec-1', name: 'Section A', join_code: 'ABC' },
            { id: 'sec-2', name: 'Section B', join_code: 'DEF' },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          session: { id: 'session-2', join_code: 'JOIN456' },
        }),
      });

    render(<InstructorActions problem_id="prob-1" problem_title="Test Problem" class_id="class-1" className="CS 101" />);

    await userEvent.click(screen.getByText('Start Session'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/public-view?session_id=session-2');
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
          { id: 'sec-1', name: 'Section A', join_code: 'ABC' },
          { id: 'sec-2', name: 'Section B', join_code: 'DEF' },
        ],
      }),
    });

    render(<InstructorActions problem_id="prob-1" problem_title="Test Problem" class_id="class-1" className="CS 101" />);

    await userEvent.click(screen.getByText('Start Session'));

    await waitFor(() => {
      expect(screen.getByTestId('create-session-modal')).toBeInTheDocument();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('opens modal when last-used section is for a different class', async () => {
    mockLastUsedSection = { section_id: 'sec-99', class_id: 'other-class' };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sections: [
          { id: 'sec-1', name: 'Section A', join_code: 'ABC' },
          { id: 'sec-2', name: 'Section B', join_code: 'DEF' },
        ],
      }),
    });

    render(<InstructorActions problem_id="prob-1" problem_title="Test Problem" class_id="class-1" className="CS 101" />);

    await userEvent.click(screen.getByText('Start Session'));

    await waitFor(() => {
      expect(screen.getByTestId('create-session-modal')).toBeInTheDocument();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });
});

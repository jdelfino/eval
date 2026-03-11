/**
 * @jest-environment jsdom
 *
 * Tests for the trampoline behavior of InstructorActions when auto-started
 * via URL params (?start=true&section_id=X).
 *
 * After creating the session, the page should show "Close this tab" UI
 * instead of navigating to /public-view?session_id=Y. The projector tab
 * at /public-view?section_id=X will auto-follow the new session via the
 * section channel.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import InstructorActions from '../InstructorActions';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: jest.fn(() => new URLSearchParams('start=true&section_id=section-1')),
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
jest.mock('@/lib/last-used-section', () => ({
  getLastUsedSection: () => null,
  setLastUsedSection: (...args: unknown[]) => mockSetLastUsedSection(...args),
}));

const mockCreateSession = jest.fn();
jest.mock('@/lib/api/sessions', () => ({
  createSession: (...args: unknown[]) => mockCreateSession(...args),
}));

jest.mock('@/lib/api/sections', () => ({
  getClassSections: jest.fn(),
}));

const mockPostMessage = jest.fn();
const mockClose = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (globalThis as Record<string, unknown>).BroadcastChannel = jest.fn().mockImplementation(() => ({
    postMessage: mockPostMessage,
    close: mockClose,
  }));
});

describe('InstructorActions — trampoline (auto-start)', () => {
  it('shows close-this-tab UI after session creation instead of navigating to session-specific URL', async () => {
    mockCreateSession.mockResolvedValueOnce({ id: 'session-123' });

    render(
      <InstructorActions
        problem_id="prob-1"
        problem_title="Test Problem"
        class_id="class-1"
        className="CS 101"
      />
    );

    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalledWith('section-1', 'prob-1');
    });

    // Should NOT navigate to /public-view?session_id=session-123
    expect(mockPush).not.toHaveBeenCalled();

    // Should show "close this tab" message
    await waitFor(() => {
      expect(screen.getByText(/close this tab/i)).toBeInTheDocument();
    });
  });

  it('still posts BroadcastChannel message after session creation', async () => {
    mockCreateSession.mockResolvedValueOnce({ id: 'session-456' });

    render(
      <InstructorActions
        problem_id="prob-1"
        problem_title="My Problem"
        class_id="class-1"
        className="CS 101"
      />
    );

    await waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledWith({
        session_id: 'session-456',
        problem_title: 'My Problem',
      });
    });
  });

  it('still saves last-used section after session creation', async () => {
    mockCreateSession.mockResolvedValueOnce({ id: 'session-789' });

    render(
      <InstructorActions
        problem_id="prob-1"
        problem_title="My Problem"
        class_id="class-1"
        className="CS 101"
      />
    );

    await waitFor(() => {
      expect(mockSetLastUsedSection).toHaveBeenCalledWith('section-1', 'class-1');
    });
  });
});

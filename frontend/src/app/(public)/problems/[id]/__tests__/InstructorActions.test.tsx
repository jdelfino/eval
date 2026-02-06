/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import InstructorActions from '../InstructorActions';

// Mock useAuth
const mockUser = { id: 'user-1', role: 'instructor', email: 'test@test.com' };
let authValue: { user: typeof mockUser | null; isLoading: boolean } = { user: mockUser, isLoading: false };
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authValue,
}));

// Mock useRouter and useSearchParams
const mockPush = jest.fn();
let mockSearchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

// Mock last-used-section
const mockSetLastUsedSection = jest.fn();
jest.mock('@/lib/last-used-section', () => ({
  getLastUsedSection: () => null,
  setLastUsedSection: (...args: unknown[]) => mockSetLastUsedSection(...args),
}));

// Mock BroadcastChannel
const mockPostMessage = jest.fn();
const mockClose = jest.fn();
(global as Record<string, unknown>).BroadcastChannel = jest.fn().mockImplementation(() => ({
  postMessage: mockPostMessage,
  close: mockClose,
}));

// Mock API modules
const mockCreateSession = jest.fn();
const mockGetClassSections = jest.fn();
jest.mock('@/lib/api/sessions', () => ({
  createSession: (...args: unknown[]) => mockCreateSession(...args),
}));
jest.mock('@/lib/api/sections', () => ({
  getClassSections: (...args: unknown[]) => mockGetClassSections(...args),
}));

// Mock CreateSessionFromProblemModal
jest.mock('@/app/(app)/instructor/components/CreateSessionFromProblemModal', () => {
  return function MockModal() { return <div data-testid="mock-modal" />; };
});

const defaultProps = {
  problem_id: 'prob-1',
  problem_title: 'Test Problem',
  class_id: 'class-1',
  className: 'Test Class',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParams = new URLSearchParams();
  authValue = { user: mockUser, isLoading: false };
  mockCreateSession.mockReset();
  mockGetClassSections.mockReset();
});

describe('InstructorActions auto-start from query params', () => {
  it('auto-creates session when start=true and section_id present', async () => {
    mockSearchParams = new URLSearchParams('start=true&section_id=section-1');
    mockCreateSession.mockResolvedValueOnce({ id: 'session-123' });

    render(<InstructorActions {...defaultProps} />);

    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalledWith('section-1', 'prob-1');
    });

    await waitFor(() => {
      expect(mockSetLastUsedSection).toHaveBeenCalledWith('section-1', 'class-1');
      expect(mockPush).toHaveBeenCalledWith('/public-view?session_id=session-123');
      expect(mockPostMessage).toHaveBeenCalledWith({
        session_id: 'session-123',
        problem_title: 'Test Problem',
      });
    });
  });

  it('does not auto-start when start param is missing', async () => {
    mockSearchParams = new URLSearchParams('section_id=section-1');

    render(<InstructorActions {...defaultProps} />);

    await new Promise(r => setTimeout(r, 50));
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('does not auto-start when section_id param is missing', async () => {
    mockSearchParams = new URLSearchParams('start=true');

    render(<InstructorActions {...defaultProps} />);

    await new Promise(r => setTimeout(r, 50));
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('shows error message on API failure', async () => {
    mockSearchParams = new URLSearchParams('start=true&section_id=bad-section');
    mockCreateSession.mockRejectedValueOnce(new Error('Failed to create session'));

    render(<InstructorActions {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to create session/)).toBeInTheDocument();
    });
  });

  it('does not auto-start for non-instructors', async () => {
    authValue = { user: null, isLoading: false };
    mockSearchParams = new URLSearchParams('start=true&section_id=section-1');

    const { container } = render(<InstructorActions {...defaultProps} />);

    await new Promise(r => setTimeout(r, 50));
    expect(container.innerHTML).toBe('');
    expect(mockCreateSession).not.toHaveBeenCalled();
  });
});

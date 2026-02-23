/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import StudentActions from '../StudentActions';

const mockUser = { id: 'user-1', role: 'student', email: 'test@test.com' };
let authValue: { user: typeof mockUser | null; isLoading: boolean } = { user: mockUser, isLoading: false };
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authValue,
}));

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockListMySections = jest.fn();
jest.mock('@/lib/api/sections', () => ({
  listMySections: (...args: unknown[]) => mockListMySections(...args),
}));

const mockStartPractice = jest.fn();
jest.mock('@/lib/api/problems', () => ({
  startPractice: (...args: unknown[]) => mockStartPractice(...args),
}));

const defaultProps = {
  problem_id: 'prob-1',
  class_id: 'class-1',
};

const makeSectionInfo = (id: string, name: string, classId: string) => ({
  section: { id, name, class_id: classId },
  class_name: 'Test Class',
});

beforeEach(() => {
  jest.clearAllMocks();
  authValue = { user: mockUser, isLoading: false };
  mockListMySections.mockReset();
  mockStartPractice.mockReset();
  mockPush.mockReset();
});

describe('StudentActions', () => {
  it('renders nothing for non-students (instructor)', async () => {
    authValue = { user: { ...mockUser, role: 'instructor' }, isLoading: false };
    mockListMySections.mockResolvedValue([]);

    const { container } = render(<StudentActions {...defaultProps} />);

    // Wait a tick so any async effects settle
    await new Promise((r) => setTimeout(r, 50));
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing for unauthenticated users', async () => {
    authValue = { user: null, isLoading: false };

    const { container } = render(<StudentActions {...defaultProps} />);

    await new Promise((r) => setTimeout(r, 50));
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when loading', async () => {
    authValue = { user: mockUser, isLoading: true };

    const { container } = render(<StudentActions {...defaultProps} />);

    await new Promise((r) => setTimeout(r, 50));
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when no matching sections for the class', async () => {
    mockListMySections.mockResolvedValue([
      makeSectionInfo('sec-1', 'Section 1', 'other-class'),
    ]);

    const { container } = render(<StudentActions {...defaultProps} />);

    await waitFor(() => {
      expect(mockListMySections).toHaveBeenCalled();
    });
    // After sections loaded with no match, should render nothing
    await new Promise((r) => setTimeout(r, 50));
    expect(container.innerHTML).toBe('');
  });

  it('renders Practice button when student has one matching section', async () => {
    mockListMySections.mockResolvedValue([
      makeSectionInfo('sec-1', 'Section 1', 'class-1'),
    ]);

    render(<StudentActions {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Practice')).toBeInTheDocument();
    });
  });

  it('auto-starts practice when one section and calls startPractice with correct args', async () => {
    mockListMySections.mockResolvedValue([
      makeSectionInfo('sec-1', 'Section 1', 'class-1'),
    ]);
    mockStartPractice.mockResolvedValue({ session_id: 'session-abc' });

    render(<StudentActions {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Practice')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Practice'));

    await waitFor(() => {
      expect(mockStartPractice).toHaveBeenCalledWith('prob-1', 'sec-1');
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/student?session_id=session-abc');
    });
  });

  it('shows section picker when multiple matching sections', async () => {
    mockListMySections.mockResolvedValue([
      makeSectionInfo('sec-1', 'Section A', 'class-1'),
      makeSectionInfo('sec-2', 'Section B', 'class-1'),
    ]);

    render(<StudentActions {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Practice')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Practice'));

    await waitFor(() => {
      expect(screen.getByText('Select a section to practice in:')).toBeInTheDocument();
      expect(screen.getByText('Section A')).toBeInTheDocument();
      expect(screen.getByText('Section B')).toBeInTheDocument();
    });
  });

  it('starts practice with selected section from picker', async () => {
    mockListMySections.mockResolvedValue([
      makeSectionInfo('sec-1', 'Section A', 'class-1'),
      makeSectionInfo('sec-2', 'Section B', 'class-1'),
    ]);
    mockStartPractice.mockResolvedValue({ session_id: 'session-xyz' });

    render(<StudentActions {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Practice')).toBeInTheDocument();
    });

    // Click Practice to show picker
    fireEvent.click(screen.getByText('Practice'));

    await waitFor(() => {
      expect(screen.getByText('Section B')).toBeInTheDocument();
    });

    // Click Section B
    fireEvent.click(screen.getByText('Section B'));

    await waitFor(() => {
      expect(mockStartPractice).toHaveBeenCalledWith('prob-1', 'sec-2');
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/student?session_id=session-xyz');
    });
  });

  it('shows error on API failure', async () => {
    mockListMySections.mockResolvedValue([
      makeSectionInfo('sec-1', 'Section 1', 'class-1'),
    ]);
    mockStartPractice.mockRejectedValue(new Error('Server error'));

    render(<StudentActions {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Practice')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Practice'));

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });
});

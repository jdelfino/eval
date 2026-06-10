/**
 * Tests for JoinSectionPage
 *
 * Verifies:
 * - Page renders header copy "Join a new section" + sub-line
 * - Page renders JoinSectionForm
 * - Join flow calls joinSection and redirects on success
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JoinSectionPage from '../page';

// Mock hooks and navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockJoinSection = jest.fn();
jest.mock('@/hooks/useSections', () => ({
  useSections: () => ({ joinSection: mockJoinSection }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'u1' } }),
}));

// Mock getStudentRegistrationInfo to avoid API calls in page tests
jest.mock('@/lib/api/registration', () => ({
  getStudentRegistrationInfo: jest.fn().mockRejectedValue(new Error('mocked')),
}));

jest.mock('next/link', () => {
  const MockLink = ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  );
  MockLink.displayName = 'MockLink';
  return MockLink;
});

describe('JoinSectionPage', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPush.mockReset();
    mockJoinSection.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Test case 9: page renders header copy
  it('renders page header "Join a new section" and sub-line copy', () => {
    render(<JoinSectionPage />);
    expect(screen.getByRole('heading', { name: /join a new section/i })).toBeInTheDocument();
    expect(screen.getByText(/enter the join code your teacher gave you/i)).toBeInTheDocument();
  });

  // Test case 9: page renders JoinSectionForm (has the join code input)
  it('renders JoinSectionForm (join code input is present)', () => {
    render(<JoinSectionPage />);
    // The form renders an input for join code
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  // Join flow: success redirects to section
  it('redirects to the joined section on success', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockJoinSection.mockResolvedValue({ section_id: 'sec-42' });
    render(<JoinSectionPage />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'ABC123');

    const submitBtn = screen.getByRole('button', { name: /join section/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockJoinSection).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/sections/sec-42');
    });
  });
});

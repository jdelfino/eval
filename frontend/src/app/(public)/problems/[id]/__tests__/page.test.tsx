/**
 * Tests for public problem page /problems/[id]
 *
 * Tests:
 * - Renders problem title and description (no solution — eval-e81 fix)
 * - Renders self-link for copy/paste
 * - generateMetadata returns correct title and OG tags
 * - Handles missing problems with notFound()
 * - No solution content rendered in any persona state
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import PublicProblemPage, { generateMetadata } from '../page';
import { notFound } from 'next/navigation';
import type { PublicProblem } from '@/types/api';

// Mock typed API client
const mockGetPublicProblem = jest.fn();
jest.mock('@/lib/api/problems', () => ({
  getPublicProblem: (...args: unknown[]) => mockGetPublicProblem(...args),
}));

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

jest.mock('../InstructorActions', () => {
  return function MockInstructorActions() {
    return <div data-testid="instructor-actions" />;
  };
});

jest.mock('../StudentActions', () => {
  return function MockStudentActions() {
    return <div data-testid="student-actions" />;
  };
});

// MarkdownContent is a client component; mock it
jest.mock('@/components/MarkdownContent', () => {
  return function MockMarkdownContent({ content }: { content: string }) {
    return <div data-testid="markdown-content">{content}</div>;
  };
});

const mockNotFound = notFound as jest.MockedFunction<typeof notFound>;

const mockProblem: PublicProblem = {
  id: 'problem-123',
  title: 'Two Sum',
  description: 'Find two numbers that add up to a target.',
  starter_code: 'def two_sum():\n    pass',
  class_id: 'class-1',
  class_name: 'CS 101',
  tags: ['arrays'],
  author_name: 'Ada Lovelace',
  updated_at: '2026-01-15T00:00:00Z',
  language: 'python',
  test_cases: [
    { kind: 'io', name: 'basic', summary: '1 2' },
    { kind: 'pytest', name: 'test_solution.py', summary: 'test_solution.py' },
  ],
};

function mockApiResponse(data: unknown) {
  mockGetPublicProblem.mockResolvedValue(data);
}

describe('Public Problem Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('page rendering', () => {
    it('renders problem title as h1', async () => {
      mockApiResponse(mockProblem);

      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      expect(screen.getByRole('heading', { level: 1, name: 'Two Sum' })).toBeInTheDocument();
    });

    it('renders self-link with problem path', async () => {
      mockApiResponse(mockProblem);

      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      const link = screen.getByRole('link', { name: /link to this problem/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/problems/problem-123');
    });

    it('renders problem description via MarkdownContent', async () => {
      mockApiResponse(mockProblem);

      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      expect(screen.getByTestId('markdown-content')).toHaveTextContent('Find two numbers that add up to a target.');
    });

    it('renders no solution content for any problem fixture', async () => {
      // Verifies eval-e81 fix: no solution block, no solution-related elements.
      mockApiResponse(mockProblem);

      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      // No <details> element (solution block was inside details).
      expect(document.querySelector('details')).not.toBeInTheDocument();
      // No element with solution-related text.
      expect(screen.queryByText(/show solution/i)).not.toBeInTheDocument();
      expect(screen.queryByTestId('solution-block')).not.toBeInTheDocument();
    });

    it('calls notFound for missing problem', async () => {
      mockApiResponse(null);

      await expect(
        PublicProblemPage({ params: Promise.resolve({ id: 'nonexistent' }) })
      ).rejects.toThrow('NEXT_NOT_FOUND');

      expect(mockNotFound).toHaveBeenCalled();
    });
  });

  describe('generateMetadata', () => {
    it('returns correct title and OG tags', async () => {
      mockApiResponse(mockProblem);

      const metadata = await generateMetadata({ params: Promise.resolve({ id: 'problem-123' }) });

      expect(metadata.title).toBe('Two Sum');
      expect(metadata.openGraph).toBeDefined();
      expect(metadata.openGraph!.title).toBe('Two Sum');
      expect(metadata.openGraph!.description).toBe('Find two numbers that add up to a target.');
    });

    it('returns fallback metadata for missing problem', async () => {
      mockApiResponse(null);

      const metadata = await generateMetadata({ params: Promise.resolve({ id: 'nonexistent' }) });

      expect(metadata.title).toBe('Problem Not Found');
    });
  });
});

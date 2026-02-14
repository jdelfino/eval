/**
 * Tests for public problem page /problems/[id]
 *
 * Tests:
 * - Renders problem title, description, and solution
 * - Solution is in a collapsed details element with syntax highlighting
 * - Renders self-link for copy/paste
 * - generateMetadata returns correct title and OG tags
 * - Handles missing problems with notFound()
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import PublicProblemPage, { generateMetadata } from '../page';
import { notFound } from 'next/navigation';

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

jest.mock('shiki', () => ({
  codeToHtml: jest.fn((code: string) =>
    Promise.resolve(`<pre class="shiki"><code>${code}</code></pre>`)
  ),
}));

jest.mock('../InstructorActions', () => {
  return function MockInstructorActions() {
    return <div data-testid="instructor-actions" />;
  };
});

jest.mock('../SolutionBlock', () => {
  return function MockSolutionBlock({ html }: { html: string }) {
    return <div data-testid="solution-block" dangerouslySetInnerHTML={{ __html: html }} />;
  };
});

// MarkdownContent is a client component; mock it
jest.mock('@/components/MarkdownContent', () => {
  return function MockMarkdownContent({ content }: { content: string }) {
    return <div data-testid="markdown-content">{content}</div>;
  };
});

const mockNotFound = notFound as jest.MockedFunction<typeof notFound>;

const mockProblem = {
  id: 'problem-123',
  title: 'Two Sum',
  description: 'Find two numbers that add up to a target.',
  solution: 'def two_sum(nums, target):\n    lookup = {}',
  starter_code: 'def two_sum():\n    pass',
  class_id: 'class-1',
  class_name: 'CS 101',
  tags: ['arrays'],
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

    it('renders solution in a collapsed details element', async () => {
      mockApiResponse(mockProblem);

      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      const details = document.querySelector('details');
      expect(details).toBeInTheDocument();
      expect(details).not.toHaveAttribute('open');
      expect(screen.getByText(/solution/i, { selector: 'summary' })).toBeInTheDocument();
    });

    it('renders syntax-highlighted solution via shiki', async () => {
      const { codeToHtml } = require('shiki');
      mockApiResponse(mockProblem);

      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      expect(codeToHtml).toHaveBeenCalledWith(mockProblem.solution, {
        lang: 'python',
        theme: 'github-light',
      });
      expect(document.querySelector('.shiki')).toBeInTheDocument();
    });

    it('renders solution block with highlighted HTML', async () => {
      mockApiResponse(mockProblem);

      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      expect(screen.getByTestId('solution-block')).toBeInTheDocument();
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

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
import { getProblemRepository } from '@/server/persistence';
import { notFound } from 'next/navigation';

jest.mock('@/server/persistence');
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

const mockGetProblemRepository = getProblemRepository as jest.MockedFunction<typeof getProblemRepository>;
const mockNotFound = notFound as jest.MockedFunction<typeof notFound>;

function mockRepo(getById: jest.Mock) {
  mockGetProblemRepository.mockReturnValue({ getById } as any);
}

describe('Public Problem Page', () => {
  const mockProblem = {
    id: 'problem-123',
    title: 'Two Sum',
    description: 'Find two numbers that add up to a target.',
    solution: 'def two_sum(nums, target):\n    lookup = {}',
    starterCode: 'def two_sum():\n    pass',
    testCases: [],
    authorId: 'user-1',
    classId: 'class-1',
    namespaceId: 'default',
    tags: ['arrays'],
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('page rendering', () => {
    it('renders problem title as h1', async () => {
      mockRepo(jest.fn().mockResolvedValue(mockProblem));

      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      expect(screen.getByRole('heading', { level: 1, name: 'Two Sum' })).toBeInTheDocument();
    });

    it('renders self-link with problem path', async () => {
      mockRepo(jest.fn().mockResolvedValue(mockProblem));

      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      const link = screen.getByRole('link', { name: /link to this problem/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/problems/problem-123');
    });

    it('renders problem description via MarkdownContent', async () => {
      mockRepo(jest.fn().mockResolvedValue(mockProblem));

      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      expect(screen.getByTestId('markdown-content')).toHaveTextContent('Find two numbers that add up to a target.');
    });

    it('renders solution in a collapsed details element', async () => {
      mockRepo(jest.fn().mockResolvedValue(mockProblem));

      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      const details = document.querySelector('details');
      expect(details).toBeInTheDocument();
      expect(details).not.toHaveAttribute('open');
      expect(screen.getByText(/solution/i, { selector: 'summary' })).toBeInTheDocument();
    });

    it('renders syntax-highlighted solution via shiki', async () => {
      const { codeToHtml } = require('shiki');
      mockRepo(jest.fn().mockResolvedValue(mockProblem));

      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      expect(codeToHtml).toHaveBeenCalledWith(mockProblem.solution, {
        lang: 'python',
        theme: 'github-light',
      });
      expect(document.querySelector('.shiki')).toBeInTheDocument();
    });

    it('renders solution block with highlighted HTML', async () => {
      mockRepo(jest.fn().mockResolvedValue(mockProblem));

      const page = await PublicProblemPage({ params: Promise.resolve({ id: 'problem-123' }) });
      render(page);

      expect(screen.getByTestId('solution-block')).toBeInTheDocument();
    });

    it('calls notFound for missing problem', async () => {
      mockRepo(jest.fn().mockResolvedValue(null));

      await expect(
        PublicProblemPage({ params: Promise.resolve({ id: 'nonexistent' }) })
      ).rejects.toThrow('NEXT_NOT_FOUND');

      expect(mockNotFound).toHaveBeenCalled();
    });
  });

  describe('generateMetadata', () => {
    it('returns correct title and OG tags', async () => {
      mockRepo(jest.fn().mockResolvedValue(mockProblem));

      const metadata = await generateMetadata({ params: Promise.resolve({ id: 'problem-123' }) });

      expect(metadata.title).toBe('Two Sum');
      expect(metadata.openGraph).toBeDefined();
      expect(metadata.openGraph!.title).toBe('Two Sum');
      expect(metadata.openGraph!.description).toBe('Find two numbers that add up to a target.');
    });

    it('returns fallback metadata for missing problem', async () => {
      mockRepo(jest.fn().mockResolvedValue(null));

      const metadata = await generateMetadata({ params: Promise.resolve({ id: 'nonexistent' }) });

      expect(metadata.title).toBe('Problem Not Found');
    });
  });
});

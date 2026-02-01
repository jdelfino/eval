/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ProblemDisplay from '../ProblemDisplay';
import { Problem } from '@/server/types/problem';
import { TestCase } from '@/server/testing/types';

// Helper to create a minimal problem
function createProblem(overrides: Partial<Problem> = {}): Problem {
  return {
    id: 'test-problem-1',
    title: 'Test Problem',
    description: 'A test problem description',
    namespaceId: 'test-namespace',
    authorId: 'author-1',
    classId: 'test-class-id',
    tags: [],
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('ProblemDisplay', () => {
  describe('Markdown rendering', () => {
    it('renders markdown in problem description', () => {
      const problem = createProblem({
        description: '# Hello World\n\nThis is a **bold** description.',
      });

      render(<ProblemDisplay problem={problem} />);

      // Check that markdown is rendered properly
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hello World');
      expect(screen.getByText('bold')).toHaveProperty('tagName', 'STRONG');
    });

    it('renders code blocks in description', () => {
      const problem = createProblem({
        description: 'Use this code:\n\n```python\nprint("hello")\n```',
      });

      render(<ProblemDisplay problem={problem} />);

      expect(screen.getByText('print("hello")')).toBeInTheDocument();
    });

    it('renders inline code in description', () => {
      const problem = createProblem({
        description: 'Call the `main()` function to start.',
      });

      render(<ProblemDisplay problem={problem} />);

      const code = screen.getByText('main()');
      expect(code.tagName).toBe('CODE');
    });

    it('renders lists in description', () => {
      const problem = createProblem({
        description: `## Requirements

- First item
- Second item
- Third item`,
      });

      render(<ProblemDisplay problem={problem} />);

      expect(screen.getByRole('heading', { level: 2, name: 'Requirements' })).toBeInTheDocument();
      expect(screen.getByText('First item')).toBeInTheDocument();
      expect(screen.getByText('Second item')).toBeInTheDocument();
      expect(screen.getByText('Third item')).toBeInTheDocument();
    });

    it('renders links in description', () => {
      const problem = createProblem({
        description: 'See [Python docs](https://docs.python.org) for more info.',
      });

      render(<ProblemDisplay problem={problem} />);

      const link = screen.getByRole('link', { name: 'Python docs' });
      expect(link).toHaveAttribute('href', 'https://docs.python.org');
      expect(link).toHaveAttribute('target', '_blank');
    });

    it('renders complex markdown description', () => {
      const problem = createProblem({
        description: `# Factorial Function

Write a function that calculates the **factorial** of a given number.

## Input

- A non-negative integer \`n\`

## Output

- The factorial of \`n\` (i.e., \`n!\`)

## Example

\`\`\`python
factorial(5)  # Returns 120
\`\`\`

> Note: 0! = 1 by definition`,
      });

      render(<ProblemDisplay problem={problem} />);

      // Verify various markdown elements are rendered
      expect(screen.getByRole('heading', { level: 1, name: 'Factorial Function' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: 'Input' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: 'Output' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: 'Example' })).toBeInTheDocument();
      expect(screen.getByText('factorial')).toHaveProperty('tagName', 'STRONG');
      // Use a more flexible query for the blockquote text
      const noteText = screen.getByText(/0! = 1 by definition/);
      expect(noteText.closest('blockquote')).toBeInTheDocument();
    });
  });

  describe('Basic rendering', () => {
    it('returns null when problem is null', () => {
      const { container } = render(<ProblemDisplay problem={null} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders problem title', () => {
      const problem = createProblem({ title: 'My Problem Title' });
      render(<ProblemDisplay problem={problem} />);
      expect(screen.getByText('My Problem Title')).toBeInTheDocument();
    });

    it('renders description section when description exists', () => {
      const problem = createProblem({ description: 'Problem description' });
      render(<ProblemDisplay problem={problem} />);
      expect(screen.getByText('Description')).toBeInTheDocument();
      expect(screen.getByText('Problem description')).toBeInTheDocument();
    });

    it('does not render description section when description is empty', () => {
      const problem = createProblem({ description: undefined });
      render(<ProblemDisplay problem={problem} />);
      expect(screen.queryByText('Description')).not.toBeInTheDocument();
    });
  });

  describe('Starter code section', () => {
    it('toggles starter code visibility', () => {
      const starterCode = `def hello():
    pass`;
      const problem = createProblem({
        starterCode,
      });
      render(<ProblemDisplay problem={problem} />);

      // Initially hidden
      expect(screen.queryByText(/def hello\(\)/)).not.toBeInTheDocument();

      // Click to show
      fireEvent.click(screen.getByText('Starter Code'));
      expect(screen.getByText(/def hello\(\)/)).toBeInTheDocument();

      // Click to hide
      fireEvent.click(screen.getByText('Starter Code'));
      expect(screen.queryByText(/def hello\(\)/)).not.toBeInTheDocument();
    });

    it('calls onLoadStarterCode when button is clicked', () => {
      const mockOnLoadStarterCode = jest.fn();
      const problem = createProblem({
        starterCode: 'def main():\n    pass',
      });
      render(<ProblemDisplay problem={problem} onLoadStarterCode={mockOnLoadStarterCode} />);

      // Expand starter code
      fireEvent.click(screen.getByText('Starter Code'));

      // Click load button
      fireEvent.click(screen.getByText('Load into Editor'));

      expect(mockOnLoadStarterCode).toHaveBeenCalledWith('def main():\n    pass');
    });
  });

  describe('Test cases section', () => {
    it('toggles test cases visibility', () => {
      const testCases: TestCase[] = [
        {
          id: 'tc1',
          problemId: 'test-problem-1',
          name: 'Test 1',
          type: 'input-output',
          description: 'Test adding 1 and 2',
          visible: true,
          order: 1,
          config: { type: 'input-output', data: { input: '1 2', expectedOutput: '3', matchType: 'exact' } },
        },
        {
          id: 'tc2',
          problemId: 'test-problem-1',
          name: 'Test 2',
          type: 'input-output',
          description: 'Test adding 0 and 0',
          visible: true,
          order: 2,
          config: { type: 'input-output', data: { input: '0 0', expectedOutput: '0', matchType: 'exact' } },
        },
      ];
      const problem = createProblem({ testCases });
      render(<ProblemDisplay problem={problem} />);

      // Initially hidden
      expect(screen.queryByText('Test 1')).not.toBeInTheDocument();

      // Click to show
      fireEvent.click(screen.getByText('Test Cases (2)'));
      expect(screen.getByText('Test 1')).toBeInTheDocument();
      expect(screen.getByText('Test 2')).toBeInTheDocument();

      // Click to hide
      fireEvent.click(screen.getByText('Test Cases (2)'));
      expect(screen.queryByText('Test 1')).not.toBeInTheDocument();
    });
  });

  describe('Execution settings', () => {
    it('displays random seed when set', () => {
      const problem = createProblem({
        executionSettings: { randomSeed: 42 },
      });
      render(<ProblemDisplay problem={problem} />);
      expect(screen.getByText(/Random seed: 42/)).toBeInTheDocument();
    });

    it('displays attached files count when files exist', () => {
      const problem = createProblem({
        executionSettings: {
          attachedFiles: [
            { name: 'data.txt', content: 'data' },
            { name: 'config.json', content: '{}' },
          ],
        },
      });
      render(<ProblemDisplay problem={problem} />);
      expect(screen.getByText(/2 file\(s\) attached/)).toBeInTheDocument();
    });
  });
});

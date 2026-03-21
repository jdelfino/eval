/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ProblemDisplay from '../ProblemDisplay';
import { Problem, IOTestCase } from '@/types/problem';

// Helper to create a minimal problem
function createProblem(overrides: Partial<Problem> = {}): Problem {
  return {
    id: 'test-problem-1',
    title: 'Test Problem',
    description: 'A test problem description',
    starter_code: null,
    test_cases: null,
    solution: null,
    namespace_id: 'test-namespace',
    author_id: 'author-1',
    class_id: 'test-class-id',
    tags: [],
    language: 'python',
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-01T00:00:00Z'),
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
      const problem = createProblem({ description: null });
      render(<ProblemDisplay problem={problem} />);
      expect(screen.queryByText('Description')).not.toBeInTheDocument();
    });
  });

  describe('Starter code section', () => {
    it('toggles starter code visibility', () => {
      const starter_code = `def hello():
    pass`;
      const problem = createProblem({
        starter_code,
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
        starter_code: 'def main():\n    pass',
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
      const test_cases: IOTestCase[] = [
        {
          name: 'Test 1',
          input: '1 2',
          expected_output: '3',
          match_type: 'exact',
          order: 0,
        },
        {
          name: 'Test 2',
          input: '0 0',
          expected_output: '0',
          match_type: 'exact',
          order: 1,
        },
      ];
      const problem = createProblem({ test_cases });
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

    it('shows TEST badge for cases with expected output', () => {
      const test_cases: IOTestCase[] = [
        {
          name: 'With Expected',
          input: 'hello',
          expected_output: 'hello',
          match_type: 'exact',
          order: 0,
        },
        {
          name: 'Run Only',
          input: 'hello',
          match_type: 'exact',
          order: 1,
        },
      ];
      const problem = createProblem({ test_cases });
      render(<ProblemDisplay problem={problem} />);
      fireEvent.click(screen.getByText('Test Cases (2)'));
      expect(screen.getByText('TEST')).toBeInTheDocument();
      expect(screen.getByText('RUN-ONLY')).toBeInTheDocument();
    });
  });

  describe('Execution settings (removed - uses test_cases instead)', () => {
    // TODO(PLAT-oztv.7): execution_settings display removed; test case configuration
    // will be driven by test_cases field on Problem.
    it('does not display random seed or attached files badges', () => {
      const problem = createProblem({
        test_cases: [
          { name: 'case1', input: '42', match_type: 'exact', expected_output: 'foo' } as IOTestCase,
        ],
      });
      render(<ProblemDisplay problem={problem} />);
      expect(screen.queryByText(/Random seed/)).not.toBeInTheDocument();
      expect(screen.queryByText(/file\(s\) attached/)).not.toBeInTheDocument();
    });
  });
});

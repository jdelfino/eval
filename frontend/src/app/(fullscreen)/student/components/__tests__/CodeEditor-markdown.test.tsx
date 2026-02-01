/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import CodeEditor from '../CodeEditor';

// Mock Monaco Editor
jest.mock('@monaco-editor/react', () => {
  return function MockEditor({ onMount }: any) {
    React.useEffect(() => {
      if (onMount) {
        const mockEditor = {
          focus: jest.fn(),
          getModel: jest.fn(() => ({
            getFullModelRange: jest.fn(() => ({
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: 1,
              endColumn: 1,
            })),
          })),
          executeEdits: jest.fn(),
          deltaDecorations: jest.fn().mockReturnValue([]),
        };
        onMount(mockEditor);
      }
    }, [onMount]);
    return <div data-testid="monaco-editor">Monaco Editor</div>;
  };
});

// Mock useResponsiveLayout for desktop view
jest.mock('@/hooks/useResponsiveLayout', () => {
  const actual = jest.requireActual('@/hooks/useResponsiveLayout');
  return {
    ...actual,
    useResponsiveLayout: () => true, // Desktop layout
    useMobileViewport: () => ({
      isMobile: false,
      isTablet: false,
      isVerySmall: false,
      isDesktop: true,
      width: 1200,
    }),
  };
});

describe('CodeEditor - Problem Description Markdown Rendering', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Desktop view', () => {
    it('should render markdown headers in problem description', async () => {
      const problem = {
        id: 'problem-1',
        authorId: 'instructor-1',
        title: 'Test Problem',
        description: '# Main Header\n\nSome content\n\n## Sub Header',
        starterCode: 'def solution():\n    pass',
        executionSettings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      render(
        <CodeEditor
          code=""
          onChange={jest.fn()}
          problem={problem}
          onLoadStarterCode={jest.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: 'Main Header' })).toBeInTheDocument();
      });
      expect(screen.getByRole('heading', { level: 2, name: 'Sub Header' })).toBeInTheDocument();
    });

    it('should render markdown bold text in problem description', async () => {
      const problem = {
        id: 'problem-1',
        authorId: 'instructor-1',
        title: 'Test Problem',
        description: 'This is **bold** text.',
        starterCode: '',
        executionSettings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      render(
        <CodeEditor
          code=""
          onChange={jest.fn()}
          problem={problem}
          onLoadStarterCode={jest.fn()}
        />
      );

      await waitFor(() => {
        const boldElement = screen.getByText('bold');
        expect(boldElement.tagName).toBe('STRONG');
      });
    });

    it('should render inline code in problem description', async () => {
      const problem = {
        id: 'problem-1',
        authorId: 'instructor-1',
        title: 'Test Problem',
        description: 'Call the `main()` function to start.',
        starterCode: '',
        executionSettings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      render(
        <CodeEditor
          code=""
          onChange={jest.fn()}
          problem={problem}
          onLoadStarterCode={jest.fn()}
        />
      );

      await waitFor(() => {
        const codeElement = screen.getByText('main()');
        expect(codeElement.tagName).toBe('CODE');
      });
    });

    it('should render markdown lists in problem description', async () => {
      const problem = {
        id: 'problem-1',
        authorId: 'instructor-1',
        title: 'Test Problem',
        description: '## Requirements\n\n- First item\n- Second item\n- Third item',
        starterCode: '',
        executionSettings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      render(
        <CodeEditor
          code=""
          onChange={jest.fn()}
          problem={problem}
          onLoadStarterCode={jest.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 2, name: 'Requirements' })).toBeInTheDocument();
      });
      expect(screen.getByText('First item')).toBeInTheDocument();
      expect(screen.getByText('Second item')).toBeInTheDocument();
      expect(screen.getByText('Third item')).toBeInTheDocument();
    });

    it('should render markdown links in problem description', async () => {
      const problem = {
        id: 'problem-1',
        authorId: 'instructor-1',
        title: 'Test Problem',
        description: 'See [Python docs](https://docs.python.org) for more info.',
        starterCode: '',
        executionSettings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      render(
        <CodeEditor
          code=""
          onChange={jest.fn()}
          problem={problem}
          onLoadStarterCode={jest.fn()}
        />
      );

      await waitFor(() => {
        const link = screen.getByRole('link', { name: 'Python docs' });
        expect(link).toHaveAttribute('href', 'https://docs.python.org');
        expect(link).toHaveAttribute('target', '_blank');
      });
    });

    it('should render code blocks in problem description', async () => {
      const problem = {
        id: 'problem-1',
        authorId: 'instructor-1',
        title: 'Test Problem',
        description: 'Example:\n\n```python\nprint("hello")\n```',
        starterCode: '',
        executionSettings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      render(
        <CodeEditor
          code=""
          onChange={jest.fn()}
          problem={problem}
          onLoadStarterCode={jest.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('print("hello")')).toBeInTheDocument();
      });
    });
  });

});

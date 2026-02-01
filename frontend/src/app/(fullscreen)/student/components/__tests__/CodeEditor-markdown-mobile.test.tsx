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

// Mock useResponsiveLayout for mobile view
jest.mock('@/hooks/useResponsiveLayout', () => {
  const actual = jest.requireActual('@/hooks/useResponsiveLayout');
  return {
    ...actual,
    useResponsiveLayout: () => false, // Mobile layout
    useMobileViewport: () => ({
      isMobile: true,
      isTablet: false,
      isVerySmall: false,
      isDesktop: false,
      width: 375,
    }),
  };
});

describe('CodeEditor - Mobile Markdown Rendering', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should render markdown headers in mobile problem view', async () => {
    const problem = {
      id: 'problem-1',
      authorId: 'instructor-1',
      title: 'Test Problem',
      description: '# Main Header\n\nSome content\n\n## Sub Header',
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

    // Open problem panel on mobile
    const problemButton = screen.getByRole('button', { name: 'Toggle Problem' });
    await act(async () => {
      problemButton.click();
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Main Header' })).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { level: 2, name: 'Sub Header' })).toBeInTheDocument();
  });

  it('should render markdown bold text in mobile view', async () => {
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

    // Open problem panel on mobile
    const problemButton = screen.getByRole('button', { name: 'Toggle Problem' });
    await act(async () => {
      problemButton.click();
    });

    await waitFor(() => {
      const boldElement = screen.getByText('bold');
      expect(boldElement.tagName).toBe('STRONG');
    });
  });

  it('should render inline code in mobile view', async () => {
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

    // Open problem panel on mobile
    const problemButton = screen.getByRole('button', { name: 'Toggle Problem' });
    await act(async () => {
      problemButton.click();
    });

    await waitFor(() => {
      const codeElement = screen.getByText('main()');
      expect(codeElement.tagName).toBe('CODE');
    });
  });

  it('should render markdown lists in mobile view', async () => {
    const problem = {
      id: 'problem-1',
      authorId: 'instructor-1',
      title: 'Test Problem',
      description: '## Requirements\n\n- First item\n- Second item',
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

    // Open problem panel on mobile
    const problemButton = screen.getByRole('button', { name: 'Toggle Problem' });
    await act(async () => {
      problemButton.click();
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Requirements' })).toBeInTheDocument();
    });
    expect(screen.getByText('First item')).toBeInTheDocument();
    expect(screen.getByText('Second item')).toBeInTheDocument();
  });
});

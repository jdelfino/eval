/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import CodeEditor from '../CodeEditor';

// Mock Monaco Editor
jest.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: ({ onChange, onMount }: any) => {
    React.useEffect(() => {
      if (onMount) {
        const mockEditor = {
          focus: jest.fn(),
          getValue: jest.fn(() => 'test code'),
          setValue: jest.fn(),
          deltaDecorations: jest.fn(() => []),
        };
        onMount(mockEditor);
      }
    }, [onMount]);

    return (
      <div data-testid="monaco-editor">
        <textarea
          data-testid="code-input"
          onChange={(e) => onChange?.(e.target.value)}
          defaultValue="test code"
        />
      </div>
    );
  },
}));

// Mock useResponsiveLayout
jest.mock('@/hooks/useResponsiveLayout', () => ({
  useResponsiveLayout: () => true, // Desktop layout
  useSidebarSection: (sectionId: string, defaultCollapsed: boolean) => ({
    isCollapsed: defaultCollapsed,
    toggle: jest.fn(),
    setCollapsed: jest.fn(),
  }),
  useMobileViewport: () => ({
    isMobile: false,
    isTablet: false,
    isVerySmall: false,
    isDesktop: true,
    width: 1200,
  }),
}));

describe('CodeEditor - Form Interaction', () => {
  const mockProblem = {
    id: 'test-problem',
    title: 'Test Problem',
    description: 'Test problem description',
    starterCode: 'print("hello")',
    testCases: [],
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    authorId: 'test-author',
  };

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  it('should not submit parent form when clicking Problem toggle button', async () => {
    const handleSubmit = jest.fn((e) => e.preventDefault());
    const handleCodeChange = jest.fn();

    render(
      <form onSubmit={handleSubmit}>
        <CodeEditor
          code="print('test')"
          onChange={handleCodeChange}
          problem={mockProblem}
        />
        <button type="submit">Submit Form</button>
      </form>
    );

    // Find and click the Problem toggle button in the activity bar
    const problemToggleButton = screen.getByLabelText('Problem');
    await act(async () => {
      fireEvent.click(problemToggleButton);
    });

    // Form should NOT be submitted
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('should not submit parent form when clicking Settings toggle button', async () => {
    const handleSubmit = jest.fn((e) => e.preventDefault());
    const handleCodeChange = jest.fn();

    render(
      <form onSubmit={handleSubmit}>
        <CodeEditor
          code="print('test')"
          onChange={handleCodeChange}
          problem={mockProblem}
        />
        <button type="submit">Submit Form</button>
      </form>
    );

    // Find and click the Settings toggle button in the activity bar
    const settingsToggleButton = screen.getByLabelText('Execution Settings');
    await act(async () => {
      fireEvent.click(settingsToggleButton);
    });

    // Form should NOT be submitted
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('should not submit parent form when clicking close panel button', async () => {
    const handleSubmit = jest.fn((e) => e.preventDefault());
    const handleCodeChange = jest.fn();

    // Mock useSidebarSection to start with problem panel open
    jest.spyOn(require('@/hooks/useResponsiveLayout'), 'useSidebarSection')
      .mockImplementation(((sectionId: string) => {
        if (sectionId === 'problem-panel') {
          return {
            isCollapsed: false, // Problem panel open
            toggle: jest.fn(),
            setCollapsed: jest.fn(),
          };
        }
        return {
          isCollapsed: true, // Settings closed
          toggle: jest.fn(),
          setCollapsed: jest.fn(),
        };
      }) as any);

    render(
      <form onSubmit={handleSubmit}>
        <CodeEditor
          code="print('test')"
          onChange={handleCodeChange}
          problem={mockProblem}
        />
        <button type="submit">Submit Form</button>
      </form>
    );

    // Find and click the close button in the panel header
    const closePanelButtons = screen.getAllByLabelText('Close panel');
    fireEvent.click(closePanelButtons[0]);

    // Form should NOT be submitted
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('should not submit parent form when clicking Run Code button', async () => {
    const handleSubmit = jest.fn((e) => e.preventDefault());
    const handleCodeChange = jest.fn();
    const handleRun = jest.fn();

    render(
      <form onSubmit={handleSubmit}>
        <CodeEditor
          code="print('test')"
          onChange={handleCodeChange}
          onRun={handleRun}
          showRunButton={true}
        />
        <button type="submit">Submit Form</button>
      </form>
    );

    // Find and click the Run Code button
    const runButton = screen.getByText(/▶ Run Code/);
    fireEvent.click(runButton);

    // Form should NOT be submitted, but onRun should be called
    expect(handleSubmit).not.toHaveBeenCalled();
    expect(handleRun).toHaveBeenCalled();
  });

  it('should not submit parent form when clicking Restore Starter Code button', async () => {
    const handleSubmit = jest.fn((e) => e.preventDefault());
    const handleCodeChange = jest.fn();
    const handleLoadStarterCode = jest.fn();

    // Mock useSidebarSection to start with problem panel open
    jest.spyOn(require('@/hooks/useResponsiveLayout'), 'useSidebarSection')
      .mockImplementation(((sectionId: string) => {
        if (sectionId === 'problem-panel') {
          return {
            isCollapsed: false, // Problem panel open
            toggle: jest.fn(),
            setCollapsed: jest.fn(),
          };
        }
        return {
          isCollapsed: true, // Settings closed
          toggle: jest.fn(),
          setCollapsed: jest.fn(),
        };
      }) as any);

    render(
      <form onSubmit={handleSubmit}>
        <CodeEditor
          code="print('test')"
          onChange={handleCodeChange}
          problem={mockProblem}
          onLoadStarterCode={handleLoadStarterCode}
        />
        <button type="submit">Submit Form</button>
      </form>
    );

    // Find and click the Restore Starter Code button
    const loadStarterButton = screen.getByText('Restore Starter Code');
    fireEvent.click(loadStarterButton);

    // Form should NOT be submitted, but onLoadStarterCode should be called
    expect(handleSubmit).not.toHaveBeenCalled();
    expect(handleLoadStarterCode).toHaveBeenCalledWith(mockProblem.starterCode);
  });

  it('should allow form submission via explicit submit button', async () => {
    const handleSubmit = jest.fn((e) => e.preventDefault());
    const handleCodeChange = jest.fn();

    render(
      <form onSubmit={handleSubmit}>
        <CodeEditor
          code="print('test')"
          onChange={handleCodeChange}
          problem={mockProblem}
        />
        <button type="submit">Submit Form</button>
      </form>
    );

    // Find and click the actual submit button
    const submitButton = screen.getByText('Submit Form');
    fireEvent.click(submitButton);

    // Form SHOULD be submitted when clicking the explicit submit button
    expect(handleSubmit).toHaveBeenCalled();
  });

  it('should verify all activity bar buttons have type="button" attribute', () => {
    const { container } = render(
      <form>
        <CodeEditor
          code="print('test')"
          onChange={jest.fn()}
          problem={mockProblem}
        />
      </form>
    );

    // Get all buttons inside the activity bar (bg-gray-800)
    const activityBar = container.querySelector('.bg-gray-800');
    expect(activityBar).toBeInTheDocument();

    // Get all buttons in the activity bar
    const buttons = activityBar?.querySelectorAll('button');
    expect(buttons).toBeTruthy();
    expect(buttons!.length).toBeGreaterThan(0);

    // Verify each button has type="button"
    buttons?.forEach((button) => {
      expect(button.getAttribute('type')).toBe('button');
    });
  });

  it('should verify Run button has type="button" attribute', () => {
    const mockDebugger = {
      hasTrace: false,
      isLoading: false,
      currentStep: 0,
      trace: [],
      getCurrentStep: jest.fn(),
      nextStep: jest.fn(),
      previousStep: jest.fn(),
      reset: jest.fn(),
      requestTrace: jest.fn(),
    } as any;

    const { container } = render(
      <form>
        <CodeEditor
          code="print('test')"
          onChange={jest.fn()}
          onRun={jest.fn()}
          showRunButton={true}
          debugger={mockDebugger}
        />
      </form>
    );

    // Find the Run Code button
    const runButton = screen.getByText(/▶ Run Code/);
    expect(runButton.getAttribute('type')).toBe('button');

    // Note: Debug button is now in the action bar icon, not a text button in the header
    // All sidebar action buttons have type="button" by default
  });
});

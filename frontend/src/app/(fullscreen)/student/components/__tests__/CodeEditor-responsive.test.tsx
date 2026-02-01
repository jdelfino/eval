/**
 * Tests for CodeEditor responsive layout
 *
 * Tests the responsive layout behavior added to better utilize screen space on large displays.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CodeEditor from '../CodeEditor';

// Mock Monaco Editor
jest.mock('@monaco-editor/react', () => {
  return function MockEditor({ value, onChange }: any) {
    return (
      <textarea
        data-testid="monaco-editor"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  };
});

// Mock ExecutionSettings with inSidebar prop handling
jest.mock('../ExecutionSettings', () => {
  return function MockExecutionSettings({ inSidebar }: { inSidebar?: boolean }) {
    return (
      <div data-testid="execution-settings" data-in-sidebar={inSidebar}>
        Execution Settings {inSidebar ? '(Sidebar)' : '(Bottom)'}
      </div>
    );
  };
});

// Mock useResponsiveLayout hook
jest.mock('@/hooks/useResponsiveLayout', () => ({
  useResponsiveLayout: jest.fn(),
  useSidebarSection: jest.fn(() => ({
    isCollapsed: false,
    toggle: jest.fn(),
    setCollapsed: jest.fn(),
  })),
  useMobileViewport: jest.fn(() => ({
    isMobile: false,
    isTablet: false,
    isVerySmall: false,
    isDesktop: true,
    width: 1200,
  })),
}));

describe('CodeEditor Responsive Layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Desktop Layout (>= 1024px)', () => {
    beforeEach(() => {
      const { useResponsiveLayout, useMobileViewport } = require('@/hooks/useResponsiveLayout');
      useResponsiveLayout.mockReturnValue(true); // Desktop
      useMobileViewport.mockReturnValue({
        isMobile: false,
        isTablet: false,
        isVerySmall: false,
        isDesktop: true,
        width: 1200,
      });
    });

    it('should render execution settings in sidebar on desktop', () => {
      render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
        />
      );

      const settings = screen.getByTestId('execution-settings');
      expect(settings).toHaveAttribute('data-in-sidebar', 'true');
      expect(settings).toHaveTextContent('(Sidebar)');
    });

    it('should render collapsible sidebar section header on desktop', () => {
      render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
        />
      );

      // Look for the activity bar button
      const sidebarButton = screen.getByRole('button', { name: /execution settings/i });
      expect(sidebarButton).toBeInTheDocument();
    });

    it('should render editor and sidebar in horizontal layout on desktop', () => {
      const { container } = render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
        />
      );

      // Check for the activity bar (icon sidebar) which appears on desktop
      const activityBar = container.querySelector('.w-12.bg-gray-800');
      expect(activityBar).toBeInTheDocument();
    });
  });

  describe('Mobile Layout (< 1024px)', () => {
    beforeEach(() => {
      const { useResponsiveLayout, useMobileViewport } = require('@/hooks/useResponsiveLayout');
      useResponsiveLayout.mockReturnValue(false); // Mobile
      useMobileViewport.mockReturnValue({
        isMobile: true,
        isTablet: false,
        isVerySmall: false,
        isDesktop: false,
        width: 600,
      });
    });

    it('should render mobile action bar with toggleable settings on mobile', () => {
      render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
        />
      );

      // Should have action bar with settings button
      const settingsButton = screen.getByRole('button', { name: /toggle settings/i });
      expect(settingsButton).toBeInTheDocument();

      // Settings should be collapsed by default (not visible)
      expect(screen.queryByTestId('execution-settings')).not.toBeInTheDocument();
    });

    it('should not render sidebar collapse button on mobile', () => {
      render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
        />
      );

      // The activity bar should not exist on mobile
      const sidebarButton = screen.queryByRole('button', { name: /execution settings/i });
      expect(sidebarButton).not.toBeInTheDocument();
    });

    it('should maintain vertical stacking layout on mobile', () => {
      const { container } = render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
        />
      );

      // Activity bar should not be rendered on mobile
      const activityBar = container.querySelector('.w-12.bg-gray-800');
      expect(activityBar).not.toBeInTheDocument();
    });

    it('should render problem and settings buttons in action bar on mobile', () => {
      const problem = {
        id: 'test-problem',
        title: 'Test Problem',
        description: 'Test description',
        starterCode: '',
        authorId: 'instructor-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const { container } = render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
          problem={problem}
        />
      );

      // Find the mobile action bar
      const actionBar = container.querySelector('.bg-gray-800.border-b.border-gray-700');
      expect(actionBar).toBeInTheDocument();

      // Should have both problem and settings buttons
      expect(screen.getByRole('button', { name: /toggle problem/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /toggle settings/i })).toBeInTheDocument();

      // Both sections should be collapsed by default (not visible)
      expect(screen.queryByTestId('execution-settings')).not.toBeInTheDocument();
      expect(screen.queryByText('Test Problem')).not.toBeInTheDocument();
    });

    it('should render Show Code and Show Output toggle buttons on mobile', () => {
      render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
        />
      );

      // Should have Code/Output toggle buttons
      expect(screen.getByTestId('mobile-show-code')).toBeInTheDocument();
      expect(screen.getByTestId('mobile-show-output')).toBeInTheDocument();
    });

    it('should show code view by default on mobile', () => {
      render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
        />
      );

      // Code button should be active (green)
      const codeButton = screen.getByTestId('mobile-show-code');
      expect(codeButton).toHaveClass('bg-green-600');

      // Output button should not be active
      const outputButton = screen.getByTestId('mobile-show-output');
      expect(outputButton).not.toHaveClass('bg-green-600');
    });

    it('should not render resize handle on mobile', () => {
      const { container } = render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
        />
      );

      // The resize handle should not be present on mobile
      const resizeHandle = container.querySelector('.cursor-row-resize');
      expect(resizeHandle).not.toBeInTheDocument();
    });
  });

  describe('Mobile View Toggle', () => {
    beforeEach(() => {
      const { useResponsiveLayout, useMobileViewport } = require('@/hooks/useResponsiveLayout');
      useResponsiveLayout.mockReturnValue(false); // Mobile
      useMobileViewport.mockReturnValue({
        isMobile: true,
        isTablet: false,
        isVerySmall: false,
        isDesktop: false,
        width: 600,
      });
    });

    it('should toggle between code and output views on mobile', async () => {
      const { fireEvent } = await import('@testing-library/react');

      render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
          executionResult={{
            success: true,
            output: 'Hello World',
            error: '',
            executionTime: 100,
          }}
        />
      );

      // Initially showing code view
      const codeButton = screen.getByTestId('mobile-show-code');
      const outputButton = screen.getByTestId('mobile-show-output');

      expect(codeButton).toHaveClass('bg-green-600');
      expect(outputButton).not.toHaveClass('bg-green-600');

      // Click on Output button
      fireEvent.click(outputButton);

      // Now output should be active
      expect(outputButton).toHaveClass('bg-green-600');
      expect(codeButton).not.toHaveClass('bg-green-600');

      // Click back on Code button
      fireEvent.click(codeButton);

      // Code should be active again
      expect(codeButton).toHaveClass('bg-green-600');
      expect(outputButton).not.toHaveClass('bg-green-600');
    });
  });

  describe('Very Small Viewport (< 480px)', () => {
    beforeEach(() => {
      const { useResponsiveLayout, useMobileViewport } = require('@/hooks/useResponsiveLayout');
      useResponsiveLayout.mockReturnValue(false); // Not desktop
      useMobileViewport.mockReturnValue({
        isMobile: true,
        isTablet: false,
        isVerySmall: true,
        isDesktop: false,
        width: 375,
      });
    });

    it('should render code editor on very small screens', () => {
      render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
        />
      );

      // Should still render the editor
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
    });

    it('should render mobile action bar on very small screens', () => {
      render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
        />
      );

      // Should have mobile toggle buttons
      expect(screen.getByTestId('mobile-show-code')).toBeInTheDocument();
      expect(screen.getByTestId('mobile-show-output')).toBeInTheDocument();
    });
  });

  describe('Responsive Execution Results', () => {
    const executionResult = {
      success: true,
      output: 'Test output',
      error: '',
      executionTime: 100,
    };

    it('should render execution results below editor on desktop', () => {
      const { useResponsiveLayout, useMobileViewport } = require('@/hooks/useResponsiveLayout');
      useResponsiveLayout.mockReturnValue(true);
      useMobileViewport.mockReturnValue({
        isMobile: false,
        isTablet: false,
        isVerySmall: false,
        isDesktop: true,
        width: 1200,
      });

      render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
          executionResult={executionResult}
        />
      );

      expect(screen.getByText('✓ Success')).toBeInTheDocument();
      expect(screen.getByText('Test output')).toBeInTheDocument();
    });

    it('should render execution results when output view is selected on mobile', async () => {
      const { fireEvent } = await import('@testing-library/react');
      const { useResponsiveLayout, useMobileViewport } = require('@/hooks/useResponsiveLayout');
      useResponsiveLayout.mockReturnValue(false);
      useMobileViewport.mockReturnValue({
        isMobile: true,
        isTablet: false,
        isVerySmall: false,
        isDesktop: false,
        width: 600,
      });

      render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
          executionResult={executionResult}
        />
      );

      // Switch to output view
      const outputButton = screen.getByTestId('mobile-show-output');
      fireEvent.click(outputButton);

      expect(screen.getByText('✓ Success')).toBeInTheDocument();
      expect(screen.getByText('Test output')).toBeInTheDocument();
    });
  });

  describe('Sidebar Collapse State', () => {
    it('should render collapsed sidebar when isCollapsed is true', () => {
      const { useResponsiveLayout, useSidebarSection, useMobileViewport } = require('@/hooks/useResponsiveLayout');
      useResponsiveLayout.mockReturnValue(true);
      useMobileViewport.mockReturnValue({
        isMobile: false,
        isTablet: false,
        isVerySmall: false,
        isDesktop: true,
        width: 1200,
      });
      useSidebarSection.mockReturnValue({
        isCollapsed: true,
        toggle: jest.fn(),
      });

      render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
        />
      );

      const sidebarButton = screen.getByRole('button', { name: /execution settings/i });
      expect(sidebarButton).toBeInTheDocument();

      // Settings panel should not be rendered when collapsed
      expect(screen.queryByTestId('execution-settings')).not.toBeInTheDocument();
    });

    it('should render expanded sidebar when isCollapsed is false', () => {
      const { useResponsiveLayout, useSidebarSection, useMobileViewport } = require('@/hooks/useResponsiveLayout');
      useResponsiveLayout.mockReturnValue(true);
      useMobileViewport.mockReturnValue({
        isMobile: false,
        isTablet: false,
        isVerySmall: false,
        isDesktop: true,
        width: 1200,
      });
      useSidebarSection.mockReturnValue({
        isCollapsed: false,
        toggle: jest.fn(),
        setCollapsed: jest.fn(),
      });

      render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
        />
      );

      const sidebarButton = screen.getByRole('button', { name: /execution settings/i });
      expect(sidebarButton).toBeInTheDocument();

      // Settings panel should be rendered when expanded
      expect(screen.getByTestId('execution-settings')).toBeInTheDocument();
    });
  });

  describe('Read-only Mode', () => {
    it('should hide sidebar in read-only mode', () => {
      const { useResponsiveLayout, useSidebarSection, useMobileViewport } = require('@/hooks/useResponsiveLayout');
      useResponsiveLayout.mockReturnValue(true);
      useMobileViewport.mockReturnValue({
        isMobile: false,
        isTablet: false,
        isVerySmall: false,
        isDesktop: true,
        width: 1200,
      });
      useSidebarSection.mockReturnValue({
        isCollapsed: false,
        toggle: jest.fn(),
        setCollapsed: jest.fn(),
      });

      render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
          readOnly={true}
        />
      );

      // In read-only mode, sidebar and activity bar are hidden
      const sidebarButton = screen.queryByRole('button', { name: /execution settings/i });
      expect(sidebarButton).not.toBeInTheDocument();
    });
  });

  describe('forceDesktop prop', () => {
    it('should use desktop layout even when hooks report mobile viewport', () => {
      const { useResponsiveLayout, useMobileViewport } = require('@/hooks/useResponsiveLayout');
      useResponsiveLayout.mockReturnValue(false); // Hook says mobile
      useMobileViewport.mockReturnValue({
        isMobile: true,
        isTablet: false,
        isVerySmall: false,
        isDesktop: false,
        width: 600,
      });

      const { container } = render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
          forceDesktop={true}
        />
      );

      // Mobile toggle buttons should NOT be rendered
      expect(screen.queryByTestId('mobile-show-code')).not.toBeInTheDocument();
      expect(screen.queryByTestId('mobile-show-output')).not.toBeInTheDocument();

      // Desktop activity bar should be present
      const activityBar = container.querySelector('.w-12.bg-gray-800');
      expect(activityBar).toBeInTheDocument();
    });
  });

  describe('Resize Handle Desktop Only', () => {
    it('should render resize handle on desktop', () => {
      const { useResponsiveLayout, useSidebarSection, useMobileViewport } = require('@/hooks/useResponsiveLayout');
      useResponsiveLayout.mockReturnValue(true);
      useMobileViewport.mockReturnValue({
        isMobile: false,
        isTablet: false,
        isVerySmall: false,
        isDesktop: true,
        width: 1200,
      });
      useSidebarSection.mockReturnValue({
        isCollapsed: false,
        toggle: jest.fn(),
        setCollapsed: jest.fn(),
      });

      const { container } = render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
        />
      );

      // The resize handle should be present on desktop
      const resizeHandle = container.querySelector('.cursor-row-resize');
      expect(resizeHandle).toBeInTheDocument();
    });
  });
});

/**
 * Tests for CodeEditor layout structure
 *
 * These tests verify the critical CSS layout structure that prevents the
 * recurring bug where the activity bar background doesn't extend to the
 * bottom of the editor component.
 *
 * This bug has occurred multiple times when:
 * - Adding the editor to new pages
 * - Making changes to the editor component
 * - Modifying the parent container structure
 *
 * The root cause is improper flex layout where nested flex containers
 * don't have the required min-h-0 or height properties.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render } from '@testing-library/react';
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

// Mock ExecutionSettings
jest.mock('../ExecutionSettings', () => {
  return function MockExecutionSettings() {
    return <div data-testid="execution-settings">Settings</div>;
  };
});

// Mock useResponsiveLayout hook
jest.mock('@/hooks/useResponsiveLayout', () => ({
  useResponsiveLayout: jest.fn(() => true), // Default to desktop
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

describe('CodeEditor Layout Structure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Critical layout requirements', () => {
    it('should have height: 100% on root div', () => {
      const { container } = render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
        />
      );

      // Get the root div (should have border and flex-col classes)
      const rootDiv = container.querySelector('.border.border-gray-300.rounded.flex.flex-col');
      expect(rootDiv).toBeInTheDocument();
      expect(rootDiv).toHaveStyle({ height: '100%' });
    });

    it('should have flex-col on root div for vertical stacking', () => {
      const { container } = render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
        />
      );

      const rootDiv = container.querySelector('.border.border-gray-300.rounded');
      expect(rootDiv).toHaveClass('flex', 'flex-col');
    });

    it('should have flex-1 and min-h-0 on main content area', () => {
      const { container } = render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
        />
      );

      // Find the main content area (should be between header and output)
      // It's the div with flex-col flex-1 min-h-0
      const contentArea = container.querySelector('.flex.flex-col.flex-1.min-h-0');
      expect(contentArea).toBeInTheDocument();
    });

    it('should have flex-row flex-1 min-h-0 on desktop layout container', () => {
      const { container } = render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
        />
      );

      // Find the desktop layout container (activity bar + editor)
      const desktopContainer = container.querySelector('.flex.flex-row.flex-1.min-h-0');
      expect(desktopContainer).toBeInTheDocument();
    });

    it('should have height: 100% on activity bar', () => {
      const { container } = render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
        />
      );

      // Find the activity bar (icon sidebar)
      const activityBar = container.querySelector('.w-12.bg-gray-800');
      expect(activityBar).toBeInTheDocument();
      expect(activityBar).toHaveStyle({ height: '100%' });
    });

    it('should have min-h-0 on activity bar parent container', () => {
      const { container } = render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
        />
      );

      // Find the activity bar parent (flex-row container)
      const activityBarParent = container.querySelector('.flex.flex-row.flex-shrink-0.min-h-0');
      expect(activityBarParent).toBeInTheDocument();
    });
  });

  describe('Flex layout chain integrity', () => {
    it('should maintain complete flex chain from root to activity bar', () => {
      const { container } = render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
        />
      );

      // Verify the complete chain:
      // 1. Root: flex flex-col height:100%
      const root = container.querySelector('.border.border-gray-300.rounded.flex.flex-col');
      expect(root).toHaveStyle({ height: '100%' });

      // 2. Content area: flex flex-col flex-1 min-h-0
      const contentArea = root?.querySelector('.flex.flex-col.flex-1.min-h-0');
      expect(contentArea).toBeInTheDocument();

      // 3. Desktop container: flex flex-row flex-1 min-h-0
      const desktopContainer = contentArea?.querySelector('.flex.flex-row.flex-1.min-h-0');
      expect(desktopContainer).toBeInTheDocument();

      // 4. Activity bar parent: flex flex-row flex-shrink-0 min-h-0 height:100%
      const activityBarParent = desktopContainer?.querySelector('.flex.flex-row.flex-shrink-0.min-h-0');
      expect(activityBarParent).toBeInTheDocument();
      expect(activityBarParent).toHaveStyle({ height: '100%' });

      // 5. Activity bar: w-12 bg-gray-800 height:100%
      const activityBar = activityBarParent?.querySelector('.w-12.bg-gray-800');
      expect(activityBar).toBeInTheDocument();
      expect(activityBar).toHaveStyle({ height: '100%' });
    });
  });

  describe('Fixed height parent container compatibility', () => {
    it('should work correctly when wrapped in a fixed-height container', () => {
      const { container } = render(
        <div style={{ height: '500px' }}>
          <CodeEditor
            code="print('hello')"
            onChange={jest.fn()}
          />
        </div>
      );

      // Root should have height: 100% to fill the 500px parent
      const rootDiv = container.querySelector('.border.border-gray-300.rounded.flex.flex-col');
      expect(rootDiv).toHaveStyle({ height: '100%' });

      // Activity bar should still have height: 100%
      const activityBar = container.querySelector('.w-12.bg-gray-800');
      expect(activityBar).toHaveStyle({ height: '100%' });
    });

    it('should work correctly when wrapped in a percentage-height container', () => {
      const { container } = render(
        <div style={{ height: '100%', minHeight: '400px' }}>
          <CodeEditor
            code="print('hello')"
            onChange={jest.fn()}
          />
        </div>
      );

      // Root should have height: 100%
      const rootDiv = container.querySelector('.border.border-gray-300.rounded.flex.flex-col');
      expect(rootDiv).toHaveStyle({ height: '100%' });
    });
  });

  describe('Regression test for instructor session view', () => {
    it('should render correctly in instructor session details context', () => {
      // Simulate the exact structure used in SessionDetails.tsx
      const { container } = render(
        <div className="border border-gray-200 rounded-lg overflow-hidden" style={{ height: '500px' }}>
          <CodeEditor
            code="# Student code"
            onChange={() => {}}
            onRun={() => {}}
            readOnly
          />
        </div>
      );

      // Verify the editor is present
      const editor = container.querySelector('[data-testid="monaco-editor"]');
      expect(editor).toBeInTheDocument();

      // In read-only mode, activity bar and sidebar are hidden
      const activityBar = container.querySelector('.w-12.bg-gray-800');
      expect(activityBar).toBeNull();

      // Verify the layout chain is intact
      const rootDiv = container.querySelector('.border.border-gray-300.rounded.flex.flex-col');
      expect(rootDiv).toHaveStyle({ height: '100%' });

      const contentArea = rootDiv?.querySelector('.flex.flex-col.flex-1.min-h-0');
      expect(contentArea).toBeInTheDocument();
    });
  });

  describe('Mobile layout structure', () => {
    beforeEach(() => {
      const { useResponsiveLayout } = require('@/hooks/useResponsiveLayout');
      useResponsiveLayout.mockReturnValue(false); // Mobile
    });

    it('should have proper flex structure on mobile', () => {
      const { container } = render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
        />
      );

      // Root should still have height: 100%
      const rootDiv = container.querySelector('.border.border-gray-300.rounded.flex.flex-col');
      expect(rootDiv).toHaveStyle({ height: '100%' });

      // Content area should have flex-1 min-h-0 and overflow-y-auto
      const contentArea = rootDiv?.querySelector('.flex.flex-col.flex-1.min-h-0.overflow-y-auto');
      expect(contentArea).toBeInTheDocument();
    });

    it('should not render activity bar on mobile', () => {
      const { container } = render(
        <CodeEditor
          code="print('hello')"
          onChange={jest.fn()}
        />
      );

      // Activity bar should not be present on mobile
      const activityBar = container.querySelector('.w-12.bg-gray-800');
      expect(activityBar).not.toBeInTheDocument();
    });
  });
});

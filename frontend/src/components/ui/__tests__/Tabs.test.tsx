/**
 * Unit tests for Tabs component
 * @jest-environment jsdom
 */

import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Tabs } from '../Tabs';

// Helper component for controlled testing
function ControlledTabs({
  defaultTab = 'tab1',
  children,
}: {
  defaultTab?: string;
  children?: React.ReactNode;
}) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  return (
    <Tabs activeTab={activeTab} onTabChange={setActiveTab}>
      {children || (
        <>
          <Tabs.List>
            <Tabs.Tab tabId="tab1">Tab 1</Tabs.Tab>
            <Tabs.Tab tabId="tab2">Tab 2</Tabs.Tab>
            <Tabs.Tab tabId="tab3">Tab 3</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel tabId="tab1">Content 1</Tabs.Panel>
          <Tabs.Panel tabId="tab2">Content 2</Tabs.Panel>
          <Tabs.Panel tabId="tab3">Content 3</Tabs.Panel>
        </>
      )}
    </Tabs>
  );
}

describe('Tabs', () => {
  describe('basic rendering', () => {
    it('should render tabs and content', () => {
      render(<ControlledTabs />);

      expect(screen.getByText('Tab 1')).toBeInTheDocument();
      expect(screen.getByText('Tab 2')).toBeInTheDocument();
      expect(screen.getByText('Tab 3')).toBeInTheDocument();
      expect(screen.getByText('Content 1')).toBeInTheDocument();
    });

    it('should apply custom className to Tabs container', () => {
      const handleChange = jest.fn();
      render(
        <Tabs
          activeTab="tab1"
          onTabChange={handleChange}
          className="custom-tabs"
          data-testid="tabs"
        >
          <Tabs.List>
            <Tabs.Tab tabId="tab1">Tab 1</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel tabId="tab1">Content</Tabs.Panel>
        </Tabs>
      );

      expect(screen.getByTestId('tabs')).toHaveClass('custom-tabs');
    });
  });

  describe('tab selection', () => {
    it('should show the active panel content', () => {
      render(<ControlledTabs defaultTab="tab1" />);

      expect(screen.getByText('Content 1')).toBeInTheDocument();
      expect(screen.queryByText('Content 2')).not.toBeInTheDocument();
      expect(screen.queryByText('Content 3')).not.toBeInTheDocument();
    });

    it('should change tabs when clicking a tab button', () => {
      render(<ControlledTabs defaultTab="tab1" />);

      expect(screen.getByText('Content 1')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Tab 2'));

      expect(screen.queryByText('Content 1')).not.toBeInTheDocument();
      expect(screen.getByText('Content 2')).toBeInTheDocument();
    });

    it('should call onTabChange when tab is clicked', () => {
      const handleChange = jest.fn();
      render(
        <Tabs activeTab="tab1" onTabChange={handleChange}>
          <Tabs.List>
            <Tabs.Tab tabId="tab1">Tab 1</Tabs.Tab>
            <Tabs.Tab tabId="tab2">Tab 2</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel tabId="tab1">Content 1</Tabs.Panel>
          <Tabs.Panel tabId="tab2">Content 2</Tabs.Panel>
        </Tabs>
      );

      fireEvent.click(screen.getByText('Tab 2'));

      expect(handleChange).toHaveBeenCalledWith('tab2');
    });
  });

  describe('accessibility', () => {
    it('should have proper role attributes on tab list', () => {
      render(<ControlledTabs />);

      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    it('should have proper role attributes on tabs', () => {
      render(<ControlledTabs />);

      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(3);
    });

    it('should have proper role attributes on panels', () => {
      render(<ControlledTabs />);

      expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    });

    it('should set aria-selected correctly on active tab', () => {
      render(<ControlledTabs defaultTab="tab1" />);

      const tab1 = screen.getByText('Tab 1');
      const tab2 = screen.getByText('Tab 2');

      expect(tab1).toHaveAttribute('aria-selected', 'true');
      expect(tab2).toHaveAttribute('aria-selected', 'false');
    });

    it('should update aria-selected when tab changes', () => {
      render(<ControlledTabs defaultTab="tab1" />);

      const tab1 = screen.getByText('Tab 1');
      const tab2 = screen.getByText('Tab 2');

      expect(tab1).toHaveAttribute('aria-selected', 'true');
      expect(tab2).toHaveAttribute('aria-selected', 'false');

      fireEvent.click(tab2);

      expect(tab1).toHaveAttribute('aria-selected', 'false');
      expect(tab2).toHaveAttribute('aria-selected', 'true');
    });

    it('should have aria-controls on tabs', () => {
      render(<ControlledTabs />);

      const tab1 = screen.getByText('Tab 1');
      expect(tab1).toHaveAttribute('aria-controls', 'panel-tab1');
    });

    it('should set tabIndex on panel for keyboard navigation', () => {
      render(<ControlledTabs />);

      const panel = screen.getByRole('tabpanel');
      expect(panel).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('disabled tabs', () => {
    it('should not change tabs when clicking a disabled tab', () => {
      const handleChange = jest.fn();
      render(
        <Tabs activeTab="tab1" onTabChange={handleChange}>
          <Tabs.List>
            <Tabs.Tab tabId="tab1">Tab 1</Tabs.Tab>
            <Tabs.Tab tabId="tab2" disabled>
              Tab 2
            </Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel tabId="tab1">Content 1</Tabs.Panel>
          <Tabs.Panel tabId="tab2">Content 2</Tabs.Panel>
        </Tabs>
      );

      fireEvent.click(screen.getByText('Tab 2'));

      expect(handleChange).not.toHaveBeenCalled();
    });

    it('should apply disabled styling to disabled tabs', () => {
      const handleChange = jest.fn();
      render(
        <Tabs activeTab="tab1" onTabChange={handleChange}>
          <Tabs.List>
            <Tabs.Tab tabId="tab1">Tab 1</Tabs.Tab>
            <Tabs.Tab tabId="tab2" disabled data-testid="disabled-tab">
              Tab 2
            </Tabs.Tab>
          </Tabs.List>
        </Tabs>
      );

      expect(screen.getByTestId('disabled-tab')).toBeDisabled();
    });
  });

  describe('compound component structure', () => {
    it('should render Tabs.List as div with border', () => {
      const handleChange = jest.fn();
      render(
        <Tabs activeTab="tab1" onTabChange={handleChange}>
          <Tabs.List data-testid="tab-list">
            <Tabs.Tab tabId="tab1">Tab 1</Tabs.Tab>
          </Tabs.List>
        </Tabs>
      );

      expect(screen.getByTestId('tab-list')).toHaveClass('border-b');
    });

    it('should render Tabs.Tab as button', () => {
      const handleChange = jest.fn();
      render(
        <Tabs activeTab="tab1" onTabChange={handleChange}>
          <Tabs.List>
            <Tabs.Tab tabId="tab1">Tab 1</Tabs.Tab>
          </Tabs.List>
        </Tabs>
      );

      expect(screen.getByText('Tab 1').tagName).toBe('BUTTON');
    });

    it('should apply active styles to selected tab', () => {
      render(<ControlledTabs defaultTab="tab1" />);

      const tab1 = screen.getByText('Tab 1');
      expect(tab1).toHaveClass('border-primary-500');
      expect(tab1).toHaveClass('text-primary-600');
    });

    it('should apply inactive styles to non-selected tab', () => {
      render(<ControlledTabs defaultTab="tab1" />);

      const tab2 = screen.getByText('Tab 2');
      expect(tab2).toHaveClass('border-transparent');
      expect(tab2).toHaveClass('text-gray-500');
    });
  });

  describe('keepMounted', () => {
    it('should keep inactive panel in the DOM when keepMounted is true', () => {
      render(
        <ControlledTabs defaultTab="tab1">
          <Tabs.List>
            <Tabs.Tab tabId="tab1">Tab 1</Tabs.Tab>
            <Tabs.Tab tabId="tab2">Tab 2</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel tabId="tab1">Content 1</Tabs.Panel>
          <Tabs.Panel tabId="tab2" keepMounted>Content 2</Tabs.Panel>
        </ControlledTabs>
      );

      expect(screen.getByText('Content 1')).toBeVisible();
      expect(screen.getByText('Content 2')).not.toBeVisible();
    });

    it('should preserve state across tab switches with keepMounted', () => {
      render(<ControlledTabs defaultTab="tab1">
        <Tabs.List>
          <Tabs.Tab tabId="tab1">Tab 1</Tabs.Tab>
          <Tabs.Tab tabId="tab2">Tab 2</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel tabId="tab1">Content 1</Tabs.Panel>
        <Tabs.Panel tabId="tab2" keepMounted>Content 2</Tabs.Panel>
      </ControlledTabs>);

      // Switch to tab2, then back to tab1
      fireEvent.click(screen.getByText('Tab 2'));
      expect(screen.getByText('Content 2')).toBeVisible();

      fireEvent.click(screen.getByText('Tab 1'));
      // Content 2 should still be in the DOM, just hidden
      expect(screen.getByText('Content 2')).not.toBeVisible();
      expect(screen.getByText('Content 2')).toBeInTheDocument();
    });
  });

  describe('custom classNames', () => {
    it('should apply custom className to Tabs.List', () => {
      const handleChange = jest.fn();
      render(
        <Tabs activeTab="tab1" onTabChange={handleChange}>
          <Tabs.List className="custom-list" data-testid="list">
            <Tabs.Tab tabId="tab1">Tab 1</Tabs.Tab>
          </Tabs.List>
        </Tabs>
      );

      expect(screen.getByTestId('list')).toHaveClass('custom-list');
    });

    it('should apply custom className to Tabs.Tab', () => {
      const handleChange = jest.fn();
      render(
        <Tabs activeTab="tab1" onTabChange={handleChange}>
          <Tabs.List>
            <Tabs.Tab tabId="tab1" className="custom-tab" data-testid="tab">
              Tab 1
            </Tabs.Tab>
          </Tabs.List>
        </Tabs>
      );

      expect(screen.getByTestId('tab')).toHaveClass('custom-tab');
    });

    it('should apply custom className to Tabs.Panel', () => {
      const handleChange = jest.fn();
      render(
        <Tabs activeTab="tab1" onTabChange={handleChange}>
          <Tabs.List>
            <Tabs.Tab tabId="tab1">Tab 1</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel tabId="tab1" className="custom-panel" data-testid="panel">
            Content
          </Tabs.Panel>
        </Tabs>
      );

      expect(screen.getByTestId('panel')).toHaveClass('custom-panel');
    });
  });

  describe('ref forwarding', () => {
    it('should forward ref to Tabs container', () => {
      const ref = React.createRef<HTMLDivElement>();
      const handleChange = jest.fn();
      render(
        <Tabs activeTab="tab1" onTabChange={handleChange} ref={ref}>
          <Tabs.List>
            <Tabs.Tab tabId="tab1">Tab 1</Tabs.Tab>
          </Tabs.List>
        </Tabs>
      );
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });

    it('should forward ref to Tabs.List', () => {
      const ref = React.createRef<HTMLDivElement>();
      const handleChange = jest.fn();
      render(
        <Tabs activeTab="tab1" onTabChange={handleChange}>
          <Tabs.List ref={ref}>
            <Tabs.Tab tabId="tab1">Tab 1</Tabs.Tab>
          </Tabs.List>
        </Tabs>
      );
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });

    it('should forward ref to Tabs.Tab', () => {
      const ref = React.createRef<HTMLButtonElement>();
      const handleChange = jest.fn();
      render(
        <Tabs activeTab="tab1" onTabChange={handleChange}>
          <Tabs.List>
            <Tabs.Tab tabId="tab1" ref={ref}>
              Tab 1
            </Tabs.Tab>
          </Tabs.List>
        </Tabs>
      );
      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });

    it('should forward ref to Tabs.Panel', () => {
      const ref = React.createRef<HTMLDivElement>();
      const handleChange = jest.fn();
      render(
        <Tabs activeTab="tab1" onTabChange={handleChange}>
          <Tabs.List>
            <Tabs.Tab tabId="tab1">Tab 1</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel tabId="tab1" ref={ref}>
            Content
          </Tabs.Panel>
        </Tabs>
      );
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe('error handling', () => {
    it('should throw error when Tabs.Tab is used outside Tabs context', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<Tabs.Tab tabId="tab1">Tab 1</Tabs.Tab>);
      }).toThrow('Tabs compound components must be used within a Tabs component');

      consoleSpy.mockRestore();
    });

    it('should throw error when Tabs.Panel is used outside Tabs context', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<Tabs.Panel tabId="tab1">Content</Tabs.Panel>);
      }).toThrow('Tabs compound components must be used within a Tabs component');

      consoleSpy.mockRestore();
    });
  });
});

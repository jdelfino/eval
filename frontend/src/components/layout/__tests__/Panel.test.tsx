/**
 * Tests for Panel component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Panel } from '../Panel';

// Mock usePanelState
const mockTogglePanel = jest.fn();
const mockIsPanelExpanded = jest.fn();

jest.mock('@/contexts/PanelContext', () => ({
  usePanelState: () => ({
    togglePanel: mockTogglePanel,
    isPanelExpanded: mockIsPanelExpanded,
  }),
}));

describe('Panel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsPanelExpanded.mockReturnValue(true);
  });

  /**
   * Helper to get the panel header element (the div with role="button")
   */
  function getPanelHeader() {
    const container = screen.getByTestId('panel-test-panel');
    return container.querySelector('[role="button"][aria-controls]');
  }

  describe('rendering', () => {
    it('renders panel with title', () => {
      render(
        <Panel id="test-panel" title="Test Panel">
          <div>Content</div>
        </Panel>
      );

      expect(screen.getByText('Test Panel')).toBeInTheDocument();
    });

    it('renders children when expanded', () => {
      mockIsPanelExpanded.mockReturnValue(true);

      render(
        <Panel id="test-panel" title="Test Panel">
          <div>Panel Content</div>
        </Panel>
      );

      expect(screen.getByText('Panel Content')).toBeInTheDocument();
    });

    it('has data-testid with panel id', () => {
      render(
        <Panel id="my-panel" title="Test Panel">
          <div>Content</div>
        </Panel>
      );

      expect(screen.getByTestId('panel-my-panel')).toBeInTheDocument();
    });
  });

  describe('expand/collapse state', () => {
    it('shows expanded state with aria-expanded true', () => {
      mockIsPanelExpanded.mockReturnValue(true);

      render(
        <Panel id="test-panel" title="Test Panel">
          <div>Content</div>
        </Panel>
      );

      const header = getPanelHeader();
      expect(header).toHaveAttribute('aria-expanded', 'true');
    });

    it('shows collapsed state with aria-expanded false', () => {
      mockIsPanelExpanded.mockReturnValue(false);

      render(
        <Panel id="test-panel" title="Test Panel">
          <div>Content</div>
        </Panel>
      );

      const header = getPanelHeader();
      expect(header).toHaveAttribute('aria-expanded', 'false');
    });

    it('hides content when collapsed', () => {
      mockIsPanelExpanded.mockReturnValue(false);

      render(
        <Panel id="test-panel" title="Test Panel">
          <div>Content</div>
        </Panel>
      );

      const contentContainer = document.getElementById('panel-content-test-panel');
      expect(contentContainer).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('toggle functionality', () => {
    it('calls togglePanel when header is clicked', () => {
      render(
        <Panel id="test-panel" title="Test Panel">
          <div>Content</div>
        </Panel>
      );

      const header = getPanelHeader();
      fireEvent.click(header!);

      expect(mockTogglePanel).toHaveBeenCalledWith('test-panel');
    });

    it('calls togglePanel when toggle button is clicked', () => {
      mockIsPanelExpanded.mockReturnValue(true);

      render(
        <Panel id="test-panel" title="Test Panel">
          <div>Content</div>
        </Panel>
      );

      const toggleButton = screen.getByRole('button', { name: /collapse test panel/i });
      fireEvent.click(toggleButton);

      expect(mockTogglePanel).toHaveBeenCalledWith('test-panel');
    });

    it('responds to Enter key on header', () => {
      render(
        <Panel id="test-panel" title="Test Panel">
          <div>Content</div>
        </Panel>
      );

      const header = getPanelHeader();
      fireEvent.keyDown(header!, { key: 'Enter' });

      expect(mockTogglePanel).toHaveBeenCalledWith('test-panel');
    });

    it('responds to Space key on header', () => {
      render(
        <Panel id="test-panel" title="Test Panel">
          <div>Content</div>
        </Panel>
      );

      const header = getPanelHeader();
      fireEvent.keyDown(header!, { key: ' ' });

      expect(mockTogglePanel).toHaveBeenCalledWith('test-panel');
    });
  });

  describe('loading state', () => {
    it('shows loading spinner when isLoading is true', () => {
      render(
        <Panel id="test-panel" title="Test Panel" isLoading>
          <div>Content</div>
        </Panel>
      );

      // Find the spinner by its class
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('hides content when isLoading is true', () => {
      render(
        <Panel id="test-panel" title="Test Panel" isLoading>
          <div>Should Not Show</div>
        </Panel>
      );

      expect(screen.queryByText('Should Not Show')).not.toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has aria-controls linking header to content', () => {
      render(
        <Panel id="test-panel" title="Test Panel">
          <div>Content</div>
        </Panel>
      );

      const header = getPanelHeader();
      expect(header).toHaveAttribute('aria-controls', 'panel-content-test-panel');
    });

    it('has appropriate aria-label on toggle button when expanded', () => {
      mockIsPanelExpanded.mockReturnValue(true);

      render(
        <Panel id="test-panel" title="Test Panel">
          <div>Content</div>
        </Panel>
      );

      expect(screen.getByRole('button', { name: /collapse test panel/i })).toBeInTheDocument();
    });

    it('has appropriate aria-label on toggle button when collapsed', () => {
      mockIsPanelExpanded.mockReturnValue(false);

      render(
        <Panel id="test-panel" title="Test Panel">
          <div>Content</div>
        </Panel>
      );

      expect(screen.getByRole('button', { name: /expand test panel/i })).toBeInTheDocument();
    });
  });
});

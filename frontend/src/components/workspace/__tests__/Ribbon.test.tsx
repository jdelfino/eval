/**
 * Unit tests for the Ribbon component.
 * @jest-environment jsdom
 *
 * Contract: Ribbon is a collapsible statement banner. Collapsed = 36px peek strip with first-line
 * preview; expanded = full markdown body in a max-height 280 scrollable region. Toggling fires
 * onToggle. Meta appears next to title when provided.
 * Regressions here break the primary way students read problem statements.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Ribbon } from '../Ribbon';

// Mock MarkdownContent to keep Ribbon tests focused on its own behavior
jest.mock('@/components/MarkdownContent', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => (
    <div data-testid="markdown-content">{content}</div>
  ),
}));

describe('Ribbon', () => {
  const baseProps = {
    open: false,
    onToggle: jest.fn(),
    title: 'Two Sum',
    body: '# Title\n\nFirst line of statement…',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('collapsed state', () => {
    /**
     * Contract: collapsed (open=false) renders a 36px strip showing the first-line preview
     * (non-heading content from the body). Click on the outer element fires onToggle.
     * Breaking this means the ribbon doesn't show a useful preview or can't be opened.
     */
    it('renders 36px peek with first-line preview when open=false', () => {
      const { container } = render(<Ribbon {...baseProps} open={false} />);
      const outer = container.firstChild as HTMLElement;
      expect(outer).toHaveStyle({ maxHeight: '36px' });
    });

    it('shows first-line preview text in collapsed state', () => {
      render(<Ribbon {...baseProps} open={false} body="# Title\n\nFirst line of statement…" />);
      // Should show the first non-empty non-heading line
      expect(screen.getByText(/First line of statement/)).toBeInTheDocument();
    });

    it('fires onToggle when header area is clicked', () => {
      const onToggle = jest.fn();
      render(<Ribbon {...baseProps} onToggle={onToggle} open={false} />);
      // The header row is the clickable toggle area (has the onClick handler)
      const header = screen.getByText('Two Sum').closest('[style]') as HTMLElement;
      fireEvent.click(header!);
      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe('expanded state', () => {
    /**
     * Contract: open=true renders full markdown body via MarkdownContent, max-height transitions
     * to 280. Breaking this means users can't read the full problem statement.
     */
    it('renders with max-height 280 when open=true', () => {
      const { container } = render(<Ribbon {...baseProps} open={true} />);
      const outer = container.firstChild as HTMLElement;
      expect(outer).toHaveStyle({ maxHeight: '280px' });
    });

    it('renders MarkdownContent with full body when open=true', () => {
      const body = '# Title\n\nFull markdown body here';
      render(<Ribbon {...baseProps} open={true} body={body} />);
      expect(screen.getByTestId('markdown-content')).toBeInTheDocument();
      // MarkdownContent mock renders content prop as text; normalize whitespace for comparison
      expect(screen.getByTestId('markdown-content')).toHaveTextContent(/Full markdown body here/);
    });
  });

  describe('title and meta', () => {
    it('renders title in header', () => {
      render(<Ribbon {...baseProps} title="Two Sum" />);
      expect(screen.getByText('Two Sum')).toBeInTheDocument();
    });

    it('renders meta next to title when provided', () => {
      render(<Ribbon {...baseProps} meta="Python · updated yesterday" />);
      expect(screen.getByText(/Python · updated yesterday/)).toBeInTheDocument();
    });

    it('does not render meta when not provided', () => {
      render(<Ribbon {...baseProps} />);
      expect(screen.queryByText(/Python/)).not.toBeInTheDocument();
    });
  });

  describe('decorative Kbd', () => {
    it('renders ⌘1 Kbd element in the header', () => {
      render(<Ribbon {...baseProps} />);
      expect(screen.getByText('⌘1')).toBeInTheDocument();
    });
  });
});

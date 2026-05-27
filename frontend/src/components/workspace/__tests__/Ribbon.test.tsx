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
      // The header row has data-testid="ribbon-header" with the onClick handler
      const header = screen.getByTestId('ribbon-header');
      fireEvent.click(header);
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

  describe('click-to-edit title (editable prop)', () => {
    /**
     * Contract: when editable=true, hovering the title reveals a pencil glyph and a dashed
     * underline affordance. Clicking switches to an <input>. Enter/blur commits via onTitleChange;
     * Esc reverts. stopPropagation prevents the ribbon-header onToggle from firing concurrently.
     * Breaking any of these means authors cannot rename assignments inline.
     */

    it('TC1: shows pencil glyph and dashed-underline on title hover when editable=true', () => {
      render(
        <Ribbon
          {...baseProps}
          title="Two Sum"
          editable={true}
          onTitleChange={jest.fn()}
        />
      );
      const titleWrapper = screen.getByTestId('ribbon-title-wrapper');
      fireEvent.mouseEnter(titleWrapper);
      expect(screen.getByTestId('ribbon-title-pencil')).toBeInTheDocument();
      expect(titleWrapper).toHaveStyle({ borderBottom: '1px dashed var(--border)' });
    });

    it('TC2: non-editable Ribbon has no pencil glyph and no dashed underline on hover', () => {
      render(<Ribbon {...baseProps} title="Two Sum" editable={false} />);
      // Even if there were a wrapper, no pencil should appear
      expect(screen.queryByTestId('ribbon-title-pencil')).not.toBeInTheDocument();
      // No dashed-border element either — title is rendered as plain span
      const titleEl = screen.getByText('Two Sum');
      expect(titleEl).not.toHaveStyle({ borderBottom: '1px dashed var(--border)' });
    });

    it('TC3: click→type→Enter commits via onTitleChange and updates rendered title', () => {
      const onTitleChange = jest.fn();
      render(
        <Ribbon
          {...baseProps}
          title="Two Sum"
          editable={true}
          onTitleChange={onTitleChange}
        />
      );
      const titleWrapper = screen.getByTestId('ribbon-title-wrapper');
      fireEvent.click(titleWrapper);

      const input = screen.getByRole('textbox', { name: /edit title/i });
      fireEvent.change(input, { target: { value: 'New Title' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onTitleChange).toHaveBeenCalledTimes(1);
      expect(onTitleChange).toHaveBeenCalledWith('New Title');
      // Input should be gone; title text should be updated
      expect(screen.queryByRole('textbox', { name: /edit title/i })).not.toBeInTheDocument();
      expect(screen.getByText('New Title')).toBeInTheDocument();
    });

    it('TC4: click→type→Esc reverts without firing onTitleChange', () => {
      const onTitleChange = jest.fn();
      render(
        <Ribbon
          {...baseProps}
          title="Old Title"
          editable={true}
          onTitleChange={onTitleChange}
        />
      );
      const titleWrapper = screen.getByTestId('ribbon-title-wrapper');
      fireEvent.click(titleWrapper);

      const input = screen.getByRole('textbox', { name: /edit title/i });
      fireEvent.change(input, { target: { value: 'Other Title' } });
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(onTitleChange).not.toHaveBeenCalled();
      expect(screen.queryByRole('textbox', { name: /edit title/i })).not.toBeInTheDocument();
      expect(screen.getByText('Old Title')).toBeInTheDocument();
    });

    it('TC5: blur commits like Enter', () => {
      const onTitleChange = jest.fn();
      render(
        <Ribbon
          {...baseProps}
          title="Two Sum"
          editable={true}
          onTitleChange={onTitleChange}
        />
      );
      const titleWrapper = screen.getByTestId('ribbon-title-wrapper');
      fireEvent.click(titleWrapper);

      const input = screen.getByRole('textbox', { name: /edit title/i });
      fireEvent.change(input, { target: { value: 'Blurred Title' } });
      fireEvent.blur(input);

      expect(onTitleChange).toHaveBeenCalledTimes(1);
      expect(onTitleChange).toHaveBeenCalledWith('Blurred Title');
    });

    it('TC6: empty value commit is prevented — onTitleChange not called, title reverts', () => {
      const onTitleChange = jest.fn();
      render(
        <Ribbon
          {...baseProps}
          title="Two Sum"
          editable={true}
          onTitleChange={onTitleChange}
        />
      );
      const titleWrapper = screen.getByTestId('ribbon-title-wrapper');
      fireEvent.click(titleWrapper);

      const input = screen.getByRole('textbox', { name: /edit title/i });
      fireEvent.change(input, { target: { value: '' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onTitleChange).not.toHaveBeenCalled();
      expect(screen.queryByRole('textbox', { name: /edit title/i })).not.toBeInTheDocument();
      expect(screen.getByText('Two Sum')).toBeInTheDocument();
    });

    it('TC7: title click does NOT fire ribbon onToggle (stopPropagation)', () => {
      const onToggle = jest.fn();
      render(
        <Ribbon
          {...baseProps}
          title="Two Sum"
          editable={true}
          onTitleChange={jest.fn()}
          onToggle={onToggle}
        />
      );
      const titleWrapper = screen.getByTestId('ribbon-title-wrapper');
      fireEvent.click(titleWrapper);

      expect(onToggle).not.toHaveBeenCalled();
    });
  });
});

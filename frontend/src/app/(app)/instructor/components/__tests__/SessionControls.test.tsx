/**
 * Unit tests for SessionControls component.
 *
 * Under the section-pointer model (T1) the destructive control is "End class",
 * which clears the section pointer via clearSectionCurrentSession (NOT
 * endSession/completeSession — those are retired from the live path). The
 * ConfirmDialog gate and the copyable join code are preserved.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SessionControls from '../SessionControls';

const mockClearSectionCurrentSession = jest.fn();

jest.mock('@/lib/api/sections', () => ({
  clearSectionCurrentSession: (...args: unknown[]) => mockClearSectionCurrentSession(...args),
}));

describe('SessionControls', () => {
  const mockOnEndSession = jest.fn();

  const defaultProps = {
    session_id: 'session-123',
    sectionId: 'section-1',
    onEndSession: mockOnEndSession,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockClearSectionCurrentSession.mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
  });

  it('should render session controls', () => {
    render(<SessionControls {...defaultProps} />);

    expect(screen.queryByText('Active Session')).not.toBeInTheDocument();
    expect(screen.getByTestId('end-class-button')).toBeInTheDocument();
  });

  it('should display section name when provided', () => {
    render(<SessionControls {...defaultProps} section_name="Section A - MWF 10am" />);

    expect(screen.getByText('Section A - MWF 10am')).toBeInTheDocument();
  });

  it('should not display section name when not provided', () => {
    render(<SessionControls {...defaultProps} />);

    expect(screen.queryByText(/Section/)).not.toBeInTheDocument();
  });

  it('should render the End class button', () => {
    render(<SessionControls {...defaultProps} />);

    expect(screen.getByRole('button', { name: /End class/ })).toBeInTheDocument();
  });

  it('should apply flex-wrap to the button container for mobile responsiveness', () => {
    const { container } = render(<SessionControls {...defaultProps} />);

    const buttonContainer = container.querySelector('.flex.gap-2');
    expect(buttonContainer).toBeInTheDocument();
    expect(buttonContainer).toHaveClass('flex-wrap');
  });

  describe('compact layout', () => {
    it('should use compact padding (px-4 py-2) instead of large padding (p-6)', () => {
      const { container } = render(<SessionControls {...defaultProps} />);

      const outerDiv = container.firstChild as HTMLElement;
      expect(outerDiv).toHaveClass('px-4');
      expect(outerDiv).toHaveClass('py-2');
      expect(outerDiv).not.toHaveClass('p-6');
    });

    it('should not render "Active Session" heading', () => {
      render(<SessionControls {...defaultProps} />);

      expect(screen.queryByRole('heading', { name: /Active Session/ })).not.toBeInTheDocument();
    });

    it('should render join code badge when join_code is provided', () => {
      render(<SessionControls {...defaultProps} join_code="ABC123" />);

      expect(screen.getByText(/Join Code: ABC123/)).toBeInTheDocument();
    });

    it('should render the join code in a mono font', () => {
      render(<SessionControls {...defaultProps} join_code="ABC123" />);

      // The copyable join code control carries the mono styling.
      const copyBtn = screen.getByTestId('session-controls-copy-code');
      expect(copyBtn).toHaveClass('font-mono');
    });

    it('should copy the join code to the clipboard when clicked', async () => {
      render(<SessionControls {...defaultProps} join_code="ABC123" />);

      fireEvent.click(screen.getByTestId('session-controls-copy-code'));

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ABC123');
      });
    });

    it('should render problem title when provided', () => {
      render(<SessionControls {...defaultProps} problemTitle="Two Sum" />);

      expect(screen.getByText('Two Sum')).toBeInTheDocument();
    });

    it('should render section name when provided', () => {
      render(<SessionControls {...defaultProps} section_name="Section B" />);

      expect(screen.getByText('Section B')).toBeInTheDocument();
    });

    it('should render exactly 3 action buttons when onClearPublicView is provided', () => {
      render(
        <SessionControls
          {...defaultProps}
          onClearPublicView={jest.fn()}
        />
      );

      expect(screen.getByRole('button', { name: /Open Public View/ })).toBeInTheDocument();
      expect(screen.getByTestId('clear-public-view-button')).toBeInTheDocument();
      expect(screen.getByTestId('end-class-button')).toBeInTheDocument();
    });

    it('should not render Show Solution button', () => {
      render(<SessionControls {...defaultProps} />);

      expect(screen.queryByTestId('show-solution-button')).not.toBeInTheDocument();
    });

    it('should not render View Solution button', () => {
      render(<SessionControls {...defaultProps} />);

      expect(screen.queryByTestId('view-solution-button')).not.toBeInTheDocument();
    });
  });

  describe('Open Public View', () => {
    it('opens the public view window with the session id', () => {
      const openSpy = jest.spyOn(window, 'open').mockReturnValue(null);

      render(<SessionControls {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: /Open Public View/ }));

      expect(openSpy).toHaveBeenCalledWith(
        '/public-view?session_id=session-123',
        '_blank',
        'width=1200,height=800'
      );
      openSpy.mockRestore();
    });
  });

  describe('End class confirmation dialog', () => {
    it('should show confirmation dialog when End class button is clicked', () => {
      render(<SessionControls {...defaultProps} />);

      fireEvent.click(screen.getByTestId('end-class-button'));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'End class' })).toBeInTheDocument();
    });

    it('should not clear the section pointer immediately when End class is clicked', () => {
      render(<SessionControls {...defaultProps} />);

      fireEvent.click(screen.getByTestId('end-class-button'));

      expect(mockClearSectionCurrentSession).not.toHaveBeenCalled();
      expect(mockOnEndSession).not.toHaveBeenCalled();
    });

    it('should clear the section pointer (not complete the session) on confirm', async () => {
      render(<SessionControls {...defaultProps} />);

      fireEvent.click(screen.getByTestId('end-class-button'));
      const confirmButton = document.querySelector('[data-confirm-button]') as HTMLElement;
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockClearSectionCurrentSession).toHaveBeenCalledWith('section-1');
      });
      await waitFor(() => {
        expect(mockOnEndSession).toHaveBeenCalledTimes(1);
      });
    });

    it('should use the End-class confirm copy', () => {
      render(<SessionControls {...defaultProps} />);

      fireEvent.click(screen.getByTestId('end-class-button'));

      expect(
        screen.getByText(/students will no longer be pulled into this problem/)
      ).toBeInTheDocument();
    });

    it('should close dialog when cancel is clicked', () => {
      render(<SessionControls {...defaultProps} />);

      fireEvent.click(screen.getByTestId('end-class-button'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mockClearSectionCurrentSession).not.toHaveBeenCalled();
      expect(mockOnEndSession).not.toHaveBeenCalled();
    });

    it('should close dialog on Escape key press', () => {
      render(<SessionControls {...defaultProps} />);

      fireEvent.click(screen.getByTestId('end-class-button'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mockClearSectionCurrentSession).not.toHaveBeenCalled();
    });

    it('should show Clear Public View button when onClearPublicView is provided', () => {
      const mockOnClearPublicView = jest.fn();
      render(
        <SessionControls
          {...defaultProps}
          onClearPublicView={mockOnClearPublicView}
        />
      );

      const clearBtn = screen.getByTestId('clear-public-view-button');
      expect(clearBtn).toBeInTheDocument();
      fireEvent.click(clearBtn);
      expect(mockOnClearPublicView).toHaveBeenCalledTimes(1);
    });

    it('should not show Clear Public View button when onClearPublicView is not provided', () => {
      render(<SessionControls {...defaultProps} />);

      expect(screen.queryByTestId('clear-public-view-button')).not.toBeInTheDocument();
    });
  });

  describe('problem title display', () => {
    it('should display problem title when provided', () => {
      render(<SessionControls {...defaultProps} problemTitle="Two Sum" />);

      expect(screen.getByText('Two Sum')).toBeInTheDocument();
    });

    it('should not display problem title when not provided', () => {
      render(<SessionControls {...defaultProps} />);

      expect(screen.queryByText('Two Sum')).not.toBeInTheDocument();
    });
  });

  describe('End class confirm button styling', () => {
    it('should use danger variant for the confirm button', () => {
      render(<SessionControls {...defaultProps} />);

      fireEvent.click(screen.getByTestId('end-class-button'));

      const confirmButton = document.querySelector('[data-confirm-button]') as HTMLElement;
      expect(confirmButton).toHaveClass('bg-red-600');
    });
  });
});

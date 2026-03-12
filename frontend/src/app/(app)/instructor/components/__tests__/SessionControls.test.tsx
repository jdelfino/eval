/**
 * Unit tests for SessionControls component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SessionControls from '../SessionControls';

describe('SessionControls', () => {
  const mockOnEndSession = jest.fn();

  const defaultProps = {
    session_id: 'session-123',
    onEndSession: mockOnEndSession,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render session controls', () => {
    render(<SessionControls {...defaultProps} />);

    expect(screen.getByText('Active Session')).toBeInTheDocument();
  });

  it('should display section name when provided', () => {
    render(<SessionControls {...defaultProps} section_name="Section A - MWF 10am" />);

    expect(screen.getByText('Active Session')).toBeInTheDocument();
    expect(screen.getByText('Section A - MWF 10am')).toBeInTheDocument();
  });

  it('should not display section name when not provided', () => {
    render(<SessionControls {...defaultProps} />);

    expect(screen.queryByText(/Section/)).not.toBeInTheDocument();
  });

  it('should render End Session button', () => {
    render(<SessionControls {...defaultProps} />);

    expect(screen.getByRole('button', { name: /End Session/ })).toBeInTheDocument();
  });

  it('should apply flex-wrap to the button container for mobile responsiveness', () => {
    const { container } = render(<SessionControls {...defaultProps} />);

    // The button container should have flex-wrap so buttons wrap on small screens
    const buttonContainer = container.querySelector('.flex.gap-2');
    expect(buttonContainer).toBeInTheDocument();
    expect(buttonContainer).toHaveClass('flex-wrap');
  });

  describe('End Session confirmation dialog', () => {
    it('should show confirmation dialog when End Session button is clicked', () => {
      render(<SessionControls {...defaultProps} />);

      // Click End Session button
      const endButton = screen.getByRole('button', { name: /End Session/ });
      fireEvent.click(endButton);

      // Confirmation dialog should appear
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'End Session' })).toBeInTheDocument();
    });

    it('should not call onEndSession immediately when End Session button is clicked', () => {
      render(<SessionControls {...defaultProps} />);

      const endButton = screen.getByRole('button', { name: /End Session/ });
      fireEvent.click(endButton);

      // onEndSession should NOT be called yet
      expect(mockOnEndSession).not.toHaveBeenCalled();
    });

    it('should call onEndSession when confirmation dialog is confirmed', () => {
      render(<SessionControls {...defaultProps} />);

      // Click End Session to open dialog
      const endButton = screen.getByRole('button', { name: /End Session/ });
      fireEvent.click(endButton);

      // There are now two "End Session" buttons - get the dialog's confirm button using data attribute
      const confirmButton = document.querySelector('[data-confirm-button]') as HTMLElement;
      fireEvent.click(confirmButton);

      expect(mockOnEndSession).toHaveBeenCalledTimes(1);
    });

    it('should close dialog when cancel is clicked', () => {
      render(<SessionControls {...defaultProps} />);

      // Click End Session to open dialog
      const endButton = screen.getByRole('button', { name: /End Session/ });
      fireEvent.click(endButton);

      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Click cancel button
      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      fireEvent.click(cancelButton);

      // Dialog should be closed
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mockOnEndSession).not.toHaveBeenCalled();
    });

    it('should show message about connected students when count is provided', () => {
      render(<SessionControls {...defaultProps} connectedStudentCount={5} />);

      // Click End Session to open dialog
      const endButton = screen.getByRole('button', { name: /End Session/ });
      fireEvent.click(endButton);

      expect(screen.getByText(/5 students are currently connected/)).toBeInTheDocument();
    });

    it('should show singular message for one connected student', () => {
      render(<SessionControls {...defaultProps} connectedStudentCount={1} />);

      // Click End Session to open dialog
      const endButton = screen.getByRole('button', { name: /End Session/ });
      fireEvent.click(endButton);

      expect(screen.getByText(/1 student is currently connected/)).toBeInTheDocument();
    });

    it('should show generic message when no students are connected', () => {
      render(<SessionControls {...defaultProps} connectedStudentCount={0} />);

      // Click End Session to open dialog
      const endButton = screen.getByRole('button', { name: /End Session/ });
      fireEvent.click(endButton);

      expect(screen.getByText(/Are you sure you want to end this session\?/)).toBeInTheDocument();
    });

    it('should close dialog on Escape key press', () => {
      render(<SessionControls {...defaultProps} />);

      // Click End Session to open dialog
      const endButton = screen.getByRole('button', { name: /End Session/ });
      fireEvent.click(endButton);

      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Press Escape
      fireEvent.keyDown(document, { key: 'Escape' });

      // Dialog should be closed
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mockOnEndSession).not.toHaveBeenCalled();
    });

    it('should show Clear Public View button when featured_student_id is set', () => {
      const mockOnClearPublicView = jest.fn();
      render(
        <SessionControls
          {...defaultProps}
          featured_student_id="student-1"
          onClearPublicView={mockOnClearPublicView}
        />
      );

      const clearBtn = screen.getByTestId('clear-public-view-button');
      expect(clearBtn).toBeInTheDocument();
      fireEvent.click(clearBtn);
      expect(mockOnClearPublicView).toHaveBeenCalledTimes(1);
    });

    it('should show Clear Public View button when onClearPublicView is provided', () => {
      render(
        <SessionControls
          {...defaultProps}
          onClearPublicView={jest.fn()}
        />
      );

      expect(screen.getByTestId('clear-public-view-button')).toBeInTheDocument();
    });

    it('should not show Clear Public View button when onClearPublicView is not provided', () => {
      render(
        <SessionControls
          {...defaultProps}
        />
      );

      expect(screen.queryByTestId('clear-public-view-button')).not.toBeInTheDocument();
    });

    it('should not show Show Solution button when no problem solution exists', () => {
      render(
        <SessionControls
          {...defaultProps}
          problemSolution={undefined}
        />
      );

      expect(screen.queryByTestId('show-solution-button')).not.toBeInTheDocument();
    });

    it('should not show Show Solution button when solution is empty string', () => {
      render(
        <SessionControls
          {...defaultProps}
          problemSolution=""
        />
      );

      expect(screen.queryByTestId('show-solution-button')).not.toBeInTheDocument();
    });

    it('should show Show Solution button when problem has a solution and onShowSolution is provided', () => {
      const mockOnShowSolution = jest.fn();
      render(
        <SessionControls
          {...defaultProps}
          problemSolution="print('answer')"
          onShowSolution={mockOnShowSolution}
        />
      );

      const btn = screen.getByTestId('show-solution-button');
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveTextContent('Show Solution');
    });

    it('should call onShowSolution on click', () => {
      const mockOnShowSolution = jest.fn();
      render(
        <SessionControls
          {...defaultProps}
          problemSolution="print('answer')"
          onShowSolution={mockOnShowSolution}
        />
      );

      const btn = screen.getByTestId('show-solution-button');
      fireEvent.click(btn);
      expect(mockOnShowSolution).toHaveBeenCalled();
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

  describe('View Solution modal', () => {
    it('should show View Solution button when solution exists', () => {
      render(
        <SessionControls
          {...defaultProps}
          problemSolution="print('answer')"
          onShowSolution={jest.fn()}
        />
      );

      expect(screen.getByTestId('view-solution-button')).toBeInTheDocument();
    });

    it('should not show View Solution button when no solution', () => {
      render(<SessionControls {...defaultProps} />);

      expect(screen.queryByTestId('view-solution-button')).not.toBeInTheDocument();
    });

    it('should open solution viewer modal when View Solution clicked', () => {
      render(
        <SessionControls
          {...defaultProps}
          problemSolution="print('answer')"
          onShowSolution={jest.fn()}
        />
      );

      fireEvent.click(screen.getByTestId('view-solution-button'));

      expect(screen.getByTestId('solution-viewer-modal')).toBeInTheDocument();
    });

    it('should display solution code in the modal', () => {
      render(
        <SessionControls
          {...defaultProps}
          problemSolution="print('answer')"
          onShowSolution={jest.fn()}
        />
      );

      fireEvent.click(screen.getByTestId('view-solution-button'));

      expect(screen.getByText("print('answer')")).toBeInTheDocument();
    });

    it('should close modal when Close button clicked', () => {
      render(
        <SessionControls
          {...defaultProps}
          problemSolution="print('answer')"
          onShowSolution={jest.fn()}
        />
      );

      fireEvent.click(screen.getByTestId('view-solution-button'));
      expect(screen.getByTestId('solution-viewer-modal')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(screen.queryByTestId('solution-viewer-modal')).not.toBeInTheDocument();
    });

    it('should close modal on Escape key', () => {
      render(
        <SessionControls
          {...defaultProps}
          problemSolution="print('answer')"
          onShowSolution={jest.fn()}
        />
      );

      fireEvent.click(screen.getByTestId('view-solution-button'));
      expect(screen.getByTestId('solution-viewer-modal')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByTestId('solution-viewer-modal')).not.toBeInTheDocument();
    });

    it('should not call onShowSolution when View Solution is clicked (private view only)', () => {
      const mockOnShowSolution = jest.fn();
      render(
        <SessionControls
          {...defaultProps}
          problemSolution="print('answer')"
          onShowSolution={mockOnShowSolution}
        />
      );

      fireEvent.click(screen.getByTestId('view-solution-button'));
      expect(mockOnShowSolution).not.toHaveBeenCalled();
    });
  });

  describe('End Session confirmation dialog', () => {
    it('should use danger variant for the confirm button', () => {
      render(<SessionControls {...defaultProps} />);

      // Click End Session to open dialog
      const endButton = screen.getByRole('button', { name: /End Session/ });
      fireEvent.click(endButton);

      // The confirm button in the dialog should have danger styling
      const dialogButtons = screen.getAllByRole('button', { name: /End Session/ });
      const confirmButton = dialogButtons[1]; // Dialog's confirm button
      expect(confirmButton).toHaveClass('bg-red-600');
    });
  });
});

/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import SessionEndedNotification from '../SessionEndedNotification';

describe('SessionEndedNotification', () => {
  const mockOnLeaveToDashboard = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('basic rendering', () => {
    it('renders the session ended notification as a banner', () => {
      render(
        <SessionEndedNotification
          onLeaveToDashboard={mockOnLeaveToDashboard}
        />
      );

      expect(screen.getByTestId('session-ended-notification')).toBeInTheDocument();
    });

    it('displays inline message about session being ended', () => {
      render(
        <SessionEndedNotification
          onLeaveToDashboard={mockOnLeaveToDashboard}
        />
      );

      expect(screen.getByText(/Session ended/)).toBeInTheDocument();
      expect(screen.getByText(/code execution is disabled/)).toBeInTheDocument();
    });

    it('includes code saved message when codeSaved is true', () => {
      render(
        <SessionEndedNotification
          onLeaveToDashboard={mockOnLeaveToDashboard}
          codeSaved={true}
        />
      );

      expect(screen.getByText(/Your code has been saved/)).toBeInTheDocument();
    });

    it('omits code saved message when codeSaved is false', () => {
      render(
        <SessionEndedNotification
          onLeaveToDashboard={mockOnLeaveToDashboard}
          codeSaved={false}
        />
      );

      expect(screen.queryByText(/Your code has been saved/)).not.toBeInTheDocument();
    });
  });

  describe('Back to Sections button', () => {
    it('renders the Back to Sections button', () => {
      render(
        <SessionEndedNotification
          onLeaveToDashboard={mockOnLeaveToDashboard}
        />
      );

      expect(screen.getByTestId('go-to-dashboard-button')).toBeInTheDocument();
      expect(screen.getByText('Back to Sections')).toBeInTheDocument();
    });

    it('calls onLeaveToDashboard when button is clicked', () => {
      render(
        <SessionEndedNotification
          onLeaveToDashboard={mockOnLeaveToDashboard}
        />
      );

      fireEvent.click(screen.getByTestId('go-to-dashboard-button'));
      expect(mockOnLeaveToDashboard).toHaveBeenCalledTimes(1);
    });
  });

  describe('Copy Code button', () => {
    it('does not show Copy Code button when no code is provided', () => {
      render(
        <SessionEndedNotification
          onLeaveToDashboard={mockOnLeaveToDashboard}
        />
      );

      expect(screen.queryByTestId('copy-code-button')).not.toBeInTheDocument();
    });

    it('does not show Copy Code button when code is empty string', () => {
      render(
        <SessionEndedNotification
          onLeaveToDashboard={mockOnLeaveToDashboard}
          code=""
        />
      );

      expect(screen.queryByTestId('copy-code-button')).not.toBeInTheDocument();
    });

    it('shows Copy Code button when code is provided', () => {
      render(
        <SessionEndedNotification
          onLeaveToDashboard={mockOnLeaveToDashboard}
          code="print('hello world')"
        />
      );

      expect(screen.getByTestId('copy-code-button')).toBeInTheDocument();
      expect(screen.getByText('Copy Code')).toBeInTheDocument();
    });

    it('copies code to clipboard when Copy Code button is clicked', async () => {
      const testCode = "print('hello world')";
      render(
        <SessionEndedNotification
          onLeaveToDashboard={mockOnLeaveToDashboard}
          code={testCode}
        />
      );

      fireEvent.click(screen.getByTestId('copy-code-button'));

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(testCode);
      });
    });

    it('shows Copied! message after successful copy', async () => {
      jest.useFakeTimers();
      const testCode = "print('hello world')";
      render(
        <SessionEndedNotification
          onLeaveToDashboard={mockOnLeaveToDashboard}
          code={testCode}
        />
      );

      fireEvent.click(screen.getByTestId('copy-code-button'));

      await waitFor(() => {
        expect(screen.getByText('Copied!')).toBeInTheDocument();
      });

      // The button should revert after 2 seconds
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      await waitFor(() => {
        expect(screen.getByText('Copy Code')).toBeInTheDocument();
      });
    });

    it('handles clipboard API failure gracefully with fallback', async () => {
      // Mock clipboard failure
      const clipboardError = new Error('Clipboard not available');
      Object.assign(navigator, {
        clipboard: {
          writeText: jest.fn().mockRejectedValue(clipboardError),
        },
      });

      // Mock document.execCommand for fallback
      const mockExecCommand = jest.fn().mockReturnValue(true);
      document.execCommand = mockExecCommand;

      const testCode = "print('hello world')";
      render(
        <SessionEndedNotification
          onLeaveToDashboard={mockOnLeaveToDashboard}
          code={testCode}
        />
      );

      fireEvent.click(screen.getByTestId('copy-code-button'));

      await waitFor(() => {
        expect(mockExecCommand).toHaveBeenCalledWith('copy');
      });
    });
  });

  describe('banner styling', () => {
    it('renders as an inline banner (not an overlay)', () => {
      render(
        <SessionEndedNotification
          onLeaveToDashboard={mockOnLeaveToDashboard}
        />
      );

      const notification = screen.getByTestId('session-ended-notification');
      // Should NOT have overlay classes
      expect(notification.className).not.toContain('absolute');
      expect(notification.className).not.toContain('inset-0');
      // Should have banner styling
      expect(notification.className).toContain('rounded-md');
    });

    it('has appropriate aria attributes on icons', () => {
      render(
        <SessionEndedNotification
          onLeaveToDashboard={mockOnLeaveToDashboard}
          code="test"
        />
      );

      const svgs = document.querySelectorAll('svg[aria-hidden="true"]');
      expect(svgs.length).toBeGreaterThan(0);
    });

    it('uses semantic button elements', () => {
      render(
        <SessionEndedNotification
          onLeaveToDashboard={mockOnLeaveToDashboard}
          code="test"
        />
      );

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBe(2); // Copy Code and Back to Sections
    });
  });

  describe('no countdown behavior', () => {
    it('does not auto-redirect or show countdown', () => {
      render(
        <SessionEndedNotification
          onLeaveToDashboard={mockOnLeaveToDashboard}
        />
      );

      expect(screen.queryByTestId('countdown-message')).not.toBeInTheDocument();
      expect(screen.queryByText(/Returning to sections/)).not.toBeInTheDocument();
    });
  });

  describe('session replacement', () => {
    it('renders normal ended message without replacement', () => {
      render(
        <SessionEndedNotification
          onLeaveToDashboard={mockOnLeaveToDashboard}
          code="print('hello')"
        />
      );

      expect(screen.getByText(/Session ended/)).toBeInTheDocument();
      expect(screen.queryByTestId('join-new-session-button')).not.toBeInTheDocument();
    });

    it('renders Join New Session button when replacementSessionId is set', () => {
      render(
        <SessionEndedNotification
          onLeaveToDashboard={mockOnLeaveToDashboard}
          code="print('hello')"
          replacementSessionId="new-session-123"
          onJoinNewSession={jest.fn()}
        />
      );

      expect(screen.getByTestId('join-new-session-button')).toBeInTheDocument();
      expect(screen.getByText('Join New Session')).toBeInTheDocument();
      expect(screen.getByText(/instructor started a new problem/)).toBeInTheDocument();
    });

    it('calls onJoinNewSession when Join New Session button is clicked', () => {
      const onJoinNewSession = jest.fn();
      render(
        <SessionEndedNotification
          onLeaveToDashboard={mockOnLeaveToDashboard}
          code="print('hello')"
          replacementSessionId="new-session-123"
          onJoinNewSession={onJoinNewSession}
        />
      );

      fireEvent.click(screen.getByTestId('join-new-session-button'));
      expect(onJoinNewSession).toHaveBeenCalledTimes(1);
    });

    it('still shows Copy Code and Back to Sections as secondary actions with replacement', () => {
      render(
        <SessionEndedNotification
          onLeaveToDashboard={mockOnLeaveToDashboard}
          code="print('hello')"
          replacementSessionId="new-session-123"
          onJoinNewSession={jest.fn()}
        />
      );

      expect(screen.getByTestId('copy-code-button')).toBeInTheDocument();
      expect(screen.getByTestId('go-to-dashboard-button')).toBeInTheDocument();
    });
  });
});

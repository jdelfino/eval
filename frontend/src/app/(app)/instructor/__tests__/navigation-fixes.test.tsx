/**
 * @jest-environment jsdom
 */

/**
 * Tests for instructor navigation fixes (coding-tool-9ts and coding-tool-csw)
 * 
 * Verifies:
 * - Navigation bar is enabled during active sessions
 * - Instructors can leave session without ending it
 * - Sessions continue running when instructor navigates away
 * - Instructors can return to active sessions
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import InstructorNav from '../components/InstructorNav';

describe('InstructorNav - Navigation Fixes', () => {
  describe('Navigation enabled during sessions (coding-tool-9ts)', () => {
    it('should render all navigation buttons as enabled', () => {
      const onNavigate = jest.fn();
      const onReturnToSession = jest.fn();
      
      render(
        <InstructorNav
          currentView="session"
          onNavigate={onNavigate}
          activeSessionId="test-session-123"
          onReturnToSession={onReturnToSession}
        />
      );

      // All nav buttons should be clickable
      const classesButton = screen.getByRole('button', { name: /Classes/i });
      const sessionsButton = screen.getByRole('button', { name: /Sessions/i });
      const problemsButton = screen.getByRole('button', { name: /Problems/i });

      expect(classesButton).not.toBeDisabled();
      expect(sessionsButton).not.toBeDisabled();
      expect(problemsButton).not.toBeDisabled();
    });

    it('should allow navigation to classes while in session', () => {
      const onNavigate = jest.fn();
      const onReturnToSession = jest.fn();
      
      render(
        <InstructorNav
          currentView="session"
          onNavigate={onNavigate}
          activeSessionId="test-session-123"
          onReturnToSession={onReturnToSession}
        />
      );

      const classesButton = screen.getByRole('button', { name: /Classes/i });
      fireEvent.click(classesButton);

      expect(onNavigate).toHaveBeenCalledWith('classes');
    });

    it('should allow navigation to problems while in session', () => {
      const onNavigate = jest.fn();
      const onReturnToSession = jest.fn();
      
      render(
        <InstructorNav
          currentView="session"
          onNavigate={onNavigate}
          activeSessionId="test-session-123"
          onReturnToSession={onReturnToSession}
        />
      );

      const problemsButton = screen.getByRole('button', { name: /Problems/i });
      fireEvent.click(problemsButton);

      expect(onNavigate).toHaveBeenCalledWith('problems');
    });

    it('should allow navigation to sessions view while in session', () => {
      const onNavigate = jest.fn();
      const onReturnToSession = jest.fn();
      
      render(
        <InstructorNav
          currentView="session"
          onNavigate={onNavigate}
          activeSessionId="test-session-123"
          onReturnToSession={onReturnToSession}
        />
      );

      const sessionsButton = screen.getByRole('button', { name: /Sessions/i });
      fireEvent.click(sessionsButton);

      expect(onNavigate).toHaveBeenCalledWith('sessions');
    });
  });

  describe('Active session indicator (coding-tool-csw)', () => {
    it('should show active session indicator when session exists', () => {
      const onNavigate = jest.fn();
      const onReturnToSession = jest.fn();
      
      render(
        <InstructorNav
          currentView="classes"
          onNavigate={onNavigate}
          activeSessionId="test-session-123"
          onReturnToSession={onReturnToSession}
        />
      );

      expect(screen.getByText('Return to Session')).toBeInTheDocument();
    });

    it('should not show active session indicator when no session exists', () => {
      const onNavigate = jest.fn();
      
      render(
        <InstructorNav
          currentView="classes"
          onNavigate={onNavigate}
          activeSessionId={null}
        />
      );

      expect(screen.queryByText('Return to Session')).not.toBeInTheDocument();
      expect(screen.queryByText('In Session')).not.toBeInTheDocument();
    });

    it('should show "In Session" when currently viewing session', () => {
      const onNavigate = jest.fn();
      const onReturnToSession = jest.fn();
      
      render(
        <InstructorNav
          currentView="session"
          onNavigate={onNavigate}
          activeSessionId="test-session-123"
          onReturnToSession={onReturnToSession}
        />
      );

      expect(screen.getByText('In Session')).toBeInTheDocument();
      expect(screen.queryByText('Return to Session')).not.toBeInTheDocument();
    });

    it('should show "Return to Session" when navigated away from session', () => {
      const onNavigate = jest.fn();
      const onReturnToSession = jest.fn();
      
      render(
        <InstructorNav
          currentView="classes"
          onNavigate={onNavigate}
          activeSessionId="test-session-123"
          onReturnToSession={onReturnToSession}
        />
      );

      expect(screen.getByText('Return to Session')).toBeInTheDocument();
      expect(screen.queryByText('In Session')).not.toBeInTheDocument();
    });

    it('should call onReturnToSession when clicking active session indicator', () => {
      const onNavigate = jest.fn();
      const onReturnToSession = jest.fn();
      
      render(
        <InstructorNav
          currentView="classes"
          onNavigate={onNavigate}
          activeSessionId="test-session-123"
          onReturnToSession={onReturnToSession}
        />
      );

      const returnButton = screen.getByRole('button', { name: /Return to Session/i });
      fireEvent.click(returnButton);

      expect(onReturnToSession).toHaveBeenCalledTimes(1);
    });

    it('should show visual indicator with pulsing dot', () => {
      const onNavigate = jest.fn();
      const onReturnToSession = jest.fn();
      
      const { container } = render(
        <InstructorNav
          currentView="classes"
          onNavigate={onNavigate}
          activeSessionId="test-session-123"
          onReturnToSession={onReturnToSession}
        />
      );

      // Check for pulsing dot (animated element)
      const pulsingDot = container.querySelector('.animate-pulse');
      expect(pulsingDot).toBeInTheDocument();
      expect(pulsingDot).toHaveClass('bg-green-500');
    });
  });

  describe('Visual states and styling', () => {
    it('should highlight current view button', () => {
      const onNavigate = jest.fn();
      
      render(
        <InstructorNav
          currentView="classes"
          onNavigate={onNavigate}
          activeSessionId={null}
        />
      );

      const classesButton = screen.getByRole('button', { name: /Classes/i });
      expect(classesButton).toHaveClass('bg-blue-600', 'text-white');
    });

    it('should show hover state for non-active buttons', () => {
      const onNavigate = jest.fn();
      
      render(
        <InstructorNav
          currentView="classes"
          onNavigate={onNavigate}
          activeSessionId={null}
        />
      );

      const problemsButton = screen.getByRole('button', { name: /Problems/i });
      expect(problemsButton).toHaveClass('hover:bg-gray-100');
    });

    it('should render all navigation icons', () => {
      const onNavigate = jest.fn();
      
      const { container } = render(
        <InstructorNav
          currentView="classes"
          onNavigate={onNavigate}
          activeSessionId={null}
        />
      );

      // Check for emoji icons
      expect(screen.getByText('📚')).toBeInTheDocument(); // Classes
      expect(screen.getByText('🎯')).toBeInTheDocument(); // Sessions
      expect(screen.getByText('💡')).toBeInTheDocument(); // Problems
    });
  });

  describe('Accessibility', () => {
    it('should provide tooltip for return to session button', () => {
      const onNavigate = jest.fn();
      const onReturnToSession = jest.fn();
      
      render(
        <InstructorNav
          currentView="classes"
          onNavigate={onNavigate}
          activeSessionId="test-session-123"
          onReturnToSession={onReturnToSession}
        />
      );

      const returnButton = screen.getByRole('button', { name: /Return to Session/i });
      expect(returnButton).toHaveAttribute('title', 'Click to return to active session');
    });

    it('should render all buttons with proper roles', () => {
      const onNavigate = jest.fn();
      const onReturnToSession = jest.fn();
      
      render(
        <InstructorNav
          currentView="session"
          onNavigate={onNavigate}
          activeSessionId="test-session-123"
          onReturnToSession={onReturnToSession}
        />
      );

      const allButtons = screen.getAllByRole('button');
      expect(allButtons).toHaveLength(4); // 3 nav buttons + 1 return to session
    });
  });

  describe('Edge cases', () => {
    it('should handle missing onReturnToSession handler gracefully', () => {
      const onNavigate = jest.fn();
      
      // Should not crash without onReturnToSession
      const { container } = render(
        <InstructorNav
          currentView="classes"
          onNavigate={onNavigate}
          activeSessionId="test-session-123"
        />
      );

      expect(container).toBeInTheDocument();
    });

    it('should handle empty session ID as null', () => {
      const onNavigate = jest.fn();
      
      render(
        <InstructorNav
          currentView="classes"
          onNavigate={onNavigate}
          activeSessionId=""
        />
      );

      // Empty string is falsy, should not show indicator
      expect(screen.queryByText('Return to Session')).not.toBeInTheDocument();
    });
  });
});

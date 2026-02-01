/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import InstructorNav from '../InstructorNav';

describe('InstructorNav', () => {
  const mockOnNavigate = jest.fn();
  const mockOnReturnToSession = jest.fn();

  beforeEach(() => {
    mockOnNavigate.mockClear();
    mockOnReturnToSession.mockClear();
  });

  it('renders all navigation items', () => {
    render(
      <InstructorNav 
        currentView="classes" 
        onNavigate={mockOnNavigate}
        activeSessionId={null}
      />
    );

    expect(screen.getByText('Classes')).toBeInTheDocument();
    expect(screen.getByText('Sessions')).toBeInTheDocument();
    expect(screen.getByText('Problems')).toBeInTheDocument();
  });

  it('highlights the active view', () => {
    render(
      <InstructorNav 
        currentView="problems" 
        onNavigate={mockOnNavigate}
        activeSessionId={null}
      />
    );

    const problemsButton = screen.getByText('Problems').closest('button');
    expect(problemsButton).toHaveClass('bg-blue-600');
    expect(problemsButton).toHaveClass('text-white');
  });

  it('calls onNavigate when clicking a nav item', () => {
    render(
      <InstructorNav 
        currentView="classes" 
        onNavigate={mockOnNavigate}
        activeSessionId={null}
      />
    );

    fireEvent.click(screen.getByText('Sessions'));
    expect(mockOnNavigate).toHaveBeenCalledWith('sessions');
  });

  it('allows navigation when in session view', () => {
    render(
      <InstructorNav 
        currentView="session" 
        onNavigate={mockOnNavigate}
        activeSessionId="test-session"
        onReturnToSession={mockOnReturnToSession}
      />
    );

    const classesButton = screen.getByText('Classes').closest('button');
    expect(classesButton).not.toBeDisabled();

    fireEvent.click(classesButton!);
    expect(mockOnNavigate).toHaveBeenCalledWith('classes');
  });

  it('shows "In Session" indicator when viewing active session', () => {
    render(
      <InstructorNav 
        currentView="session" 
        onNavigate={mockOnNavigate}
        activeSessionId="test-session"
        onReturnToSession={mockOnReturnToSession}
      />
    );

    expect(screen.getByText('In Session')).toBeInTheDocument();
    expect(screen.queryByText('Return to Session')).not.toBeInTheDocument();
  });

  it('shows "Return to Session" indicator when navigated away from session', () => {
    render(
      <InstructorNav 
        currentView="classes" 
        onNavigate={mockOnNavigate}
        activeSessionId="test-session"
        onReturnToSession={mockOnReturnToSession}
      />
    );

    expect(screen.getByText('Return to Session')).toBeInTheDocument();
    expect(screen.queryByText('In Session')).not.toBeInTheDocument();
  });

  it('does not show session indicator when no active session', () => {
    render(
      <InstructorNav 
        currentView="sessions" 
        onNavigate={mockOnNavigate}
        activeSessionId={null}
      />
    );

    expect(screen.queryByText('In Session')).not.toBeInTheDocument();
    expect(screen.queryByText('Return to Session')).not.toBeInTheDocument();
  });

  it('enables all buttons by default', () => {
    render(
      <InstructorNav 
        currentView="sessions" 
        onNavigate={mockOnNavigate}
        activeSessionId={null}
      />
    );

    const classesButton = screen.getByText('Classes').closest('button');
    const problemsButton = screen.getByText('Problems').closest('button');
    
    expect(classesButton).not.toBeDisabled();
    expect(problemsButton).not.toBeDisabled();
  });

  it('calls onReturnToSession when clicking return to session button', () => {
    render(
      <InstructorNav 
        currentView="classes" 
        onNavigate={mockOnNavigate}
        activeSessionId="test-session"
        onReturnToSession={mockOnReturnToSession}
      />
    );

    const returnButton = screen.getByText('Return to Session');
    fireEvent.click(returnButton);
    
    expect(mockOnReturnToSession).toHaveBeenCalledTimes(1);
  });
});

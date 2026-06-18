/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SessionComposer, { ComposerSection } from '../SessionComposer';

describe('SessionComposer', () => {
  const sections: ComposerSection[] = [
    { id: 'sec-1', label: 'CS 101 · Section A', studentCount: 22, hasCurrentSession: true },
    { id: 'sec-2', label: 'CS 101 · Section B', studentCount: 24, hasCurrentSession: false },
  ];

  const baseProps = {
    sections,
    selectedSectionId: null,
    onSelectSection: jest.fn(),
    onStart: jest.fn(),
    onCancel: jest.fn(),
    starting: false,
  };

  beforeEach(() => jest.clearAllMocks());

  it('renders rows with label, "N students", and a live pill only when hasCurrentSession', () => {
    render(<SessionComposer {...baseProps} />);

    expect(screen.getByText('CS 101 · Section A')).toBeInTheDocument();
    expect(screen.getByText('22 students')).toBeInTheDocument();
    expect(screen.getByText('CS 101 · Section B')).toBeInTheDocument();
    expect(screen.getByText('24 students')).toBeInTheDocument();

    // Exactly one "now" pill — for the section that has a current session.
    const pills = screen.getAllByText('now');
    expect(pills).toHaveLength(1);
  });

  it('disables Start until a section is selected and while starting', () => {
    const { rerender } = render(<SessionComposer {...baseProps} />);
    expect(screen.getByRole('button', { name: /start session/i })).toBeDisabled();

    rerender(<SessionComposer {...baseProps} selectedSectionId="sec-1" />);
    expect(screen.getByRole('button', { name: /start session/i })).toBeEnabled();

    rerender(<SessionComposer {...baseProps} selectedSectionId="sec-1" starting />);
    expect(screen.getByRole('button', { name: /start session/i })).toBeDisabled();
  });

  it('calls onSelectSection when a row is clicked (unlocked)', () => {
    render(<SessionComposer {...baseProps} />);
    fireEvent.click(screen.getByText('CS 101 · Section B'));
    expect(baseProps.onSelectSection).toHaveBeenCalledWith('sec-2');
  });

  it('does not call onSelectSection when sectionLocked', () => {
    render(<SessionComposer {...baseProps} sectionLocked selectedSectionId="sec-1" />);
    fireEvent.click(screen.getByText('CS 101 · Section A'));
    expect(baseProps.onSelectSection).not.toHaveBeenCalled();
  });

  it('makeCurrent checked (default) → onStart({setCurrent:true})', () => {
    render(<SessionComposer {...baseProps} selectedSectionId="sec-1" />);
    fireEvent.click(screen.getByRole('button', { name: /start session/i }));
    expect(baseProps.onStart).toHaveBeenCalledWith({ setCurrent: true });
  });

  it('makeCurrent unchecked → onStart({setCurrent:false})', () => {
    render(<SessionComposer {...baseProps} selectedSectionId="sec-1" />);
    fireEvent.click(
      screen.getByRole('checkbox', { name: /make this the current problem for the class/i })
    );
    fireEvent.click(screen.getByRole('button', { name: /start session/i }));
    expect(baseProps.onStart).toHaveBeenCalledWith({ setCurrent: false });
  });

  it('renders the error prop inline and fires onCancel', () => {
    render(<SessionComposer {...baseProps} selectedSectionId="sec-1" error="Boom" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Boom');

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(baseProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders exactly ONE checkbox and no "End any session" / "Notify" copy', () => {
    render(<SessionComposer {...baseProps} selectedSectionId="sec-1" />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.queryByText(/end any session/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/notify/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/reset everyone/i)).not.toBeInTheDocument();
  });

  it('renders a degraded status line (no count) when studentCount is undefined', () => {
    const degraded: ComposerSection[] = [
      { id: 'sec-x', label: 'CS 200 · Lab', hasCurrentSession: true },
    ];
    render(<SessionComposer {...baseProps} sections={degraded} />);
    expect(screen.getByText('CS 200 · Lab')).toBeInTheDocument();
    expect(screen.queryByText(/students/i)).not.toBeInTheDocument();
    // Live pill still shows from the pointer.
    expect(screen.getByText('now')).toBeInTheDocument();
  });

  it('renders host optionsSlot content', () => {
    render(
      <SessionComposer {...baseProps} selectedSectionId="sec-1" optionsSlot={<div>publish stuff</div>} />
    );
    expect(screen.getByText('publish stuff')).toBeInTheDocument();
  });
});

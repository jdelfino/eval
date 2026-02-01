/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CreateSessionFromProblemModal from '../CreateSessionFromProblemModal';

describe('CreateSessionFromProblemModal', () => {
  const defaultProps = {
    problemId: 'prob-1',
    problemTitle: 'Two Sum',
    classId: 'class-1',
    className: 'CS 101',
    onClose: jest.fn(),
    onSuccess: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('displays the class name as read-only text', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sections: [] }),
    });

    render(<CreateSessionFromProblemModal {...defaultProps} />);

    expect(screen.getByText('CS 101')).toBeInTheDocument();
    // No class dropdown
    expect(screen.queryByText('-- Select a class --')).not.toBeInTheDocument();
  });

  it('loads sections for the given classId on mount', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sections: [
          { id: 'sec-1', name: 'Section A', joinCode: 'ABC' },
          { id: 'sec-2', name: 'Section B', joinCode: 'DEF' },
        ],
      }),
    });

    render(<CreateSessionFromProblemModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
      expect(screen.getByText('Section B')).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/classes/class-1/sections');
  });

  it('creates a session when a section is selected and submitted', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sections: [
            { id: 'sec-1', name: 'Section A', joinCode: 'ABC' },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          session: { id: 'session-1', joinCode: 'JOIN123' },
        }),
      });

    render(<CreateSessionFromProblemModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sec-1' } });
    fireEvent.click(screen.getByRole('button', { name: /create session/i }));

    await waitFor(() => {
      expect(defaultProps.onSuccess).toHaveBeenCalledWith('session-1', 'JOIN123');
    });

    // Verify session creation call
    expect(global.fetch).toHaveBeenCalledWith('/api/sessions', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ sectionId: 'sec-1', problemId: 'prob-1' }),
    }));
  });

  it('only fetches sections, not classes', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sections: [
          { id: 'sec-1', name: 'Section A', joinCode: 'ABC' },
        ],
      }),
    });

    render(<CreateSessionFromProblemModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
    });

    // Should only fetch sections, not classes (className is provided as prop)
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith('/api/classes/class-1/sections');
  });

  it('pre-selects last-used section when classId matches', async () => {
    localStorage.setItem('lastUsedSection', JSON.stringify({ sectionId: 'sec-2', classId: 'class-1' }));

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sections: [
          { id: 'sec-1', name: 'Section A', joinCode: 'ABC' },
          { id: 'sec-2', name: 'Section B', joinCode: 'DEF' },
        ],
      }),
    });

    render(<CreateSessionFromProblemModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveValue('sec-2');
    });
  });

  it('does not pre-select when last-used section is for a different class', async () => {
    localStorage.setItem('lastUsedSection', JSON.stringify({ sectionId: 'sec-1', classId: 'other-class' }));

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sections: [
          { id: 'sec-1', name: 'Section A', joinCode: 'ABC' },
          { id: 'sec-2', name: 'Section B', joinCode: 'DEF' },
        ],
      }),
    });

    render(<CreateSessionFromProblemModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
    });

    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  it('saves last-used section on successful session creation', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sections: [
            { id: 'sec-1', name: 'Section A', joinCode: 'ABC' },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          session: { id: 'session-1', joinCode: 'JOIN123' },
        }),
      });

    render(<CreateSessionFromProblemModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sec-1' } });
    fireEvent.click(screen.getByRole('button', { name: /create session/i }));

    await waitFor(() => {
      expect(defaultProps.onSuccess).toHaveBeenCalled();
    });

    const stored = JSON.parse(localStorage.getItem('lastUsedSection')!);
    expect(stored).toEqual({ sectionId: 'sec-1', classId: 'class-1' });
  });
});

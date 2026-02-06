/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CreateSessionFromProblemModal from '../CreateSessionFromProblemModal';
import * as sectionsApi from '@/lib/api/sections';
import * as sessionsApi from '@/lib/api/sessions';

jest.mock('@/lib/api/sections');
jest.mock('@/lib/api/sessions');

describe('CreateSessionFromProblemModal', () => {
  const defaultProps = {
    problem_id: 'prob-1',
    problem_title: 'Two Sum',
    class_id: 'class-1',
    className: 'CS 101',
    onClose: jest.fn(),
    onSuccess: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('displays the class name as read-only text', async () => {
    (sectionsApi.getClassSections as jest.Mock).mockResolvedValueOnce([]);

    render(<CreateSessionFromProblemModal {...defaultProps} />);

    expect(screen.getByText('CS 101')).toBeInTheDocument();
    // No class dropdown
    expect(screen.queryByText('-- Select a class --')).not.toBeInTheDocument();
  });

  it('loads sections for the given class_id on mount', async () => {
    const mockSections = [
      { id: 'sec-1', name: 'Section A', join_code: 'ABC' },
      { id: 'sec-2', name: 'Section B', join_code: 'DEF' },
    ];
    (sectionsApi.getClassSections as jest.Mock).mockResolvedValueOnce(mockSections);

    render(<CreateSessionFromProblemModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
      expect(screen.getByText('Section B')).toBeInTheDocument();
    });

    expect(sectionsApi.getClassSections).toHaveBeenCalledWith('class-1');
  });

  it('creates a session when a section is selected and submitted', async () => {
    const mockSections = [
      { id: 'sec-1', name: 'Section A', join_code: 'ABC' },
    ];
    const mockSession = { id: 'session-1', join_code: 'JOIN123' };

    (sectionsApi.getClassSections as jest.Mock).mockResolvedValueOnce(mockSections);
    (sessionsApi.createSession as jest.Mock).mockResolvedValueOnce(mockSession);

    render(<CreateSessionFromProblemModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sec-1' } });
    fireEvent.click(screen.getByRole('button', { name: /create session/i }));

    await waitFor(() => {
      expect(defaultProps.onSuccess).toHaveBeenCalledWith('session-1', 'ABC');
    });

    // Verify session creation call
    expect(sessionsApi.createSession).toHaveBeenCalledWith('sec-1', 'prob-1');
  });

  it('only fetches sections, not classes', async () => {
    const mockSections = [
      { id: 'sec-1', name: 'Section A', join_code: 'ABC' },
    ];
    (sectionsApi.getClassSections as jest.Mock).mockResolvedValueOnce(mockSections);

    render(<CreateSessionFromProblemModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
    });

    // Should only fetch sections, not classes (className is provided as prop)
    expect(sectionsApi.getClassSections).toHaveBeenCalledTimes(1);
    expect(sectionsApi.getClassSections).toHaveBeenCalledWith('class-1');
  });

  it('pre-selects last-used section when class_id matches', async () => {
    localStorage.setItem('lastUsedSection', JSON.stringify({ section_id: 'sec-2', class_id: 'class-1' }));

    const mockSections = [
      { id: 'sec-1', name: 'Section A', join_code: 'ABC' },
      { id: 'sec-2', name: 'Section B', join_code: 'DEF' },
    ];
    (sectionsApi.getClassSections as jest.Mock).mockResolvedValueOnce(mockSections);

    render(<CreateSessionFromProblemModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveValue('sec-2');
    });
  });

  it('does not pre-select when last-used section is for a different class', async () => {
    localStorage.setItem('lastUsedSection', JSON.stringify({ section_id: 'sec-1', class_id: 'other-class' }));

    const mockSections = [
      { id: 'sec-1', name: 'Section A', join_code: 'ABC' },
      { id: 'sec-2', name: 'Section B', join_code: 'DEF' },
    ];
    (sectionsApi.getClassSections as jest.Mock).mockResolvedValueOnce(mockSections);

    render(<CreateSessionFromProblemModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
    });

    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  it('saves last-used section on successful session creation', async () => {
    const mockSections = [
      { id: 'sec-1', name: 'Section A', join_code: 'ABC' },
    ];
    const mockSession = { id: 'session-1', join_code: 'JOIN123' };

    (sectionsApi.getClassSections as jest.Mock).mockResolvedValueOnce(mockSections);
    (sessionsApi.createSession as jest.Mock).mockResolvedValueOnce(mockSession);

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
    expect(stored).toEqual({ section_id: 'sec-1', class_id: 'class-1' });
  });
});

/**
 * Tests for ProblemSearch component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ProblemSearch from '../ProblemSearch';

describe('ProblemSearch', () => {
  const defaultProps = {
    searchQuery: '',
    onSearchChange: jest.fn(),
    filterPublic: 'all' as const,
    onFilterChange: jest.fn(),
    sortBy: 'created' as const,
    onSortChange: jest.fn(),
    sortOrder: 'desc' as const,
    onSortOrderChange: jest.fn(),
    viewMode: 'list' as const,
    onViewModeChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders search input', () => {
    render(<ProblemSearch {...defaultProps} />);
    expect(screen.getByPlaceholderText(/search problems/i)).toBeInTheDocument();
  });

  it('calls onSearchChange when search input changes', () => {
    render(<ProblemSearch {...defaultProps} />);
    const input = screen.getByPlaceholderText(/search problems/i);
    fireEvent.change(input, { target: { value: 'test query' } });
    expect(defaultProps.onSearchChange).toHaveBeenCalledWith('test query');
  });

  it('renders view mode toggle buttons', () => {
    render(<ProblemSearch {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('calls onViewModeChange when view mode button is clicked', () => {
    render(<ProblemSearch {...defaultProps} />);
    const gridButton = screen.getByTitle('Grid view');
    fireEvent.click(gridButton);
    expect(defaultProps.onViewModeChange).toHaveBeenCalledWith('grid');
  });

  it('highlights active view mode', () => {
    const { rerender } = render(<ProblemSearch {...defaultProps} viewMode="list" />);
    let listButton = screen.getByTitle('List view');
    expect(listButton).toHaveClass('bg-blue-600');

    rerender(<ProblemSearch {...defaultProps} viewMode="grid" />);
    const gridButton = screen.getByTitle('Grid view');
    expect(gridButton).toHaveClass('bg-blue-600');
  });

  it('renders sort by dropdown', () => {
    render(<ProblemSearch {...defaultProps} />);
    expect(screen.getByDisplayValue('Date Created')).toBeInTheDocument();
  });

  it('calls onSortChange when sort field changes', () => {
    render(<ProblemSearch {...defaultProps} />);
    const select = screen.getByDisplayValue('Date Created');
    fireEvent.change(select, { target: { value: 'title' } });
    expect(defaultProps.onSortChange).toHaveBeenCalledWith('title');
  });

  it('renders sort order button', () => {
    render(<ProblemSearch {...defaultProps} />);
    expect(screen.getByText('Desc')).toBeInTheDocument();
  });

  it('calls onSortOrderChange when sort order button is clicked', () => {
    render(<ProblemSearch {...defaultProps} sortOrder="desc" />);
    const button = screen.getByText('Desc');
    fireEvent.click(button);
    expect(defaultProps.onSortOrderChange).toHaveBeenCalledWith('asc');
  });

  it('toggles sort order between asc and desc', () => {
    const { rerender } = render(<ProblemSearch {...defaultProps} sortOrder="asc" />);
    expect(screen.getByText('Asc')).toBeInTheDocument();

    rerender(<ProblemSearch {...defaultProps} sortOrder="desc" />);
    expect(screen.getByText('Desc')).toBeInTheDocument();
  });

  it('displays current search query value', () => {
    render(<ProblemSearch {...defaultProps} searchQuery="my search" />);
    const input = screen.getByPlaceholderText(/search problems/i) as HTMLInputElement;
    expect(input.value).toBe('my search');
  });

  describe('Tag filtering', () => {
    const tagProps = {
      ...defaultProps,
      availableTags: ['loops', 'arrays', 'strings'],
      selectedTags: [] as string[],
      onTagToggle: jest.fn(),
    };

    it('renders available tags as clickable chips', () => {
      render(<ProblemSearch {...tagProps} />);
      expect(screen.getByText('loops')).toBeInTheDocument();
      expect(screen.getByText('arrays')).toBeInTheDocument();
      expect(screen.getByText('strings')).toBeInTheDocument();
    });

    it('highlights selected tags', () => {
      render(<ProblemSearch {...tagProps} selectedTags={['loops']} />);
      const loopsChip = screen.getByText('loops');
      expect(loopsChip.closest('button')).toHaveClass('bg-blue-600');
    });

    it('calls onTagToggle when a tag is clicked', () => {
      render(<ProblemSearch {...tagProps} />);
      fireEvent.click(screen.getByText('loops'));
      expect(tagProps.onTagToggle).toHaveBeenCalledWith('loops');
    });

    it('does not render tag section when no tags available', () => {
      render(<ProblemSearch {...defaultProps} availableTags={[]} selectedTags={[]} onTagToggle={jest.fn()} />);
      expect(screen.queryByText('Tags:')).not.toBeInTheDocument();
    });
  });
});

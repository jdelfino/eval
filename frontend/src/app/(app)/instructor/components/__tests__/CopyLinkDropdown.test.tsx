import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { CopyLinkDropdown } from '../CopyLinkDropdown';

// Mock clipboard API
const mockWriteText = jest.fn().mockResolvedValue(undefined);
Object.assign(navigator, {
  clipboard: { writeText: mockWriteText },
});

// Mock last-used-section
const mockGetLastUsedSection = jest.fn();
jest.mock('@/lib/last-used-section', () => ({
  getLastUsedSection: () => mockGetLastUsedSection(),
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// window.location.origin is already 'http://localhost' in jsdom

const defaultProps = {
  problemId: 'prob-1',
  classId: 'class-1',
};

const sectionsResponse = {
  sections: [
    { id: 'sec-1', name: 'Section A' },
    { id: 'sec-2', name: 'Section B' },
    { id: 'sec-3', name: 'Section C' },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockGetLastUsedSection.mockReturnValue(null);
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(sectionsResponse),
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('CopyLinkDropdown', () => {
  it('copies generic URL when main button is clicked', async () => {
    render(<CopyLinkDropdown {...defaultProps} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy link/i }));
    });

    expect(mockWriteText).toHaveBeenCalledWith(
      'http://localhost/problems/prob-1'
    );
    expect(screen.getByText('Copied!')).toBeInTheDocument();
  });

  it('fetches and renders sections on dropdown open', async () => {
    render(<CopyLinkDropdown {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /show sections/i }));

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
      expect(screen.getByText('Section B')).toBeInTheDocument();
      expect(screen.getByText('Section C')).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/classes/class-1/sections');
  });

  it('copies deep-link URL when a section is clicked', async () => {
    render(<CopyLinkDropdown {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /show sections/i }));

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Section A'));
    });

    expect(mockWriteText).toHaveBeenCalledWith(
      'http://localhost/problems/prob-1?start=true&sectionId=sec-1'
    );
  });

  it('sorts last-used section first', async () => {
    mockGetLastUsedSection.mockReturnValue({
      sectionId: 'sec-2',
      classId: 'class-1',
    });

    render(<CopyLinkDropdown {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /show sections/i }));

    await waitFor(() => {
      expect(screen.getByText('Section B')).toBeInTheDocument();
    });

    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toHaveTextContent('Section B');
  });

  it('closes dropdown on click outside', async () => {
    render(
      <div>
        <div data-testid="outside">outside</div>
        <CopyLinkDropdown {...defaultProps} />
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: /show sections/i }));

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
    });

    fireEvent.mouseDown(screen.getByTestId('outside'));

    expect(screen.queryByText('Section A')).not.toBeInTheDocument();
  });

  it('closes dropdown on Escape key', async () => {
    render(<CopyLinkDropdown {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /show sections/i }));

    await waitFor(() => {
      expect(screen.getByText('Section A')).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByText('Section A')).not.toBeInTheDocument();
  });
});

/**
 * Tests for Instructor Problems Page
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ProblemsPageWrapper from '../page';

const mockPush = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

// Mock the child components
jest.mock('../../components/ProblemLibrary', () => {
  return function MockProblemLibrary({ onCreateNew, onEdit }: { onCreateNew?: () => void; onEdit?: (id: string) => void }) {
    return (
      <div data-testid="problem-library">
        <button onClick={onCreateNew} data-testid="create-new-btn">Create New</button>
        <button onClick={() => onEdit?.('problem-1')} data-testid="edit-btn">Edit</button>
      </div>
    );
  };
});

jest.mock('../../components/ProblemCreator', () => {
  return function MockProblemCreator({ problemId, onCancel, onProblemCreated }: {
    problemId?: string | null;
    onCancel?: () => void;
    onProblemCreated?: (id: string) => void;
  }) {
    return (
      <div data-testid="problem-creator">
        <span data-testid="editing-problem-id">{problemId || 'new'}</span>
        <button onClick={onCancel} data-testid="cancel-btn">Cancel</button>
        <button onClick={() => onProblemCreated?.('created-id')} data-testid="save-btn">Save</button>
      </div>
    );
  };
});

jest.mock('@/components/NamespaceHeader', () => {
  return function MockNamespaceHeader() {
    return <div data-testid="namespace-header">Namespace Header</div>;
  };
});

describe('ProblemsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('renders the problem library by default', () => {
    render(<ProblemsPageWrapper />);

    expect(screen.getByTestId('problem-library')).toBeInTheDocument();
    expect(screen.queryByTestId('problem-creator')).not.toBeInTheDocument();
  });

  it('renders namespace header', () => {
    render(<ProblemsPageWrapper />);

    expect(screen.getByTestId('namespace-header')).toBeInTheDocument();
  });

  it('navigates to create URL when creating a new problem', () => {
    render(<ProblemsPageWrapper />);

    fireEvent.click(screen.getByTestId('create-new-btn'));

    expect(mockPush).toHaveBeenCalledWith('/instructor/problems?edit=new');
  });

  it('shows problem creator when edit=new is in URL', () => {
    mockSearchParams = new URLSearchParams('edit=new');
    render(<ProblemsPageWrapper />);

    expect(screen.getByTestId('problem-creator')).toBeInTheDocument();
    expect(screen.queryByTestId('problem-library')).not.toBeInTheDocument();
    expect(screen.getByTestId('editing-problem-id')).toHaveTextContent('new');
  });

  it('shows problem creator with problem ID when edit param has an ID', () => {
    mockSearchParams = new URLSearchParams('edit=problem-1');
    render(<ProblemsPageWrapper />);

    expect(screen.getByTestId('problem-creator')).toBeInTheDocument();
    expect(screen.getByTestId('editing-problem-id')).toHaveTextContent('problem-1');
  });

  it('navigates to edit URL when editing a problem', () => {
    render(<ProblemsPageWrapper />);

    fireEvent.click(screen.getByTestId('edit-btn'));

    expect(mockPush).toHaveBeenCalledWith('/instructor/problems?edit=problem-1');
  });

  it('uses full-height flex layout when showing creator', () => {
    mockSearchParams = new URLSearchParams('edit=new');
    render(<ProblemsPageWrapper />);

    const creatorWrapper = screen.getByTestId('problem-creator').parentElement;
    expect(creatorWrapper).toHaveClass('h-full', 'flex', 'flex-col', '-m-6');
  });

  it('does not show namespace header when creator is open', () => {
    mockSearchParams = new URLSearchParams('edit=new');
    render(<ProblemsPageWrapper />);

    expect(screen.queryByTestId('namespace-header')).not.toBeInTheDocument();
  });

  it('uses space-y-6 layout when showing library', () => {
    render(<ProblemsPageWrapper />);

    const libraryWrapper = screen.getByTestId('problem-library').parentElement;
    expect(libraryWrapper).toHaveClass('space-y-6');
  });

  it('navigates back to library when canceling from creator', () => {
    mockSearchParams = new URLSearchParams('edit=new');
    render(<ProblemsPageWrapper />);

    fireEvent.click(screen.getByTestId('cancel-btn'));

    expect(mockPush).toHaveBeenCalledWith('/instructor/problems');
  });

  it('navigates back to library after saving a problem', () => {
    mockSearchParams = new URLSearchParams('edit=new');
    render(<ProblemsPageWrapper />);

    fireEvent.click(screen.getByTestId('save-btn'));

    expect(mockPush).toHaveBeenCalledWith('/instructor/problems');
  });
});

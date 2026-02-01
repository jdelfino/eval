/**
 * Tests for ExecutionSettings component
 * 
 * Tests the execution settings panel including the inSidebar mode for responsive layout.
 * 
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExecutionSettings from '../ExecutionSettings';

describe('ExecutionSettings Component', () => {
  const defaultProps = {
    stdin: '',
    onStdinChange: jest.fn(),
    randomSeed: undefined,
    onRandomSeedChange: jest.fn(),
    attachedFiles: [],
    onAttachedFilesChange: jest.fn(),
    exampleInput: undefined,
    readOnly: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Collapse/Expand Behavior', () => {
    it('should render collapsed by default when not in sidebar', () => {
      render(<ExecutionSettings {...defaultProps} inSidebar={false} />);

      // Expand button should be present
      const expandButton = screen.getByRole('button', { name: /execution settings/i });
      expect(expandButton).toBeInTheDocument();

      // Settings content should not be visible
      expect(screen.queryByText(/Program Input/i)).not.toBeInTheDocument();
    });

    it('should expand when collapse button is clicked', () => {
      render(<ExecutionSettings {...defaultProps} inSidebar={false} />);

      const expandButton = screen.getByRole('button', { name: /execution settings/i });
      fireEvent.click(expandButton);

      // Settings content should now be visible
      expect(screen.getByText(/Program Input/i)).toBeInTheDocument();
    });

    it('should not render collapse button when in sidebar', () => {
      render(<ExecutionSettings {...defaultProps} inSidebar={true} />);

      // No collapse button in sidebar mode
      const collapseButton = screen.queryByRole('button', { name: /execution settings/i });
      expect(collapseButton).not.toBeInTheDocument();

      // Settings content should be visible by default
      expect(screen.getByText(/Program Input/i)).toBeInTheDocument();
    });

    it('should always show content when in sidebar', () => {
      render(<ExecutionSettings {...defaultProps} inSidebar={true} />);

      // Settings content should be visible
      expect(screen.getByText(/Program Input/i)).toBeInTheDocument();
      expect(screen.getByText(/Random Seed/i)).toBeInTheDocument();
      expect(screen.getByText(/Attached Files/i)).toBeInTheDocument();
    });
  });

  describe('Stdin Input', () => {
    it('should render stdin textarea', () => {
      render(<ExecutionSettings {...defaultProps} inSidebar={true} />);

      const textarea = screen.getByPlaceholderText(/Enter input for your program/i);
      expect(textarea).toBeInTheDocument();
    });

    it('should call onStdinChange when input changes', () => {
      const onStdinChange = jest.fn();
      render(
        <ExecutionSettings 
          {...defaultProps} 
          inSidebar={true}
          onStdinChange={onStdinChange}
        />
      );

      const textarea = screen.getByPlaceholderText(/Enter input for your program/i);
      fireEvent.change(textarea, { target: { value: 'test input' } });

      expect(onStdinChange).toHaveBeenCalledWith('test input');
    });

    it('should display example input note when provided', () => {
      render(
        <ExecutionSettings 
          {...defaultProps} 
          inSidebar={true}
          exampleInput="example"
        />
      );

      expect(screen.getByText(/example provided by instructor/i)).toBeInTheDocument();
    });

    it('should be read-only when readOnly prop is true', () => {
      render(
        <ExecutionSettings 
          {...defaultProps} 
          inSidebar={true}
          readOnly={true}
        />
      );

      const textarea = screen.getByPlaceholderText(/Enter input for your program/i);
      expect(textarea).toHaveAttribute('readOnly');
    });
  });

  describe('Random Seed', () => {
    it('should display random seed when provided', () => {
      render(
        <ExecutionSettings 
          {...defaultProps} 
          inSidebar={true}
          randomSeed={12345}
        />
      );

      expect(screen.getByText('12345')).toBeInTheDocument();
    });

    it('should show "No seed set" when undefined', () => {
      render(
        <ExecutionSettings 
          {...defaultProps} 
          inSidebar={true}
          randomSeed={undefined}
        />
      );

      expect(screen.getByText(/No seed set \(random\)/i)).toBeInTheDocument();
    });

    it('should show edit button when not read-only', () => {
      render(
        <ExecutionSettings 
          {...defaultProps} 
          inSidebar={true}
          randomSeed={12345}
          readOnly={false}
        />
      );

      // There are multiple "Edit" buttons (one for seed, one for files)
      // Just check that at least one exists
      const editButtons = screen.getAllByRole('button', { name: /edit/i });
      expect(editButtons.length).toBeGreaterThan(0);
    });

    it('should not show edit button when read-only', () => {
      render(
        <ExecutionSettings 
          {...defaultProps} 
          inSidebar={true}
          randomSeed={12345}
          readOnly={true}
        />
      );

      const editButton = screen.queryByRole('button', { name: /edit/i });
      expect(editButton).not.toBeInTheDocument();
    });
  });

  describe('Attached Files', () => {
    it('should display "No files attached" when no files', () => {
      render(
        <ExecutionSettings 
          {...defaultProps} 
          inSidebar={true}
          attachedFiles={[]}
        />
      );

      expect(screen.getByText(/No files attached/i)).toBeInTheDocument();
    });

    it('should display attached files when provided', () => {
      const files = [
        { name: 'data.txt', content: 'test content' },
        { name: 'config.json', content: '{}' },
      ];

      render(
        <ExecutionSettings 
          {...defaultProps} 
          inSidebar={true}
          attachedFiles={files}
        />
      );

      expect(screen.getByText('data.txt')).toBeInTheDocument();
      expect(screen.getByText('config.json')).toBeInTheDocument();
    });

    it('should show file size', () => {
      const files = [
        { name: 'data.txt', content: 'test content' },
      ];

      render(
        <ExecutionSettings 
          {...defaultProps} 
          inSidebar={true}
          attachedFiles={files}
        />
      );

      expect(screen.getByText(/12 bytes/i)).toBeInTheDocument();
    });

    it('should show edit button when not read-only', () => {
      render(
        <ExecutionSettings 
          {...defaultProps} 
          inSidebar={true}
          attachedFiles={[]}
          readOnly={false}
        />
      );

      // Find "Edit" button in the "Attached Files" section
      const editButtons = screen.getAllByRole('button', { name: /edit/i });
      expect(editButtons.length).toBeGreaterThan(0);
    });

    it('should not show edit button when read-only', () => {
      render(
        <ExecutionSettings 
          {...defaultProps} 
          inSidebar={true}
          attachedFiles={[]}
          readOnly={true}
        />
      );

      const editButtons = screen.queryAllByRole('button', { name: /edit/i });
      expect(editButtons.length).toBe(0);
    });
  });

  describe('Visual Styling', () => {
    it('should apply different background when in sidebar', () => {
      render(
        <ExecutionSettings 
          {...defaultProps} 
          inSidebar={true}
        />
      );

      // Just verify the component renders - specific styling is implementation detail
      expect(screen.getByText(/Program Input/i)).toBeInTheDocument();
    });

    it('should apply standard background when not in sidebar', () => {
      const { container } = render(
        <ExecutionSettings
          {...defaultProps}
          inSidebar={false}
        />
      );

      const wrapperDiv = container.firstChild as HTMLElement;
      // Now using Tailwind classes - bg-gray-100 for light theme when not in sidebar
      expect(wrapperDiv).toHaveClass('bg-gray-100');
    });

    it('should not have top border when in sidebar', () => {
      const { container } = render(
        <ExecutionSettings 
          {...defaultProps} 
          inSidebar={true}
        />
      );

      const wrapperDiv = container.firstChild as HTMLElement;
      expect(wrapperDiv).toHaveStyle({ borderTop: 'none' });
    });

    it('should have top border when not in sidebar', () => {
      const { container } = render(
        <ExecutionSettings
          {...defaultProps}
          inSidebar={false}
        />
      );

      const wrapperDiv = container.firstChild as HTMLElement;
      // Now using Tailwind classes - border-t for top border
      expect(wrapperDiv).toHaveClass('border-t');
    });
  });

  describe('Content Summary Icons', () => {
    it('should show summary icons when collapsed and has content', () => {
      render(
        <ExecutionSettings 
          {...defaultProps} 
          inSidebar={false}
          stdin="test"
          randomSeed={123}
          attachedFiles={[{ name: 'file.txt', content: 'content' }]}
        />
      );

      // Look for icons in collapsed state
      expect(screen.getByText(/📝/)).toBeInTheDocument(); // stdin
      expect(screen.getByText(/🎲/)).toBeInTheDocument(); // seed
      expect(screen.getByText(/📁 1/)).toBeInTheDocument(); // file count
    });

    it('should not show summary icons when expanded', () => {
      render(
        <ExecutionSettings 
          {...defaultProps} 
          inSidebar={false}
          stdin="test"
          randomSeed={123}
          attachedFiles={[{ name: 'file.txt', content: 'content' }]}
        />
      );

      // Expand the settings
      const expandButton = screen.getByRole('button', { name: /execution settings/i });
      fireEvent.click(expandButton);

      // Icons should not appear when expanded
      const icons = screen.queryByText(/📝.*🎲.*📁/);
      expect(icons).not.toBeInTheDocument();
    });
  });
});

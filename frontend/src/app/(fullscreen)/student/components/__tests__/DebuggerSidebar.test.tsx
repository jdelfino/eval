import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DebuggerSidebar } from '../DebuggerSidebar';

describe('DebuggerSidebar', () => {
  const mockOnStepForward = jest.fn();
  const mockOnStepBackward = jest.fn();
  const mockOnJumpToFirst = jest.fn();
  const mockOnJumpToLast = jest.fn();
  const mockOnExit = jest.fn();
  const mockOnRequestTrace = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when no trace is active', () => {
    it('renders start debugging UI', () => {
      render(
        <DebuggerSidebar
          currentStep={0}
          total_steps={0}
          currentLine={0}
          canStepForward={false}
          canStepBackward={false}
          onStepForward={mockOnStepForward}
          onStepBackward={mockOnStepBackward}
          onJumpToFirst={mockOnJumpToFirst}
          onJumpToLast={mockOnJumpToLast}
          onExit={mockOnExit}
          onRequestTrace={mockOnRequestTrace}
          hasTrace={false}
          isLoading={false}
        />
      );

      expect(screen.getByText('Python Debugger')).toBeInTheDocument();
      expect(screen.getByText('🐛 Start Debugging')).toBeInTheDocument();
    });

    it('calls onRequestTrace when start debugging button is clicked', () => {
      render(
        <DebuggerSidebar
          currentStep={0}
          total_steps={0}
          currentLine={0}
          canStepForward={false}
          canStepBackward={false}
          onStepForward={mockOnStepForward}
          onStepBackward={mockOnStepBackward}
          onJumpToFirst={mockOnJumpToFirst}
          onJumpToLast={mockOnJumpToLast}
          onExit={mockOnExit}
          onRequestTrace={mockOnRequestTrace}
          hasTrace={false}
          isLoading={false}
        />
      );

      const startButton = screen.getByText('🐛 Start Debugging');
      fireEvent.click(startButton);
      expect(mockOnRequestTrace).toHaveBeenCalledTimes(1);
    });

    it('disables start button when loading', () => {
      render(
        <DebuggerSidebar
          currentStep={0}
          total_steps={0}
          currentLine={0}
          canStepForward={false}
          canStepBackward={false}
          onStepForward={mockOnStepForward}
          onStepBackward={mockOnStepBackward}
          onJumpToFirst={mockOnJumpToFirst}
          onJumpToLast={mockOnJumpToLast}
          onExit={mockOnExit}
          onRequestTrace={mockOnRequestTrace}
          hasTrace={false}
          isLoading={true}
        />
      );

      const loadingButton = screen.getByText('⏳ Loading Trace...');
      expect(loadingButton).toBeDisabled();
    });
  });

  describe('when trace is active', () => {
    it('renders debugging controls', () => {
      render(
        <DebuggerSidebar
          currentStep={2}
          total_steps={10}
          currentLine={5}
          canStepForward={true}
          canStepBackward={true}
          onStepForward={mockOnStepForward}
          onStepBackward={mockOnStepBackward}
          onJumpToFirst={mockOnJumpToFirst}
          onJumpToLast={mockOnJumpToLast}
          onExit={mockOnExit}
          onRequestTrace={mockOnRequestTrace}
          hasTrace={true}
          isLoading={false}
        />
      );

      expect(screen.getByText('Active Debugging')).toBeInTheDocument();
      expect(screen.getByText(/Step 3 of 10/)).toBeInTheDocument();
      expect(screen.getByText(/\(Line 5\)/)).toBeInTheDocument();
      expect(screen.getByText('⏮')).toBeInTheDocument();
      expect(screen.getByText('◀ Prev')).toBeInTheDocument();
      expect(screen.getByText('Next ▶')).toBeInTheDocument();
      expect(screen.getByText('⏭')).toBeInTheDocument();
    });

    it('calls onStepForward when next button is clicked', () => {
      render(
        <DebuggerSidebar
          currentStep={2}
          total_steps={10}
          currentLine={5}
          canStepForward={true}
          canStepBackward={true}
          onStepForward={mockOnStepForward}
          onStepBackward={mockOnStepBackward}
          onJumpToFirst={mockOnJumpToFirst}
          onJumpToLast={mockOnJumpToLast}
          onExit={mockOnExit}
          onRequestTrace={mockOnRequestTrace}
          hasTrace={true}
          isLoading={false}
        />
      );

      const nextButton = screen.getByText('Next ▶');
      fireEvent.click(nextButton);
      expect(mockOnStepForward).toHaveBeenCalledTimes(1);
    });

    it('calls onStepBackward when prev button is clicked', () => {
      render(
        <DebuggerSidebar
          currentStep={2}
          total_steps={10}
          currentLine={5}
          canStepForward={true}
          canStepBackward={true}
          onStepForward={mockOnStepForward}
          onStepBackward={mockOnStepBackward}
          onJumpToFirst={mockOnJumpToFirst}
          onJumpToLast={mockOnJumpToLast}
          onExit={mockOnExit}
          onRequestTrace={mockOnRequestTrace}
          hasTrace={true}
          isLoading={false}
        />
      );

      const prevButton = screen.getByText('◀ Prev');
      fireEvent.click(prevButton);
      expect(mockOnStepBackward).toHaveBeenCalledTimes(1);
    });

    it('calls onJumpToFirst when first button is clicked', () => {
      render(
        <DebuggerSidebar
          currentStep={2}
          total_steps={10}
          currentLine={5}
          canStepForward={true}
          canStepBackward={true}
          onStepForward={mockOnStepForward}
          onStepBackward={mockOnStepBackward}
          onJumpToFirst={mockOnJumpToFirst}
          onJumpToLast={mockOnJumpToLast}
          onExit={mockOnExit}
          onRequestTrace={mockOnRequestTrace}
          hasTrace={true}
          isLoading={false}
        />
      );

      const firstButton = screen.getByText('⏮');
      fireEvent.click(firstButton);
      expect(mockOnJumpToFirst).toHaveBeenCalledTimes(1);
    });

    it('calls onJumpToLast when last button is clicked', () => {
      render(
        <DebuggerSidebar
          currentStep={2}
          total_steps={10}
          currentLine={5}
          canStepForward={true}
          canStepBackward={true}
          onStepForward={mockOnStepForward}
          onStepBackward={mockOnStepBackward}
          onJumpToFirst={mockOnJumpToFirst}
          onJumpToLast={mockOnJumpToLast}
          onExit={mockOnExit}
          onRequestTrace={mockOnRequestTrace}
          hasTrace={true}
          isLoading={false}
        />
      );

      const lastButton = screen.getByText('⏭');
      fireEvent.click(lastButton);
      expect(mockOnJumpToLast).toHaveBeenCalledTimes(1);
    });

    it('calls onExit when exit button is clicked', () => {
      render(
        <DebuggerSidebar
          currentStep={2}
          total_steps={10}
          currentLine={5}
          canStepForward={true}
          canStepBackward={true}
          onStepForward={mockOnStepForward}
          onStepBackward={mockOnStepBackward}
          onJumpToFirst={mockOnJumpToFirst}
          onJumpToLast={mockOnJumpToLast}
          onExit={mockOnExit}
          onRequestTrace={mockOnRequestTrace}
          hasTrace={true}
          isLoading={false}
        />
      );

      const exitButton = screen.getByText('Exit');
      fireEvent.click(exitButton);
      expect(mockOnExit).toHaveBeenCalledTimes(1);
    });

    it('disables navigation buttons when at boundaries', () => {
      render(
        <DebuggerSidebar
          currentStep={0}
          total_steps={10}
          currentLine={1}
          canStepForward={true}
          canStepBackward={false}
          onStepForward={mockOnStepForward}
          onStepBackward={mockOnStepBackward}
          onJumpToFirst={mockOnJumpToFirst}
          onJumpToLast={mockOnJumpToLast}
          onExit={mockOnExit}
          onRequestTrace={mockOnRequestTrace}
          hasTrace={true}
          isLoading={false}
        />
      );

      expect(screen.getByText('⏮')).toBeDisabled();
      expect(screen.getByText('◀ Prev')).toBeDisabled();
      expect(screen.getByText('Next ▶')).not.toBeDisabled();
      expect(screen.getByText('⏭')).not.toBeDisabled();
    });

    it('shows truncation warning when trace is truncated', () => {
      render(
        <DebuggerSidebar
          currentStep={2}
          total_steps={10}
          currentLine={5}
          canStepForward={true}
          canStepBackward={true}
          onStepForward={mockOnStepForward}
          onStepBackward={mockOnStepBackward}
          onJumpToFirst={mockOnJumpToFirst}
          onJumpToLast={mockOnJumpToLast}
          onExit={mockOnExit}
          onRequestTrace={mockOnRequestTrace}
          hasTrace={true}
          isLoading={false}
          truncated={true}
        />
      );

      expect(screen.getByText(/Step limit exceeded/)).toBeInTheDocument();
    });
  });

  describe('dark theme', () => {
    it('applies dark theme classes', () => {
      const { container } = render(
        <DebuggerSidebar
          currentStep={0}
          total_steps={0}
          currentLine={0}
          canStepForward={false}
          canStepBackward={false}
          onStepForward={mockOnStepForward}
          onStepBackward={mockOnStepBackward}
          onJumpToFirst={mockOnJumpToFirst}
          onJumpToLast={mockOnJumpToLast}
          onExit={mockOnExit}
          onRequestTrace={mockOnRequestTrace}
          hasTrace={false}
          isLoading={false}
          darkTheme={true}
        />
      );

      const mainDiv = container.firstChild as HTMLElement;
      expect(mainDiv.className).toContain('bg-gray-800');
      expect(mainDiv.className).toContain('text-gray-200');
    });
  });

  describe('variables and call stack', () => {
    it('renders variables when trace is active', () => {
      render(
        <DebuggerSidebar
          currentStep={2}
          total_steps={10}
          currentLine={5}
          canStepForward={true}
          canStepBackward={true}
          onStepForward={mockOnStepForward}
          onStepBackward={mockOnStepBackward}
          onJumpToFirst={mockOnJumpToFirst}
          onJumpToLast={mockOnJumpToLast}
          onExit={mockOnExit}
          onRequestTrace={mockOnRequestTrace}
          hasTrace={true}
          isLoading={false}
          locals={{ x: 5, y: 10 }}
          globals={{ result: 15 }}
        />
      );

      expect(screen.getByText('Variables')).toBeInTheDocument();
      expect(screen.getByText('x')).toBeInTheDocument();
      expect(screen.getByText('result')).toBeInTheDocument();
    });

    it('renders call stack when trace is active', () => {
      render(
        <DebuggerSidebar
          currentStep={2}
          total_steps={10}
          currentLine={5}
          canStepForward={true}
          canStepBackward={true}
          onStepForward={mockOnStepForward}
          onStepBackward={mockOnStepBackward}
          onJumpToFirst={mockOnJumpToFirst}
          onJumpToLast={mockOnJumpToLast}
          onExit={mockOnExit}
          onRequestTrace={mockOnRequestTrace}
          hasTrace={true}
          isLoading={false}
          call_stack={[
            { function_name: '<module>', filename: '<string>', line: 10 },
            { function_name: 'helper', filename: '<string>', line: 5 }
          ]}
        />
      );

      expect(screen.getByText('Call Stack')).toBeInTheDocument();
    });
  });
});

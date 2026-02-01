/**
 * Unit tests for OutputPanel component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import OutputPanel from '../OutputPanel';

describe('OutputPanel', () => {
  describe('Empty state', () => {
    it('should show default empty state with guidance when no result', () => {
      render(<OutputPanel result={null} />);

      expect(screen.getByRole('heading', { name: 'Output' })).toBeInTheDocument();
      expect(screen.getByText('No output yet.')).toBeInTheDocument();
      expect(screen.getByText('Click the "Run Code" button to execute your code and see the output here.')).toBeInTheDocument();
    });

    it('should show running state when isRunning is true', () => {
      render(<OutputPanel result={null} isRunning={true} />);

      expect(screen.getByText('Executing your code...')).toBeInTheDocument();
      expect(screen.queryByText('No output yet.')).not.toBeInTheDocument();
    });

    it('should show not connected state when isConnected is false', () => {
      render(<OutputPanel result={null} isConnected={false} />);

      expect(screen.getByText('Not connected to the session.')).toBeInTheDocument();
      expect(screen.getByText('Please wait for the connection to be established before running code.')).toBeInTheDocument();
      expect(screen.queryByText('No output yet.')).not.toBeInTheDocument();
    });

    it('should prioritize running state over disconnected state', () => {
      render(<OutputPanel result={null} isRunning={true} isConnected={false} />);

      expect(screen.getByText('Executing your code...')).toBeInTheDocument();
      expect(screen.queryByText('Not connected to the session.')).not.toBeInTheDocument();
    });
  });

  describe('Success result', () => {
    const successResult = {
      success: true,
      output: 'Hello, World!',
      error: '',
      executionTime: 42,
    };

    it('should display output when result is successful', () => {
      render(<OutputPanel result={successResult} />);

      expect(screen.getByText('Hello, World!')).toBeInTheDocument();
      expect(screen.getByText('Execution time: 42ms')).toBeInTheDocument();
    });

    it('should not show empty state when result is present', () => {
      render(<OutputPanel result={successResult} />);

      expect(screen.queryByText('No output yet.')).not.toBeInTheDocument();
      expect(screen.queryByText('Executing your code...')).not.toBeInTheDocument();
    });
  });

  describe('Error result', () => {
    const errorResult = {
      success: false,
      output: '',
      error: 'SyntaxError: invalid syntax',
      executionTime: 5,
    };

    it('should display error message when result has error', () => {
      render(<OutputPanel result={errorResult} />);

      expect(screen.getByText('Error:')).toBeInTheDocument();
      expect(screen.getByText('SyntaxError: invalid syntax')).toBeInTheDocument();
      expect(screen.getByText('Execution time: 5ms')).toBeInTheDocument();
    });
  });

  describe('Result with stdin', () => {
    const resultWithStdin = {
      success: true,
      output: '10',
      error: '',
      executionTime: 15,
      stdin: '5\n5',
    };

    it('should display stdin when provided', () => {
      render(<OutputPanel result={resultWithStdin} />);

      expect(screen.getByText('Input provided:')).toBeInTheDocument();
      // Verify input section exists and contains the stdin value
      const inputSection = screen.getByText('Input provided:').closest('div');
      expect(inputSection).toBeInTheDocument();
      expect(inputSection?.querySelector('pre')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
    });
  });
});

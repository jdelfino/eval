/**
 * Tests for CaseResultDisplay component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CaseResultDisplay } from '../CaseResultDisplay';
import type { TestResult } from '@/types/problem';

const passedWithOutput: TestResult = {
  name: 'case1',
  type: 'io',
  status: 'passed',
  input: 'hello',
  expected: 'HELLO',
  actual: 'HELLO',
  time_ms: 10,
};

const failedWithDiff: TestResult = {
  name: 'case1',
  type: 'io',
  status: 'failed',
  input: 'hello',
  expected: 'HELLO',
  actual: 'hello',
  time_ms: 15,
};

const runOnlyResult: TestResult = {
  name: 'case_run_only',
  type: 'io',
  status: 'passed',
  actual: 'some output\n',
  time_ms: 8,
};

const errorResult: TestResult = {
  name: 'case_error',
  type: 'io',
  status: 'error',
  stderr: 'NameError: name "x" is not defined',
  time_ms: 5,
};

describe('CaseResultDisplay', () => {
  describe('no result (not yet run)', () => {
    it('shows not-run message when result is null', () => {
      render(<CaseResultDisplay result={null} caseName="case1" />);

      expect(screen.getByText(/not run/i)).toBeInTheDocument();
    });
  });

  describe('passed case with expected output', () => {
    it('shows green pass indicator', () => {
      render(<CaseResultDisplay result={passedWithOutput} caseName="case1" />);

      expect(screen.getByText(/pass/i)).toBeInTheDocument();
    });

    it('shows actual output', () => {
      render(<CaseResultDisplay result={passedWithOutput} caseName="case1" />);

      expect(screen.getByText('HELLO')).toBeInTheDocument();
    });
  });

  describe('failed case with expected output (diff)', () => {
    it('shows red fail indicator', () => {
      render(<CaseResultDisplay result={failedWithDiff} caseName="case1" />);

      expect(screen.getByText(/fail/i)).toBeInTheDocument();
    });

    it('shows expected vs actual diff', () => {
      render(<CaseResultDisplay result={failedWithDiff} caseName="case1" />);

      // Expected output "HELLO" should appear once
      expect(screen.getByText('HELLO')).toBeInTheDocument();
      // "hello" appears in both Input and Actual sections
      const helloElements = screen.getAllByText('hello');
      expect(helloElements.length).toBeGreaterThanOrEqual(1);
    });

    it('shows input in diff view', () => {
      render(<CaseResultDisplay result={failedWithDiff} caseName="case1" />);

      // Input label and value should be present
      expect(screen.getByText('Input:')).toBeInTheDocument();
    });

    it('labels expected and actual output', () => {
      render(<CaseResultDisplay result={failedWithDiff} caseName="case1" />);

      expect(screen.getByText(/expected/i)).toBeInTheDocument();
      expect(screen.getByText(/actual/i)).toBeInTheDocument();
    });
  });

  describe('run-only case (no expected output)', () => {
    it('shows actual output without pass/fail indicator', () => {
      render(<CaseResultDisplay result={runOnlyResult} caseName="case_run_only" />);

      expect(screen.getByText('some output')).toBeInTheDocument();
    });

    it('does not show expected output section', () => {
      render(<CaseResultDisplay result={runOnlyResult} caseName="case_run_only" />);

      expect(screen.queryByText(/expected/i)).not.toBeInTheDocument();
    });
  });

  describe('error case', () => {
    it('shows error message', () => {
      render(<CaseResultDisplay result={errorResult} caseName="case_error" />);

      expect(screen.getByText(/NameError: name "x" is not defined/i)).toBeInTheDocument();
    });

    it('shows error indicator badge', () => {
      render(<CaseResultDisplay result={errorResult} caseName="case_error" />);

      // The badge reads "Error" (capitalized)
      expect(screen.getByText('Error')).toBeInTheDocument();
    });
  });

  describe('isRunning state', () => {
    it('shows running indicator when isRunning is true', () => {
      render(<CaseResultDisplay result={null} caseName="case1" isRunning={true} />);

      expect(screen.getByText(/running/i)).toBeInTheDocument();
    });
  });

  describe('summary bar (run all results)', () => {
    it('shows summary when allResults provided', () => {
      const allResults: Record<string, TestResult> = {
        case1: passedWithOutput,
        case2: failedWithDiff,
      };
      render(
        <CaseResultDisplay
          result={passedWithOutput}
          caseName="case1"
          allResults={allResults}
          totalCases={2}
        />
      );

      // Should show summary like "1/2 cases passed"
      expect(screen.getByText(/1.*2.*case/i)).toBeInTheDocument();
    });
  });
});

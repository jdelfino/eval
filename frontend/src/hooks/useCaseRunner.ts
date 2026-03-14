/**
 * Hook for managing I/O test case execution state.
 *
 * Manages:
 * - caseResults: map of case name → TestResult
 * - selectedCase: currently selected case name
 * - isRunning: whether a test is currently executing
 * - error: last error message
 *
 * Supports both practice mode (via student work ID) and live session mode.
 */

import { useState, useCallback } from 'react';
import type { IOTestCase, TestResult } from '@/types/problem';
import { runTests, runSessionTests } from '@/lib/api/tests';

export interface CaseRunnerOptions {
  /** Student work ID for practice mode. Pass null for session mode. */
  workId: string | null;
  /** Session ID for live session mode. */
  sessionId?: string;
  /** Student user ID for live session mode. */
  studentId?: string;
  /** Current code for live session mode. */
  code?: string;
  /** Instructor-defined test cases from the problem. */
  instructorCases: IOTestCase[];
  /** Student-defined test cases from student_work. */
  studentCases: IOTestCase[];
}

export interface CaseRunnerResult {
  /** Map of case name → TestResult for executed cases. */
  caseResults: Record<string, TestResult>;
  /** Currently selected case name, or null if none selected. */
  selectedCase: string | null;
  /** Whether any test execution is in progress. */
  isRunning: boolean;
  /** Last error message, or null if no error. */
  error: string | null;
  /** Select or deselect a case. */
  selectCase: (name: string | null) => void;
  /** Run a single test case by name. */
  runCase: (caseName: string) => Promise<void>;
  /** Run all instructor + student cases. */
  runAllCases: () => Promise<void>;
  /** Clear all results and errors. */
  clearResults: () => void;
}

export function useCaseRunner({
  workId,
  sessionId,
  studentId,
  code,
  instructorCases,
  studentCases,
}: CaseRunnerOptions): CaseRunnerResult {
  const [caseResults, setCaseResults] = useState<Record<string, TestResult>>({});
  const [selectedCase, setSelectedCase] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectCase = useCallback((name: string | null) => {
    setSelectedCase(name);
  }, []);

  const clearResults = useCallback(() => {
    setCaseResults({});
    setError(null);
  }, []);

  /**
   * Execute a single test case and store its result.
   */
  const runCase = useCallback(async (caseName: string) => {
    setIsRunning(true);
    setError(null);

    try {
      let response;
      if (sessionId && studentId && code !== undefined) {
        response = await runSessionTests(sessionId, code, caseName);
      } else if (workId) {
        response = await runTests(workId, caseName);
      } else {
        throw new Error('Either workId or sessionId+studentId+code must be provided');
      }

      // Store the result keyed by case name
      const result = response.results.find(r => r.name === caseName);
      if (result) {
        setCaseResults(prev => ({ ...prev, [caseName]: result }));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Test execution failed');
    } finally {
      setIsRunning(false);
    }
  }, [workId, sessionId, studentId, code]);

  /**
   * Execute all instructor and student cases.
   * Runs them sequentially to avoid overwhelming the executor.
   */
  const runAllCases = useCallback(async () => {
    const allCases = [...instructorCases, ...studentCases];
    if (allCases.length === 0) return;

    setIsRunning(true);
    setError(null);

    try {
      for (const tc of allCases) {
        let response;
        if (sessionId && studentId && code !== undefined) {
          response = await runSessionTests(sessionId, code, tc.name);
        } else if (workId) {
          response = await runTests(workId, tc.name);
        } else {
          throw new Error('Either workId or sessionId+studentId+code must be provided');
        }

        const result = response.results.find(r => r.name === tc.name);
        if (result) {
          setCaseResults(prev => ({ ...prev, [tc.name]: result }));
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Test execution failed');
    } finally {
      setIsRunning(false);
    }
  }, [workId, sessionId, studentId, code, instructorCases, studentCases]);

  return {
    caseResults,
    selectedCase,
    isRunning,
    error,
    selectCase,
    runCase,
    runAllCases,
    clearResults,
  };
}

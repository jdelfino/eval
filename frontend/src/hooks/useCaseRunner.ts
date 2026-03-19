/**
 * Hook for managing I/O test case execution state.
 *
 * Executes test cases directly via POST /execute, passing code and case definitions
 * from frontend state. No dependency on student_work IDs or session IDs — the
 * frontend already has all the information needed.
 *
 * Manages:
 * - caseResults: map of case name → TestResult
 * - selectedCase: currently selected case name
 * - isRunning: whether a test is currently executing
 * - error: last error message
 */

import { useState, useCallback } from 'react';
import type { IOTestCase, TestResult } from '@/types/problem';
import { executeCode, FREE_RUN_CASE, type CaseDef } from '@/lib/api/execute';

export interface CaseRunnerOptions {
  /** Current code in the editor. */
  code?: string;
  /** Programming language. */
  language: string;
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

/** Convert an IOTestCase to a CaseDef for the execute endpoint. */
function toCaseDef(tc: IOTestCase): CaseDef {
  return {
    name: tc.name,
    input: tc.input,
    match_type: tc.match_type,
    expected_output: tc.expected_output,
    random_seed: tc.random_seed,
    attached_files: tc.attached_files,
  };
}

export function useCaseRunner({
  code,
  language,
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
   * Passes code and case definition directly to POST /execute.
   */
  const runCase = useCallback(async (caseName: string) => {
    if (!code || !language) {
      return;
    }

    setIsRunning(true);
    setError(null);

    try {
      const allCases = [...instructorCases, ...studentCases];
      const tc = allCases.find(c => c.name === caseName);
      if (!tc) throw new Error(`Case "${caseName}" not found`);

      const response = await executeCode(code, language, {
        cases: [toCaseDef(tc)],
      });

      const result = (response.results ?? []).find(r => r.name === caseName);
      if (result) {
        setCaseResults(prev => ({ ...prev, [caseName]: result }));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Test execution failed');
    } finally {
      setIsRunning(false);
    }
  }, [instructorCases, studentCases, code, language]);

  /**
   * Execute all instructor and student cases via a single POST /execute call.
   *
   * When there are no instructor or student cases (free-run mode), synthesizes
   * a single run-only case — the same behavior as clicking "Run Code".
   */
  const runAllCases = useCallback(async () => {
    if (!code || !language) {
      return;
    }

    const allCases = [...instructorCases, ...studentCases];

    // Free-run path: no instructor or student cases defined.
    if (allCases.length === 0) {
      setIsRunning(true);
      setError(null);

      try {
        const response = await executeCode(code, language, {
          cases: [FREE_RUN_CASE],
        });
        const result = (response.results ?? []).find(r => r.name === 'run');
        if (result) {
          setCaseResults(prev => ({ ...prev, run: result }));
          setSelectedCase('run');
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Code execution failed');
      } finally {
        setIsRunning(false);
      }
      return;
    }

    setIsRunning(true);
    setError(null);

    try {
      const response = await executeCode(code, language, {
        cases: allCases.map(toCaseDef),
      });

      const newResults: Record<string, TestResult> = {};
      for (const result of (response.results ?? [])) {
        newResults[result.name] = result;
      }
      setCaseResults(prev => ({ ...prev, ...newResults }));

      // Auto-select the first case so the output area shows a result immediately.
      if (allCases.length > 0) {
        setSelectedCase(prev => prev ?? allCases[0].name);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Test execution failed');
    } finally {
      setIsRunning(false);
    }
  }, [instructorCases, studentCases, code, language]);

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

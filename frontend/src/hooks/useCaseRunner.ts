import { useState, useCallback } from 'react';
import { executeCode, ioTestCasesToCaseDefs } from '@/lib/api/execute';
import type { CaseResult, CaseSummary, IOTestCase } from '@/types/api';

export interface CaseRunnerState {
  results: CaseResult[] | null;
  summary: CaseSummary | null;
  isRunning: boolean;
  error: string | null;
}

export interface CaseRunnerHook extends CaseRunnerState {
  /**
   * Run a set of test cases for the given code and language.
   *
   * Accepts IOTestCase[] including pytest cases (kind='pytest').
   * Returns typed CaseResult union — narrow on result.kind to access
   * kind-specific fields (CaseResultIO vs CaseResultPytest).
   *
   * @param code - Source code to execute
   * @param language - Programming language
   * @param testCases - Test cases to run (io and/or pytest)
   */
  runCases: (code: string, language: string, testCases: IOTestCase[]) => Promise<void>;
  reset: () => void;
}

/**
 * useCaseRunner — typed hook for running test cases and receiving a CaseResult union.
 *
 * Service-layer plumbing for F2.4. Wraps executeCode and translates IOTestCase[]
 * (including pytest cases) into typed CaseDef[], then returns CaseResult[] with the
 * kind discriminator preserved so consumers can narrow on result.kind.
 *
 * G1/G2 components build on top of this — they call runCases and dispatch on kind
 * to render the appropriate test rail or pytest assertion UI.
 *
 * Example:
 *   const { runCases, results } = useCaseRunner();
 *   await runCases(code, language, [{ kind: 'pytest', target_path: '...', test_code: '...' }]);
 *   // results[0].kind === 'pytest' → CaseResultPytest fields are accessible
 */
export function useCaseRunner(): CaseRunnerHook {
  const [state, setState] = useState<CaseRunnerState>({
    results: null,
    summary: null,
    isRunning: false,
    error: null,
  });

  const runCases = useCallback(async (
    code: string,
    language: string,
    testCases: IOTestCase[],
  ): Promise<void> => {
    setState(prev => ({ ...prev, isRunning: true, error: null }));

    try {
      const caseDefs = ioTestCasesToCaseDefs(testCases);
      const response = await executeCode(code, language, { cases: caseDefs });
      setState({
        results: response.results,
        summary: response.summary,
        isRunning: false,
        error: null,
      });
    } catch (err: unknown) {
      setState(prev => ({
        ...prev,
        isRunning: false,
        error: err instanceof Error ? err.message : 'Code execution failed',
      }));
    }
  }, []);

  const reset = useCallback(() => {
    setState({
      results: null,
      summary: null,
      isRunning: false,
      error: null,
    });
  }, []);

  return {
    ...state,
    runCases,
    reset,
  };
}

'use client';

import React from 'react';
import type { TestResult } from '@/types/problem';

interface CaseResultDisplayProps {
  /** The result for the currently selected/displayed case, or null if not run. */
  result: TestResult | null;
  /** The case name (for display context). */
  caseName: string;
  /** Whether this specific case is currently running. */
  isRunning?: boolean;
  /** All case results (used to compute summary bar). */
  allResults?: Record<string, TestResult>;
  /** Total number of cases (instructor + student) for the summary bar. */
  totalCases?: number;
}

/**
 * Renders the result of a single I/O test case in the output pane.
 *
 * Behaviors:
 * - null result + not running: "Not run yet" placeholder
 * - isRunning: spinner/running indicator
 * - passed, run-only (no expected): shows actual output without pass/fail badge
 * - passed, with expected output: green pass indicator + actual output
 * - failed: red fail indicator + diff of expected vs actual
 * - error: error message
 *
 * When allResults + totalCases are provided, a summary bar is shown at the top.
 */
export function CaseResultDisplay({
  result,
  caseName: _caseName,
  isRunning = false,
  allResults,
  totalCases,
}: CaseResultDisplayProps) {
  // Summary bar computation
  const showSummary = allResults !== undefined && totalCases !== undefined && totalCases > 0;
  const passedCount = showSummary
    ? Object.values(allResults!).filter(r => r.status === 'passed').length
    : 0;

  return (
    <div className="p-4 bg-gray-900 h-full overflow-y-auto text-sm">
      {/* Summary bar */}
      {showSummary && (
        <div className="mb-3 px-3 py-2 rounded bg-gray-800 border border-gray-700 text-gray-300 text-xs">
          {passedCount}/{totalCases} cases passed
        </div>
      )}

      {isRunning ? (
        <div className="flex items-center gap-2 text-blue-400">
          <span className="animate-spin text-base">⏳</span>
          <span>Running...</span>
        </div>
      ) : result === null ? (
        <div className="text-gray-400 italic">
          Not run yet. Click the run button to execute this case.
        </div>
      ) : result.status === 'error' ? (
        <ErrorResult result={result} />
      ) : result.expected !== undefined && result.expected !== '' ? (
        <TestResultWithExpected result={result} />
      ) : (
        <RunOnlyResult result={result} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ErrorResult({ result }: { result: TestResult }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-900 text-red-300 border border-red-700">
          Error
        </span>
        <span className="text-gray-400 text-xs">{result.time_ms}ms</span>
      </div>
      {result.stderr && (
        <pre className="bg-gray-800 text-red-300 p-3 rounded border border-red-900 text-xs font-mono whitespace-pre-wrap break-words">
          {result.stderr}
        </pre>
      )}
    </div>
  );
}

function TestResultWithExpected({ result }: { result: TestResult }) {
  const passed = result.status === 'passed';

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {passed ? (
          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-900 text-green-300 border border-green-700">
            Pass
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-900 text-red-300 border border-red-700">
            Fail
          </span>
        )}
        <span className="text-gray-400 text-xs">{result.time_ms}ms</span>
      </div>

      {!passed && result.input !== undefined && (
        <div className="mb-3">
          <div className="text-xs text-gray-400 mb-1 font-semibold">Input:</div>
          <pre className="bg-gray-800 text-gray-200 p-2 rounded border border-gray-700 text-xs font-mono whitespace-pre-wrap break-words">
            {result.input}
          </pre>
        </div>
      )}

      {!passed && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-xs text-green-400 mb-1 font-semibold">Expected:</div>
            <pre className="bg-gray-800 text-green-300 p-2 rounded border border-gray-700 text-xs font-mono whitespace-pre-wrap break-words">
              {result.expected}
            </pre>
          </div>
          <div>
            <div className="text-xs text-red-400 mb-1 font-semibold">Actual:</div>
            <pre className="bg-gray-800 text-red-300 p-2 rounded border border-red-900 text-xs font-mono whitespace-pre-wrap break-words">
              {result.actual}
            </pre>
          </div>
        </div>
      )}

      {passed && result.actual !== undefined && (
        <div>
          <div className="text-xs text-gray-400 mb-1 font-semibold">Output:</div>
          <pre className="bg-gray-800 text-green-200 p-2 rounded border border-gray-700 text-xs font-mono whitespace-pre-wrap break-words">
            {result.actual}
          </pre>
        </div>
      )}
    </div>
  );
}

function RunOnlyResult({ result }: { result: TestResult }) {
  const showSuccess = result.status === 'run';

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {showSuccess && (
          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-900 text-green-300 border border-green-700">
            ✓ Success
          </span>
        )}
        <span className="text-gray-400 text-xs">{result.time_ms}ms</span>
      </div>
      {result.actual !== undefined && (
        <div>
          <div className="text-xs text-gray-400 mb-1 font-semibold">Output:</div>
          <pre className="bg-gray-800 text-gray-200 p-2 rounded border border-gray-700 text-xs font-mono whitespace-pre-wrap break-words">
            {result.actual}
          </pre>
        </div>
      )}
    </div>
  );
}
